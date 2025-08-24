import * as vscode from 'vscode';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { ModelConfig } from './types';

export class AIModelManager {
    private context: vscode.ExtensionContext;
    private DEFAULT_MODELS: ModelConfig[];

    constructor(context: vscode.ExtensionContext, defaultModels: ModelConfig[]) {
        this.context = context;
        this.DEFAULT_MODELS = defaultModels;
        this.initializeDefaultModels();
    }

    private async initializeDefaultModels() {
        try {
            const config = vscode.workspace.getConfiguration('ai-helper');
            const inspection = config.inspect<ModelConfig[]>('models');
            const hasUserConfig = inspection?.globalValue && inspection.globalValue.length > 0;
            const hasWorkspaceConfig = inspection?.workspaceValue && inspection.workspaceValue.length > 0;
            const hasFolderConfig = inspection?.workspaceFolderValue && inspection.workspaceFolderValue.length > 0;

            if (!hasUserConfig && !hasWorkspaceConfig && !hasFolderConfig) {
                try {
                    await config.update('models', this.DEFAULT_MODELS, vscode.ConfigurationTarget.Global);
                } catch {
                    try {
                        await config.update('models', this.DEFAULT_MODELS, vscode.ConfigurationTarget.Workspace);
                    } catch {}
                }
            } else {
                const existingModels = inspection?.workspaceFolderValue ||
                    inspection?.workspaceValue ||
                    inspection?.globalValue ||
                    [];
                const mergedModels = this.mergeWithDefaults(existingModels);
                if (mergedModels.length !== existingModels.length) {
                    let targetScope = vscode.ConfigurationTarget.Global;
                    if (inspection?.workspaceFolderValue) {
                        targetScope = vscode.ConfigurationTarget.WorkspaceFolder;
                    } else if (inspection?.workspaceValue) {
                        targetScope = vscode.ConfigurationTarget.Workspace;
                    }
                    await config.update('models', mergedModels, targetScope);
                }
            }
        } catch (error) {
            console.error('Error during model initialization:', error);
        }
    }

    private mergeWithDefaults(existingModels: ModelConfig[]): ModelConfig[] {
        const existingNames = new Set(existingModels.map(m => m.name));
        const newDefaults = this.DEFAULT_MODELS.filter(defaultModel =>
            !existingNames.has(defaultModel.name)
        );
        if (newDefaults.length > 0) {
            return [...existingModels, ...newDefaults];
        }
        return existingModels;
    }

    private getModels(): ModelConfig[] {
        const config = vscode.workspace.getConfiguration('ai-helper');
        let models = config.get<ModelConfig[]>('models', []);
        if (!models || models.length === 0) {
            const inspection = config.inspect<ModelConfig[]>('models');
            models = inspection?.globalValue ||
                inspection?.workspaceValue ||
                inspection?.workspaceFolderValue ||
                inspection?.defaultValue ||
                this.DEFAULT_MODELS;
            if (!models || models.length === 0) {
                models = this.DEFAULT_MODELS;
                this.initializeDefaultModels().catch(() => {});
            }
        }
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
        return models
            .filter(model => model.enabled && this.hasValidApiKey(model))
            .sort((a, b) => a.priority - b.priority);
    }

    getEnabledChatModels(): ModelConfig[] {
        return this.getModels().filter(
            m => m.enabled && this.hasValidApiKey(m) && (m.type === 'chat' || m.type === 'both' || !m.type)
        ).sort((a, b) => a.priority - b.priority);
    }

    getEnabledCompletionModels(): ModelConfig[] {
        return this.getModels().filter(
            m => m.enabled && this.hasValidApiKey(m) && (m.type === 'completion' || m.type === 'both' || !m.type)
        ).sort((a, b) => a.priority - b.priority);
    }

    private hasValidApiKey(model: ModelConfig): boolean {
        if (model.provider === 'ollama') {
            return true;
        }
        return typeof model.apiKey === 'string' && model.apiKey.trim() !== '';
    }

    getAllModels(): ModelConfig[] {
        return this.getModels();
    }

    public refreshFromConfig(): void {
        // No-op: getModels always reads from config
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
        return quotaErrors.some(quotaError =>
            errorMessage.includes(quotaError.toLowerCase()) ||
            errorCode.includes(quotaError.toLowerCase())
        );
    }

    async makeRequest(prompt: string, isCompletion: boolean = false): Promise<{ response: string; modelUsed: string }> {
        const enabledModels = isCompletion ? this.getEnabledCompletionModels() : this.getEnabledChatModels();
        if (enabledModels.length === 0) {
            throw new Error('No enabled AI models with API keys configured. Please configure at least one model in settings.');
        }
        for (const model of enabledModels) {
            try {
                const client = await this.createClient(model);
                const response = await this.callModel(client, model, prompt, isCompletion);
                return { response, modelUsed: model.name };
            } catch (error: any) {
                if (this.isQuotaError(error, model)) {
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
        } else if (model.provider === 'gemini') {
            return {
                apiKey: model.apiKey,
                baseUrl: model.baseUrl || 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent'
            };
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
        } else if (model.provider === 'gemini') {
            const url = client.baseUrl;
            const apiKey = client.apiKey;
            const body = {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            };
            const response = await fetch(`${url}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
            }
            const data = await response.json();
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
        } else {
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
        }
    }
}
