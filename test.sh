#!/bin/bash

EXTENSION="cogitoai.ai-helper-pro"
PACKAGE_FILE="ai-helper-pro.vsix"

echo "Uninstalling existing extension..."
if code --list-extensions | grep -q "$EXTENSION"; then
    code --uninstall-extension "$EXTENSION"
    echo "Extension '$EXTENSION' uninstalled."
else
    echo "Extension '$EXTENSION' not installed."
fi

echo "Cleaning previous build artifacts..."
rm -rf ./out
rm -f ./*.vsix
npm install

# Detect build script
BUILD_SCRIPT=$(jq -r '.scripts.build // empty' package.json)
if [ -n "$BUILD_SCRIPT" ]; then
    echo "Building the extension using npm run build..."
    npm run build || { echo "Build failed. Exiting."; exit 1; }
else
    echo "No build script found in package.json. Skipping build."
fi

# Check if main extension file exists
MAIN_FILE=$(jq -r '.main' package.json)
if [ ! -f "$MAIN_FILE" ]; then
    echo "Error: Extension entry point '$MAIN_FILE' not found."
    exit 1
fi

echo "Packaging the extension..."
vsce package || { echo "Packaging failed. Exiting."; exit 1; }

# Find the newest .vsix file
PACKAGE_FILE=$(ls -t *.vsix | head -1)
echo "Installing packaged extension: $PACKAGE_FILE"
code --install-extension "$PACKAGE_FILE"

echo "Done. Extension reinstalled successfully."

