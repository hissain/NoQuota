import * as vscode from 'vscode';
import { loadDefaultModels } from './utils';
import { ModelConfig, ChatMessage } from './types';
import { AIModelManager } from './modelManager';
import { ChatViewProvider } from './chatViewProvider';
import { AICompletionProvider } from './completionProvider';

let DEFAULT_MODELS: ModelConfig[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Helper Pro extension is being activated');
    
    // Load default models from file
    DEFAULT_MODELS = loadDefaultModels(context);
    console.log('Default models loaded:', DEFAULT_MODELS);

    const modelManager = new AIModelManager(context, DEFAULT_MODELS);
    const completionProvider = new AICompletionProvider(modelManager);
    const chatProvider = new ChatViewProvider(context.extensionUri, modelManager);

    // Register the chat view
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

    // Initialize completion state from settings
    const config = vscode.workspace.getConfiguration('ai-helper');
    const completionEnabled = config.get('enableCompletion', false);
    completionProvider.setEnabled(completionEnabled);

    // Register completion provider
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        completionProvider
    );

    // AI Suggestion command
    const suggestCommand = vscode.commands.registerCommand('ai-helper.suggest', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const language = editor.document.languageId; // e.g., 'python', 'typescript'
        const filename = editor.document.fileName;
        const codeBefore = editor.document.getText(new vscode.Range(
            new vscode.Position(0, 0),
            editor.selection.start
        ));
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text) {
            vscode.window.showInformationMessage('Please select some text.');
            return;
        }

        // New context prompt
        const contextPrompt = `You are completing code for a ${language} file named ${filename}.\n` +
                              `Here is the code so far:\n${codeBefore}\nContinue:`;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating AI suggestion...",
            cancellable: false
        }, async () => {
            try {
                const { response } = await modelManager.makeRequest(contextPrompt);
                vscode.window.showInformationMessage(`AI Suggestion: ${response}`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`AI request failed: ${error.message}`);
            }
        });
    });

    // Open Settings command
    const openSettingsCommand = vscode.commands.registerCommand('ai-helper.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'ai-helper');
    });

    // Add Model command - Opens settings with a focus on models
    const addModelCommand = vscode.commands.registerCommand('ai-helper.addModel', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'ai-helper.models');
        vscode.window.showInformationMessage('Add your AI models in the settings. Edit the JSON array to add new models.');
    });

    // Refresh Models command
    const refreshModelsCommand = vscode.commands.registerCommand('ai-helper.refreshModels', async () => {
        // Force refresh by sending updated models to webview
        console.log('Manual refresh triggered');
        chatProvider.refreshModels();
        vscode.window.showInformationMessage('AI models refreshed.');
    });

    // Toggle completion command
    const toggleCompletionCommand = vscode.commands.registerCommand('ai-helper.toggleCompletion', async () => {
        await toggleCompletion(completionProvider);
    });

    // Open chat command
    const openChatCommand = vscode.commands.registerCommand('ai-helper.openChat', async () => {
        await vscode.commands.executeCommand('ai-helper.chatView.focus');
    });

    // Listen for configuration changes with better detection
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        console.log('Configuration change detected');
        
        if (e.affectsConfiguration('ai-helper.models')) {
            console.log('AI Helper models configuration changed, refreshing chat provider...');
            // Use longer delay to ensure VS Code has fully processed the change
            setTimeout(() => {
                chatProvider.refreshModels();
            }, 1000);
        }
        
        if (e.affectsConfiguration('ai-helper.enableCompletion')) {
            const config = vscode.workspace.getConfiguration('ai-helper');
            const enabled = config.get<boolean>('enableCompletion', false);
            completionProvider.setEnabled(enabled);
            console.log('AI completion toggled:', enabled);

            // --- Add this block to sync with webview ---
            if (chatProvider['_view']) {
                chatProvider['_view'].webview.postMessage({
                    type: 'updateAutocomplete',
                    enabled
                });
            }
        }
    });

    context.subscriptions.push(
        suggestCommand,
        openSettingsCommand,
        addModelCommand,
        refreshModelsCommand,
        toggleCompletionCommand,
        openChatCommand,
        completionDisposable,
        configChangeListener
    );

    // Show initialization message after a delay to ensure everything is ready
    setTimeout(() => {
        console.log('AI Helper Pro extension activated successfully');
        vscode.window.showInformationMessage('AI Helper Pro is ready! Check the Activity Bar for the chat interface.');
    }, 1000);
}

async function toggleCompletion(completionProvider: AICompletionProvider) {
    const config = vscode.workspace.getConfiguration('ai-helper');
    const enabled = config.get<boolean>('enableCompletion', false);
    const newEnabled = !enabled;

    await config.update('enableCompletion', newEnabled, vscode.ConfigurationTarget.Global);
    completionProvider.setEnabled(newEnabled);

    vscode.window.showInformationMessage(`AI inline completion is now ${newEnabled ? 'enabled' : 'disabled'}.`);
}

export function deactivate() {}