import * as vscode from 'vscode';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

// AI model configuration interface
interface ModelConfig {
    name: string;
    provider: string;
    apiKey: string;
    baseUrl?: string;
    model: string;
    priority: number;
    enabled: boolean;
    quotaErrors: string[];
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
    private models: ModelConfig[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadModels();
    }

    private loadModels() {
        const config = vscode.workspace.getConfiguration('ai-helper');
        const savedModels = config.get<ModelConfig[]>('models');
        
        if (savedModels && savedModels.length > 0) {
            // Ensure quotaErrors always exists, fallback to defaults
            this.models = savedModels.map(m => ({
                ...m,
                quotaErrors: m.quotaErrors ?? [
                    'insufficient_quota',
                    'rate_limit_exceeded',
                    'quota_exceeded'
                ]
            }));
        } else {
            this.models = DEFAULT_MODELS;
            this.saveModels();
        }
    }

    private async saveModels() {
        const config = vscode.workspace.getConfiguration('ai-helper');
        await config.update('models', this.models, vscode.ConfigurationTarget.Global);
    }

    getEnabledModels(): ModelConfig[] {
        return this.models
            .filter(model => model.enabled && model.apiKey)
            .sort((a, b) => a.priority - b.priority);
    }

    async addModel(model: ModelConfig): Promise<void> {
        this.models.push(model);
        await this.saveModels();
    }

    async removeModel(modelName: string): Promise<void> {
        this.models = this.models.filter(m => m.name !== modelName);
        await this.saveModels();
    }

    async updateModel(modelName: string, updates: Partial<ModelConfig>): Promise<void> {
        const index = this.models.findIndex(m => m.name === modelName);
        if (index !== -1) {
            this.models[index] = { ...this.models[index], ...updates };
            await this.saveModels();
        }
    }

    getAllModels(): ModelConfig[] {
        return this.models;
    }

    private isQuotaError(error: any, model: ModelConfig): boolean {
        // console.log(`Checking quota error for ${model.name}:`, {
        //         errorMessage: error.message,
        //         errorCode: error.code,
        //         errorType: error.constructor.name,
        //         fullError: error
        //     });

        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code?.toLowerCase() || '';

        // OpenRouter specific error patterns (more comprehensive)
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

        // Default quota errors for other providers
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

    async makeRequest(prompt: string, isCompletion: boolean = false): Promise<string> {
        const enabledModels = this.getEnabledModels();
        
        if (enabledModels.length === 0) {
            throw new Error('No enabled AI models with API keys configured. Please configure at least one model.');
        }

        for (const model of enabledModels) {
            try {
                const client = await this.createClient(model);
                const response = await this.callModel(client, model, prompt, isCompletion);
                return response;
            } catch (error: any) {
                console.log(`Model ${model.name} failed:`, error.message);
                
                if (this.isQuotaError(error, model)) {
                    console.log(`Quota exceeded for ${model.name}, trying next model...`);
                    continue;
                } else {
                    // console.log(`Non-quota error for ${model.name}:`, error.message);
                    // if (enabledModels.indexOf(model) === enabledModels.length - 1) {
                    //     throw error;
                    // }
                    continue;
                }
            }
        }
        
        throw new Error('All enabled AI models have exhausted their quotas or failed');
    }

    private async createClient(model: ModelConfig): Promise<any> {
        if (model.provider === 'openrouter') {
            // Use OpenRouter's official SDK
            return createOpenRouter({
                apiKey: model.apiKey,
                baseURL: model.baseUrl || 'https://openrouter.ai/api/v1'
            });
        } else {
            // Use OpenAI SDK for OpenAI models
            const OpenAI = (await import('openai')).default;
            const config: any = { apiKey: model.apiKey };
            if (model.baseUrl) {
                config.baseURL = model.baseUrl;
            }
            return new OpenAI(config);
        }
    }

    // Also update your callModel method to add more debugging:

    private async callModel(client: any, model: ModelConfig, prompt: string, isCompletion: boolean): Promise<string> {
        if (model.provider === 'openrouter') {
            // Use AI SDK with OpenRouter
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
                        temperature: 0.3,
                        maxTokens: 200
                    });
                    return text || '';
                } else {
                    const { text } = await generateText({
                        model: modelInstance,
                        prompt: `Provide a helpful suggestion for this text: "${prompt}"`,
                        temperature: 0.7
                    });
                    return text || 'No suggestion generated.';
                }
            } catch (error: any) {
                console.error('OpenRouter API error:', error);
                throw error;
            }
        } else {
            // Use OpenAI client for other providers
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
                        { role: 'user', content: `Provide a helpful suggestion for this text: "${prompt}"` }
                    ],
                    temperature: 0.7
                });
                return response.choices[0]?.message?.content || 'No suggestion generated.';
            }
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

        // Don't provide completions if user is just typing normally
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            const line = document.lineAt(position.line).text;
            // Only trigger on specific patterns (e.g., after comments, function declarations)
            if (!line.includes('//') && !line.includes('function') && !line.includes('const') && !line.includes('let')) {
                return null;
            }
        }

        try {
            const linePrefix = document.lineAt(position).text.substr(0, position.character);
            const lineSuffix = document.lineAt(position).text.substr(position.character);
            
            // Get context (previous few lines)
            const startLine = Math.max(0, position.line - 10);
            const contextRange = new vscode.Range(startLine, 0, position.line, position.character);
            const context_text = document.getText(contextRange);
            
            const prompt = `Complete this code:\n\n${context_text}\n\nComplete the current line: ${linePrefix}`;
            
            const completion = await this.modelManager.makeRequest(prompt, true);
            
            if (completion && completion.trim()) {
                return [new vscode.InlineCompletionItem(completion.trim())];
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

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating AI suggestion...",
            cancellable: false
        }, async () => {
            try {
                const suggestion = await modelManager.makeRequest(text);
                vscode.window.showInformationMessage(`AI Suggestion: ${suggestion}`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`AI request failed: ${error.message}`);
            }
        });
    });

    // Configure Models command
    const configureCommand = vscode.commands.registerCommand('ai-helper.configure', async () => {
        console.log('Configure command called');
        try {
            const action = await vscode.window.showQuickPick([
                'View Models',
                'Add Model',
                'Edit Model',
                'Delete Model',
                'Toggle Completion'
            ], { placeHolder: 'Choose an action' });

            if (!action) {
                return;
            }

            switch (action) {
                case 'View Models':
                    await showModels(modelManager);
                    break;
                case 'Add Model':
                    await addNewModel(modelManager);
                    break;
                case 'Edit Model':
                    await editModel(modelManager);
                    break;
                case 'Delete Model':
                    await deleteModel(modelManager);
                    break;
                case 'Toggle Completion':
                    await toggleCompletion(completionProvider);
                    break;
            }
        } catch (error: any) {
            console.error('Configure command error:', error);
            vscode.window.showErrorMessage(`Configuration error: ${error.message}`);
        }
    });

    // Toggle completion command
    const toggleCompletionCommand = vscode.commands.registerCommand('ai-helper.toggleCompletion', async () => {
        await toggleCompletion(completionProvider);
    });

    // Test command to verify extension is working
    const testCommand = vscode.commands.registerCommand('ai-helper.test', async () => {
        vscode.window.showInformationMessage('AI Helper Pro is working! Extension loaded successfully.');
    });

    context.subscriptions.push(
        suggestCommand,
        configureCommand,
        toggleCompletionCommand,
        testCommand,
        completionDisposable
    );

    console.log('AI Helper Pro extension activated successfully');
    vscode.window.showInformationMessage('AI Helper Pro is ready! Use Ctrl+Shift+P and search for "AI Helper" commands.');
}

async function showModels(modelManager: AIModelManager) {
    const models = modelManager.getAllModels();
    const items = models.map(model => ({
        label: `${model.name} ${model.enabled ? '✓' : '✗'}`,
        description: `Priority: ${model.priority}, Provider: ${model.provider}`,
        detail: `Model: ${model.model}, API Key: ${model.apiKey ? '***' : 'Not set'}`
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Current AI Models (✓ = enabled, ✗ = disabled)'
    });
}

async function addNewModel(modelManager: AIModelManager) {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter model name'
    });
    if (!name) return;

    const provider = await vscode.window.showQuickPick([
        'openai',
        'openrouter',
        'ollama',
        'custom'
    ], { placeHolder: 'Select provider' });
    if (!provider) return;

    const model = await vscode.window.showInputBox({
        prompt: 'Enter model identifier (e.g., gpt-4, claude-3-haiku)'
    });
    if (!model) return;

    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter API key',
        password: true
    });
    if (!apiKey) return;

    let baseUrl = '';
    if (provider !== 'openai') {
        baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter base URL (optional)'
        }) || '';
    }

    const priority = await vscode.window.showInputBox({
        prompt: 'Enter priority (1 = highest)',
        value: '1'
    });

    const newModel: ModelConfig = {
        name,
        provider,
        apiKey,
        model,
        priority: parseInt(priority || '1'),
        enabled: true,
        quotaErrors: ['insufficient_quota', 'rate_limit_exceeded', 'quota_exceeded'],
        ...(baseUrl && { baseUrl })
    };

    await modelManager.addModel(newModel);
    vscode.window.showInformationMessage(`Model ${name} added successfully!`);
}

async function editModel(modelManager: AIModelManager) {
    const models = modelManager.getAllModels();
    const modelItems = models.map(m => ({ label: m.name, model: m }));
    
    const selected = await vscode.window.showQuickPick(modelItems, {
        placeHolder: 'Select model to edit'
    });
    if (!selected) return;

    const field = await vscode.window.showQuickPick([
        'API Key',
        'Priority',
        'Enabled/Disabled',
        'Base URL'
    ], { placeHolder: 'What would you like to edit?' });

    switch (field) {
        case 'API Key':
            const newApiKey = await vscode.window.showInputBox({
                prompt: 'Enter new API key',
                password: true,
                value: selected.model.apiKey
            });
            if (newApiKey !== undefined) {
                await modelManager.updateModel(selected.model.name, { apiKey: newApiKey });
            }
            break;
        case 'Priority':
            const newPriority = await vscode.window.showInputBox({
                prompt: 'Enter new priority (1 = highest)',
                value: selected.model.priority.toString()
            });
            if (newPriority) {
                await modelManager.updateModel(selected.model.name, { priority: parseInt(newPriority) });
            }
            break;
        case 'Enabled/Disabled':
            await modelManager.updateModel(selected.model.name, { enabled: !selected.model.enabled });
            vscode.window.showInformationMessage(`${selected.model.name} ${!selected.model.enabled ? 'enabled' : 'disabled'}`);
            break;
        case 'Base URL':
            const newBaseUrl = await vscode.window.showInputBox({
                prompt: 'Enter new base URL',
                value: selected.model.baseUrl || ''
            });
            if (newBaseUrl !== undefined) {
                await modelManager.updateModel(selected.model.name, { baseUrl: newBaseUrl });
            }
            break;
    }
    vscode.window.showInformationMessage(`Model ${selected.model.name} updated successfully!`);
}

async function deleteModel(modelManager: AIModelManager) {
    const models = modelManager.getAllModels();
    const modelItems = models.map(m => ({ label: m.name, model: m }));

    const selected = await vscode.window.showQuickPick(modelItems, {
        placeHolder: 'Select model to delete'
    });
    if (!selected) return;

    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Are you sure you want to delete ${selected.model.name}?`
    });

    if (confirm === 'Yes') {
        await modelManager.removeModel(selected.model.name);
        vscode.window.showInformationMessage(`Model ${selected.model.name} deleted successfully!`);
    }
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