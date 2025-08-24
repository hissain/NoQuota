import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ModelConfig } from './types';

export function loadDefaultModels(context: vscode.ExtensionContext): ModelConfig[] {
    try {
        const jsonPath = path.join(context.extensionPath, 'media', 'defaultModels.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        return JSON.parse(jsonData);
    } catch (err) {
        console.error('Failed to load default models:', err);
        return [];
    }
}
