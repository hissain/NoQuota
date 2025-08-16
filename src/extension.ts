import * as vscode from 'vscode';
import OpenAI from 'openai';

// This extension provides AI-powered suggestions based on selected text in the editor.

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('ai-helper.suggest', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No text selected');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text) {
            vscode.window.showInformationMessage('Please select some text.');
            return;
        }

        let apiKey = process.env.OPENAI_API_KEY || vscode.workspace.getConfiguration('ai-helper').get('apiKey') as string;
        if (!apiKey) {
            let apiKey: string | undefined;
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your API key'
            });
            if (!apiKey) return;
        }

        const client = new OpenAI({ apiKey });

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating AI suggestion...",
            cancellable: false
        }, async () => {
            try {
                const response = await client.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'user', content: `Provide a helpful suggestion for this text: "${text}"` }
                    ],
                    temperature: 0.7
                });

                const suggestion = response.choices[0]?.message?.content || 'No suggestion generated.';
                vscode.window.showInformationMessage(`AI Suggestion: ${suggestion}`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`AI request failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
