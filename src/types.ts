export interface ModelConfig {
    name: string;
    provider: 'openai' | 'openrouter' | 'ollama' | 'gemini';
    apiKey: string;
    baseUrl?: string;
    model: string;
    priority: number;
    enabled: boolean;
    type?: 'chat' | 'completion' | 'both'; 
    quotaErrors?: string[];
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    modelUsed?: string;
}
