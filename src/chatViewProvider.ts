import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage, ModelConfig } from './types';
import { AIModelManager } from './modelManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ai-helper.chatView';
    
    private _view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    private modelManager: AIModelManager;

    constructor(private readonly _extensionUri: vscode.Uri, modelManager: AIModelManager) {
        this.modelManager = modelManager;
    }

    public refreshModels() {
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
                    this.modelManager.refreshFromConfig();
                    this.sendModelsToWebview();
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'ai-helper');
                    break;
                case 'toggleModelEnabled':
                    {
                        const config = vscode.workspace.getConfiguration('ai-helper');
                        const inspection = config.inspect<ModelConfig[]>('models');
                        let allModels: ModelConfig[] = [];
                        let targetScope: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global;

                        if (inspection?.workspaceFolderValue && inspection.workspaceFolderValue.length > 0) {
                            allModels = [...inspection.workspaceFolderValue];
                            targetScope = vscode.ConfigurationTarget.WorkspaceFolder;
                        } else if (inspection?.workspaceValue && inspection.workspaceValue.length > 0) {
                            allModels = [...inspection.workspaceValue];
                            targetScope = vscode.ConfigurationTarget.Workspace;
                        } else if (inspection?.globalValue && inspection.globalValue.length > 0) {
                            allModels = [...inspection.globalValue];
                            targetScope = vscode.ConfigurationTarget.Global;
                        } else if (inspection?.defaultValue && inspection.defaultValue.length > 0) {
                            allModels = [...inspection.defaultValue];
                            targetScope = vscode.ConfigurationTarget.Global;
                        }

                        if (allModels[data.modelIndex]) {
                            allModels[data.modelIndex].enabled = data.enabled;
                            await config.update('models', allModels, targetScope);
                            this.sendModelsToWebview();
                        }
                    }
                    break;
                case 'toggleAutocomplete':
                    {
                        const config = vscode.workspace.getConfiguration('ai-helper');
                        await config.update('enableCompletion', data.enabled, vscode.ConfigurationTarget.Global);

                        this._view?.webview.postMessage({
                            type: 'updateAutocomplete',
                            enabled: data.enabled
                        });

                        this._view?.webview.postMessage({
                            type: 'showMessage',
                            message: `Autocomplete is now ${data.enabled ? 'enabled' : 'disabled'}.`,
                            messageType: 'success'
                        });
                    }
                    break;
            }
        });

        this.loadMessages();
        setTimeout(() => {
            this.sendModelsToWebview();
        }, 500);
    }

    private async handleUserMessage(message: string) {
        if (!message.trim()) return;

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
            const { response, modelUsed } = await this.modelManager.makeRequest(message);
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
            this._view.webview.postMessage({
                type: 'updateModels',
                enabledModels: enabledModels,
                allModels: allModels
            });
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
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'chat.html');
        try {
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            return htmlContent;
        } catch (error) {
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
