#!/bin/bash
set -euo pipefail

EXTENSION="cogitoai.ai-helper-pro"

echo "Uninstalling existing extension..."
if code --list-extensions | grep -q "$EXTENSION"; then
    code --uninstall-extension "$EXTENSION" --force
    echo "Extension '$EXTENSION' uninstalled."
else
    echo "Extension '$EXTENSION' not installed."
fi

echo "Cleaning previous build artifacts..."
rm -rf ./out
rm -rf ./node_modules
rm -f ./*.vsix

echo "Installing dependencies..."
npm install

# Ensure openai dependency exists
if ! npm list openai >/dev/null 2>&1; then
    echo "Adding openai@^4.24.0 to dependencies..."
    npm install openai@^4.24.0 --save
fi

if ! npm list @openrouter/ai-sdk-provider >/dev/null 2>&1; then
    echo "Adding @openrouter/ai-sdk-provider@^1.1.2 to dependencies..."
    npm install @openrouter/ai-sdk-provider@^1.1.2 --save
fi

# Detect build script
if jq -e '.scripts.build' package.json >/dev/null; then
    echo "Building the extension..."
    npm run build
else
    echo "No build script found in package.json. Skipping build."
fi

# Check if main extension file exists
MAIN_FILE=$(jq -r '.main' package.json)
if [ ! -f "$MAIN_FILE" ]; then
    echo "Error: Extension entry point '$MAIN_FILE' not found. Did you forget to build?"
    exit 1
fi

echo "Packaging the extension..."
vsce package

# Find the newest .vsix file
PACKAGE_FILE=$(ls -t *.vsix | head -1)
echo "Installing packaged extension: $PACKAGE_FILE"
code --install-extension "$PACKAGE_FILE" --force

echo "✅ Done. Extension reinstalled successfully."

