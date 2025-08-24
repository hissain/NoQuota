import requests
import dotenv
import os

dotenv.load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
API_URL_AUTOCOMPLETION = "https://openrouter.ai/api/v1/completions"
API_URL = "https://openrouter.ai/api/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://google.com",
    "X-Title": "Code Completion Example"
}

data = {
    "model": "openai/gpt-oss-20b:free",  # free code completion model
    "prompt": "def fibonacci(n):",
    "max_tokens": 100,
    "temperature": 0.2
}

data2 = {
    "model": "qwen/qwen3-coder:free",
    "messages": [
        {"role": "user", "content": "Write a Python function to calculate Fibonacci numbers."}
    ],
    "max_tokens": 150,
    "temperature": 0.2
}

response = requests.post(API_URL_AUTOCOMPLETION, headers=headers, json=data)
response = requests.post(API_URL, headers=headers, json=data2)

print(response.status_code)
print(response.json().get("choices", [{}])[0].get("message", {}).get("content", "No content returned"))

