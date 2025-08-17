
# AI Helper Pro

A comprehensive VSCode extension that provides AI-powered suggestions and code completion with support for multiple AI models, automatic fallback, and intelligent quota management.

## 🚀 Features

### Multi-Model AI Support

* **OpenAI GPT Models** (GPT-4, GPT-4o Mini, GPT-3.5)
* **Claude via OpenRouter** (Claude-3 Haiku, Sonnet, Opus)
* **Google Gemini via OpenRouter**
* **Local Ollama Models**
* **Custom API Endpoints**

### Intelligent Fallback System

* Automatically switches to the next available model when quota is exhausted
* Configurable priority system for model selection
* Smart error detection for quota limits and rate limiting

### AI-Powered Code Completion

* Real-time code completion suggestions
* Context-aware completions based on surrounding code
* Toggle completion on/off as needed
* Configurable completion settings

### Advanced Configuration

* Add, edit, and delete AI models through GUI
* Set model priorities and enable/disable models
* Secure API key storage
* Custom quota error patterns
* Configurable timeouts and completion settings

## 🛠️ Installation

1. Install the extension from the VSCode Marketplace
2. Configure at least one AI model with API key
3. Start using AI suggestions and completions!

## ⚙️ Configuration

### Quick Setup

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "AI Helper: Configure AI Models"
3. Add your first model with API key
4. Enable the model and set priority

### Supported Providers

#### OpenAI

* API Key: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
* Models: `gpt-4`, `gpt-4o-mini`, `gpt-3.5-turbo`

#### OpenRouter (for Claude, Gemini, and more)

* API Key: Get from [OpenRouter](https://openrouter.ai/keys)
* Base URL: `https://openrouter.ai/api/v1`
* Models: `anthropic/claude-3-haiku`, `google/gemini-pro`, etc.

#### Ollama (Local)

* Base URL: `http://localhost:11434/v1`
* Models: `llama2`, `codellama`, `mistral`, etc.
* Make sure Ollama is running locally

### Settings

Configure the extension through VSCode Settings (`Ctrl+,`):

* **AI Helper: Enable Completion** - Enable/disable AI code completion
* **AI Helper: Completion Delay** - Delay before triggering completion (default: 500ms)
* **AI Helper: Max Completion Length** - Maximum completion length (default: 200 chars)
* **AI Helper: Suggestion Timeout** - Timeout for AI requests (default: 30s)

## 🎯 Usage

### AI Suggestions

1. **Select text** in your editor
2. **Right-click** and choose "AI Suggestion"
3. Or use  **keyboard shortcut** : `Ctrl+Shift+A` (Mac: `Cmd+Shift+A`)
4. View AI-generated suggestion in popup

### Code Completion

1. **Enable completion** : `Ctrl+Shift+Alt+A` (Mac: `Cmd+Shift+Alt+A`)
2. **Start typing** - completions appear automatically
3. **Accept completion** with `Tab` or `Enter`

### Model Management

* **View Models** : See all configured models and their status
* **Add Model** : Add new AI provider with custom settings
* **Edit Model** : Modify API keys, priorities, or settings
* **Delete Model** : Remove unwanted models
* **Toggle Completion** : Quick enable/disable for code completion

## 🔑 Commands

| Command              | Shortcut             | Description                         |
| -------------------- | -------------------- | ----------------------------------- |
| AI Suggestion        | `Ctrl+Shift+A`     | Get AI suggestion for selected text |
| Configure AI Models  | -                    | Manage your AI models and settings  |
| Toggle AI Completion | `Ctrl+Shift+Alt+A` | Enable/disable code completion      |

## 🔄 Automatic Fallback

The extension intelligently handles quota exhaustion:

1. **Primary Model** tries first (lowest priority number)
2. **Quota Detected** - automatically switches to next model
3. **Continues** until successful or all models exhausted
4. **Error Types** detected: `insufficient_quota`, `rate_limit_exceeded`, etc.

## 🎨 Example Configurations

### OpenAI Setup

```json
{
  "name": "OpenAI GPT-4o Mini",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "apiKey": "sk-...",
  "priority": 1,
  "enabled": true
}
```

### Claude via OpenRouter

```json
{
  "name": "Claude Haiku",
  "provider": "openrouter", 
  "model": "anthropic/claude-3-haiku",
  "apiKey": "sk-or-...",
  "baseUrl": "https://openrouter.ai/api/v1",
  "priority": 2,
  "enabled": true
}
```

### Local Ollama

```json
{
  "name": "Local Llama2",
  "provider": "ollama",
  "model": "llama2",
  "apiKey": "dummy",
  "baseUrl": "http://localhost:11434/v1",
  "priority": 3,
  "enabled": true
}
```

## 🔒 Security

* API keys are stored securely in VSCode settings
* Keys are never logged or transmitted except to configured providers
* Password-protected input fields for sensitive data

## 🐛 Troubleshooting

### No Models Available

* Ensure at least one model is enabled with valid API key
* Check model configuration through "Configure AI Models"

### Completions Not Working

* Toggle completion on with `Ctrl+Shift+Alt+A`
* Check completion delay settings
* Verify model has sufficient quota

### API Errors

* Verify API keys are correct and have sufficient credits
* Check base URLs for custom providers
* Review quota error patterns in model configuration

## 📝 Release Notes

### 1.0.0

* Multi-model AI support with 5+ providers
* Automatic fallback system
* AI-powered code completion
* Advanced model management GUI
* Configurable priorities and settings
* Secure API key storage

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/hissain/NoQuota).

## 📄 License

This extension is licensed under the MIT License.

---

**Enjoy coding with AI assistance! 🚀**
