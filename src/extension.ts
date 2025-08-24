import * as vscode from 'vscode';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';

// AI model configuration interface
interface ModelConfig {
    name: string;
    provider: string;
    apiKey: string;
    baseUrl?: string;
    model: string;
    priority: number;
    enabled: boolean;
    quotaErrors?: string[];
}

// Chat message interface
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    modelUsed?: string;
}

// Default model configurations
const DEFAULT_MODELS: ModelConfig[] = [
    {
        name: 'DeepSeekR1 (OpenRouter)',
        provider: 'openrouter',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'deepseek/deepseek-r1:free',
        priority: 1,
        enabled: true,
        quotaErrors: [
            'insufficient_quota', 
            'rate_limit_exceeded', 
            'quota_exceeded',
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_credits',
            'daily limit exceeded'
        ]
    },
    {
        name: 'OpenAI GPT-4o Mini',
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        priority: 1,
        enabled: false,
        quotaErrors: [
            'insufficient_quota', 
            'rate_limit_exceeded', 
            'quota_exceeded',
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_credits',
            'daily limit exceeded'
        ]
    },
    {
        name: 'OpenAI GPT-4',
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4',
        priority: 2,
        enabled: false,
        quotaErrors: [
            'insufficient_quota', 
            'rate_limit_exceeded', 
            'quota_exceeded',
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_credits',
            'daily limit exceeded'
        ]
    },
    {
        name: 'Claude (via OpenRouter)',
        provider: 'openrouter',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3-haiku',
        priority: 3,
        enabled: false,
        quotaErrors: [
            'insufficient_quota', 
            'rate_limit_exceeded', 
            'quota_exceeded',
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_credits',
            'daily limit exceeded'
        ]
    },
    {
        name: 'Gemini (via OpenRouter)',
        provider: 'openrouter',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemini-pro',
        priority: 4,
        enabled: false,
        quotaErrors: [
            'insufficient_quota', 
            'rate_limit_exceeded', 
            'quota_exceeded',
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_credits',
            'daily limit exceeded'
        ]
    },
    {
        name: 'Local Ollama',
        provider: 'ollama',
        apiKey: 'dummy',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama2',
        priority: 5,
        enabled: false,
        quotaErrors: ['connection_error', 'model_not_found']
    }
];

class AIModelManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeDefaultModels();
    }

    private async initializeDefaultModels() {
        try {
            const config = vscode.workspace.getConfiguration('ai-helper');
            const inspection = config.inspect<ModelConfig[]>('models');
            
            console.log('Initializing models - current state:', {
                defaultValue: inspection?.defaultValue?.length || 0,
                globalValue: inspection?.globalValue?.length || 0,
                workspaceValue: inspection?.workspaceValue?.length || 0,
                effectiveValue: config.get<ModelConfig[]>('models', []).length
            });
            
            // Check if any configuration exists
            const hasUserConfig = inspection?.globalValue && inspection.globalValue.length > 0;
            const hasWorkspaceConfig = inspection?.workspaceValue && inspection.workspaceValue.length > 0;
            const hasFolderConfig = inspection?.workspaceFolderValue && inspection.workspaceFolderValue.length > 0;
            
            if (!hasUserConfig && !hasWorkspaceConfig && !hasFolderConfig) {
                console.log('No model configuration found in any scope, initializing defaults...');
                
                // Try to set in user settings first (Global scope)
                try {
                    await config.update('models', DEFAULT_MODELS, vscode.ConfigurationTarget.Global);
                    console.log('Successfully initialized models in user settings');
                } catch (globalError) {
                    console.warn('Failed to set models in user settings, trying workspace:', globalError);
                    
                    // Fallback to workspace settings
                    try {
                        await config.update('models', DEFAULT_MODELS, vscode.ConfigurationTarget.Workspace);
                        console.log('Successfully initialized models in workspace settings');
                    } catch (workspaceError) {
                        console.error('Failed to initialize models in any scope:', workspaceError);
                    }
                }
                
                // Verify the update
                setTimeout(() => {
                    const updatedConfig = vscode.workspace.getConfiguration('ai-helper');
                    const verifyModels = updatedConfig.get<ModelConfig[]>('models');
                    console.log('Models after initialization verification:', verifyModels?.length || 0);
                }, 500);
                
            } else {
                console.log('Found existing model configuration, checking for updates...');
                
                // Get the most specific configuration (folder > workspace > user)
                const existingModels = inspection?.workspaceFolderValue || 
                                     inspection?.workspaceValue || 
                                     inspection?.globalValue || 
                                     [];
                
                // Merge with defaults to ensure new default models are added
                const mergedModels = this.mergeWithDefaults(existingModels);
                
                if (mergedModels.length !== existingModels.length) {
                    console.log('Updating existing configuration with new defaults...');
                    
                    // Determine which scope to update based on where the existing config is
                    let targetScope = vscode.ConfigurationTarget.Global;
                    if (inspection?.workspaceFolderValue) {
                        targetScope = vscode.ConfigurationTarget.WorkspaceFolder;
                    } else if (inspection?.workspaceValue) {
                        targetScope = vscode.ConfigurationTarget.Workspace;
                    }
                    
                    await config.update('models', mergedModels, targetScope);
                    console.log('Updated existing configuration with new defaults');
                }
            }
        } catch (error) {
            console.error('Error during model initialization:', error);
        }
    }

    private mergeWithDefaults(existingModels: ModelConfig[]): ModelConfig[] {
        const existingNames = new Set(existingModels.map(m => m.name));
        const newDefaults = DEFAULT_MODELS.filter(defaultModel => 
            !existingNames.has(defaultModel.name)
        );
        
        if (newDefaults.length > 0) {
            console.log('Adding new default models:', newDefaults.map(m => m.name));
            return [...existingModels, ...newDefaults];
        }
        
        return existingModels;
    }

    private getModels(): ModelConfig[] {
        const config = vscode.workspace.getConfiguration('ai-helper');
        
        // Get the effective configuration (this reads from all scopes: user, workspace, folder)
        let models = config.get<ModelConfig[]>('models', []);
        
        console.log('Retrieved models from effective config:', models?.length || 0);
        
        // If no models found, try to get from different scopes explicitly
        if (!models || models.length === 0) {
            console.log('No models in effective config, checking individual scopes...');
            
            // Check the configuration inspection to see what's actually set
            const inspection = config.inspect<ModelConfig[]>('models');
            console.log('Config inspection:', {
                defaultValue: inspection?.defaultValue?.length || 0,
                globalValue: inspection?.globalValue?.length || 0,
                workspaceValue: inspection?.workspaceValue?.length || 0,
                workspaceFolderValue: inspection?.workspaceFolderValue?.length || 0
            });
            
            // Try to get from user settings (globalValue), then workspace, then defaults
            models = inspection?.globalValue || 
                     inspection?.workspaceValue || 
                     inspection?.workspaceFolderValue || 
                     inspection?.defaultValue ||
                     DEFAULT_MODELS;
            
            console.log('Using models from fallback:', models.length);
            
            // If still no models, use defaults and try to initialize
            if (!models || models.length === 0) {
                console.log('No models found in any scope, using and initializing defaults');
                models = DEFAULT_MODELS;
                // Trigger re-initialization in background
                this.initializeDefaultModels().catch(err => 
                    console.error('Failed to re-initialize defaults:', err)
                );
            }
        }
        
        // Ensure quotaErrors always exists, fallback to defaults
        return models.map(m => ({
            ...m,
            quotaErrors: m.quotaErrors ?? [
                'insufficient_quota',
                'rate_limit_exceeded',
                'quota_exceeded'
            ]
        }));
    }

    getEnabledModels(): ModelConfig[] {
        const models = this.getModels();
        console.log('All models from config:', models.length);
        
        const enabled = models
            .filter(model => {
                const isEnabled = model.enabled && this.hasValidApiKey(model);
                console.log(`Model ${model.name}: enabled=${model.enabled}, hasValidKey=${this.hasValidApiKey(model)}, final=${isEnabled}`);
                return isEnabled;
            })
            .sort((a, b) => a.priority - b.priority);
            
        console.log('Enabled models:', enabled.length);
        return enabled;
    }

    private hasValidApiKey(model: ModelConfig): boolean {
        // Ollama doesn't need a real API key
        if (model.provider === 'ollama') {
            return true;
        }
        return typeof model.apiKey === 'string' && model.apiKey.trim() !== '';
    }

    getAllModels(): ModelConfig[] {
        return this.getModels();
    }

    // Force refresh models from configuration
    public refreshFromConfig(): void {
        console.log('Force refreshing models from configuration');
        this.debugConfigurationState();
        // This will cause getModels to re-read from config
    }

    private debugConfigurationState(): void {
        const config = vscode.workspace.getConfiguration('ai-helper');
        const inspection = config.inspect<ModelConfig[]>('models');
        
        console.log('=== Configuration Debug ===');
        console.log('Default value:', inspection?.defaultValue?.length || 0, 'models');
        console.log('User/Global value:', inspection?.globalValue?.length || 0, 'models');
        console.log('Workspace value:', inspection?.workspaceValue?.length || 0, 'models');
        console.log('Folder value:', inspection?.workspaceFolderValue?.length || 0, 'models');
        console.log('Effective value:', config.get<ModelConfig[]>('models', []).length, 'models');
        console.log('========================');
    }

    private isQuotaError(error: any, model: ModelConfig): boolean {
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code?.toLowerCase() || '';

        const openRouterQuotaErrors = [
            'rate limit exceeded',
            'free-models-per-day',
            'insufficient_quota',
            'quota_exceeded',
            'insufficient_credits',
            'rate_limit_exceeded',
            'quota limit reached',
            'insufficient funds',
            'daily limit exceeded',
            'monthly limit exceeded'
        ];

        const defaultQuotaErrors = [
            'insufficient_quota',
            'rate_limit_exceeded',
            'quota_exceeded'
        ];

        const quotaErrors = model.provider === 'openrouter' 
            ? [...openRouterQuotaErrors, ...(model.quotaErrors ?? [])]
            : (model.quotaErrors ?? defaultQuotaErrors);
        
        const isQuotaError = quotaErrors.some(quotaError => 
            errorMessage.includes(quotaError.toLowerCase()) || 
            errorCode.includes(quotaError.toLowerCase())
        );

        console.log(`Is quota error: ${isQuotaError} for model ${model.name}`);
        return isQuotaError;
    }

    async makeRequest(prompt: string, isCompletion: boolean = false): Promise<{ response: string; modelUsed: string }> {
        const enabledModels = this.getEnabledModels();
        
        if (enabledModels.length === 0) {
            throw new Error('No enabled AI models with API keys configured. Please configure at least one model in settings.');
        }

        for (const model of enabledModels) {
            try {
                const client = await this.createClient(model);
                const response = await this.callModel(client, model, prompt, isCompletion);
                return { response, modelUsed: model.name };
            } catch (error: any) {
                console.log(`Model ${model.name} failed:`, error.message);
                
                if (this.isQuotaError(error, model)) {
                    console.log(`Quota exceeded for ${model.name}, trying next model...`);
                    continue;
                } else {
                    continue;
                }
            }
        }
        
        throw new Error('All enabled AI models have exhausted their quotas or failed');
    }

    private async createClient(model: ModelConfig): Promise<any> {
        if (model.provider === 'openrouter') {
            return createOpenRouter({
                apiKey: model.apiKey,
                baseURL: model.baseUrl || 'https://openrouter.ai/api/v1'
            });
        } else {
            const OpenAI = (await import('openai')).default;
            const config: any = { apiKey: model.apiKey };
            if (model.baseUrl) {
                config.baseURL = model.baseUrl;
            }
            return new OpenAI(config);
        }
    }

    private async callModel(client: any, model: ModelConfig, prompt: string, isCompletion: boolean): Promise<string> {
        if (model.provider === 'openrouter') {
            try {
                const modelInstance = client(model.model);
                
                if (isCompletion) {
                    const { text } = await generateText({
                        model: modelInstance,
                        messages: [
                            { 
                                role: 'system', 
                                content: 'You are a code completion assistant. Complete the code naturally and concisely. Only provide the completion, not explanations.' 
                            },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3
                    });
                    return text || '';
                } else {
                    const { text } = await generateText({
                        model: modelInstance,
                        prompt: prompt,
                        temperature: 0.7
                    });
                    return text || 'No response generated.';
                }
            } catch (error: any) {
                console.error('OpenRouter API error:', error);
                throw error;
            }
        } else {
            if (isCompletion) {
                const response = await client.chat.completions.create({
                    model: model.model,
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are a code completion assistant. Complete the code naturally and concisely. Only provide the completion, not explanations.' 
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 200
                });
                return response.choices[0]?.message?.content || '';
            } else {
                const response = await client.chat.completions.create({
                    model: model.model,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                });
                return response.choices[0]?.message?.content || 'No response generated.';
            }
        }
    }
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ai-helper.chatView';
    
    private _view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    private modelManager: AIModelManager;

    constructor(private readonly _extensionUri: vscode.Uri, modelManager: AIModelManager) {
        this.modelManager = modelManager;
    }

    // Public method to refresh models from external commands
    public refreshModels() {
        console.log('ChatViewProvider: refreshModels called');
        this.modelManager.refreshFromConfig();
        this.sendModelsToWebview();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'getModels':
                    console.log('Webview requested models, sending update...');
                    this.modelManager.refreshFromConfig();
                    this.sendModelsToWebview();
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'ai-helper');
                    break;
                case 'toggleModelEnabled':
                    {
                        const config = vscode.workspace.getConfiguration('ai-helper');
                        const allModels = config.get<ModelConfig[]>('models') || [];
                        if (allModels[data.modelIndex]) {
                            allModels[data.modelIndex].enabled = data.enabled;
                            await config.update('models', allModels, vscode.ConfigurationTarget.Global);
                            // Send updated models back to webview
                            this.sendModelsToWebview();
                        }
                    }
                    break;
                case 'toggleAutocomplete':
                    {
                        const config = vscode.workspace.getConfiguration('ai-helper');
                        await config.update('enableCompletion', data.enabled, vscode.ConfigurationTarget.Global);

                        // Echo the new state back to the webview for synchronization
                        this._view?.webview.postMessage({
                            type: 'updateAutocomplete',
                            enabled: data.enabled
                        });

                        // Show notification
                        this._view?.webview.postMessage({
                            type: 'showMessage',
                            message: `Autocomplete is now ${data.enabled ? 'enabled' : 'disabled'}.`,
                            messageType: 'success'
                        });
                    }
                    break;
            }
        });

        // Load previous messages
        this.loadMessages();
        
        // Send models after a short delay to ensure everything is loaded
        setTimeout(() => {
            this.sendModelsToWebview();
        }, 500);
    }

    private async handleUserMessage(message: string) {
        if (!message.trim()) return;

        // Add user message
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        
        this.messages.push(userMessage);
        this.updateWebview();
        this.saveMessages();

        try {
            // Get AI response
            const { response, modelUsed } = await this.modelManager.makeRequest(message);
            
            // Add AI response
            const aiMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
                modelUsed: modelUsed
            };
            
            this.messages.push(aiMessage);
            this.updateWebview();
            this.saveMessages();
        } catch (error: any) {
            // Add error message
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'system',
                content: `Error: ${error.message}`,
                timestamp: Date.now()
            };
            
            this.messages.push(errorMessage);
            this.updateWebview();
            this.saveMessages();
        }
    }

    private clearChat() {
        this.messages = [];
        this.updateWebview();
        this.saveMessages();
    }

    private updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages
            });
        }
    }

    private sendModelsToWebview() {
        if (this._view) {
            const enabledModels = this.modelManager.getEnabledModels();
            const allModels = this.modelManager.getAllModels();
            console.log('Sending models to webview:', enabledModels.length, 'enabled out of', allModels.length, 'total models');
            this._view.webview.postMessage({
                type: 'updateModels',
                enabledModels: enabledModels,
                allModels: allModels
            });
        } else {
            console.log('Webview not available, cannot send models');
        }
    }

    private saveMessages() {
        const config = vscode.workspace.getConfiguration('ai-helper');
        config.update('chatHistory', this.messages, vscode.ConfigurationTarget.Global);
    }

    private loadMessages() {
        const config = vscode.workspace.getConfiguration('ai-helper');
        const savedMessages = config.get<ChatMessage[]>('chatHistory', []);
        this.messages = savedMessages;
        this.updateWebview();
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the path to the HTML file
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'chat.html');
        
        try {
            // Read the HTML file
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            
            // Replace any placeholders if needed (like resource URLs)
            // For example, if you have images or other resources:
            // htmlContent = htmlContent.replace(/{{\s*resource\s*}}/g, 
            //     webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media')).toString());
            
            return htmlContent;
        } catch (error) {
            // Fallback to a simple error message if the file can't be read
            console.error('Failed to load HTML file:', error);
            return `<!DOCTYPE html>
            <html>
            <body>
                <h1>Error Loading Chat Interface</h1>
                <p>Failed to load the chat interface. Please check the console for details.</p>
            </body>
            </html>`;
        }
    }
}

class AICompletionProvider implements vscode.InlineCompletionItemProvider {
    private modelManager: AIModelManager;
    private isEnabled: boolean = false;

    constructor(modelManager: AIModelManager) {
        this.modelManager = modelManager;
    }

    setEnabled(enabled: boolean) {
        this.isEnabled = enabled;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        if (!this.isEnabled) {
            return null;
        }

        try {
            const linePrefix = document.lineAt(position).text.substr(0, position.character);
            const startLine = Math.max(0, position.line - 10);
            const contextRange = new vscode.Range(startLine, 0, position.line, position.character);
            const context_text = document.getText(contextRange);
            
            const prompt = `Complete this code:\n\n${context_text}\n\nComplete the current line: ${linePrefix}`;
            
            const { response } = await this.modelManager.makeRequest(prompt, true);
            
            if (response && response.trim()) {
                let suggestion = response.trim();
                if (suggestion.startsWith(linePrefix)) {
                    suggestion = suggestion.slice(linePrefix.length).replace(/^\s+/, '');
                }
                return [new vscode.InlineCompletionItem(suggestion)];
            }
        } catch (error) {
            console.error('AI completion error:', error);
        }
        
        return null;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Helper Pro extension is being activated');
    
    const modelManager = new AIModelManager(context);
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