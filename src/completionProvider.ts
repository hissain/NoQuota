import * as vscode from 'vscode';
import { AIModelManager } from './modelManager';

let lastRequestTime = 0;
const DEBOUNCE_MS = 300;

export class AICompletionProvider implements vscode.InlineCompletionItemProvider {
    private modelManager: AIModelManager;
    private isEnabled: boolean = false;
    private maxCompletionLength: number = 200;

    constructor(modelManager: AIModelManager) {
        this.modelManager = modelManager;
        // Read maxCompletionLength from config
        const config = vscode.workspace.getConfiguration('ai-helper');
        this.maxCompletionLength = config.get<number>('maxCompletionLength', 200);
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

        // Debounce: avoid sending requests too frequently
        const now = Date.now();
        if (now - lastRequestTime < DEBOUNCE_MS) {
            return null;
        }
        lastRequestTime = now;

        // Skip completion if in a comment or string (Python example)
        const line = document.lineAt(position).text;
        const beforeCursor = line.substr(0, position.character);
        if (/^\s*#/.test(beforeCursor) || /(['"]).*\1/.test(beforeCursor)) {
            return null;
        }

        try {
            const linePrefix = beforeCursor;
            const startLine = Math.max(0, position.line - 10);
            const contextRange = new vscode.Range(startLine, 0, position.line, position.character);
            const context_text = document.getText(contextRange);

            const prompt = `Complete this code:\n\n${context_text}\n\nComplete the current line: ${linePrefix}`;

            // Respect cancellation
            if (token.isCancellationRequested) {
                return null;
            }

            const { response } = await this.modelManager.makeRequest(prompt, true);

            if (token.isCancellationRequested) {
                return null;
            }

            if (response && response.trim()) {
                let suggestion = response.trim();

                const currentLine = document.lineAt(position.line).text;
                const linePrefix = currentLine.slice(0, position.character);

                // Remove any repeated prefix (cursor text)
                while (suggestion.startsWith(linePrefix)) {
                    suggestion = suggestion.slice(linePrefix.length).trimStart();
                }

                // Also remove exact repetition of the whole current line (common with models)
                while (suggestion.startsWith(currentLine)) {
                    suggestion = suggestion.slice(currentLine.length).trimStart();
                }

                // Truncate to maxCompletionLength
                if (suggestion.length > this.maxCompletionLength) {
                    suggestion = suggestion.slice(0, this.maxCompletionLength);
                }

                if (!suggestion) {
                    return null;
                }

                // Only insert at cursor, don’t replace trailing text
                const range = new vscode.Range(position, position);

                return [new vscode.InlineCompletionItem(suggestion, range)];
            }


        } catch (error) {
            console.error('AI completion error:', error);
        }

        return null;
    }
}
