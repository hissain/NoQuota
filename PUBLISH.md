A **complete step-by-step workflow** to package and publish this AI VS Code extension using the current setup:

---

## **1. Verify Project Structure**

Make sure your project looks like this:

```
ai-helper/
├─ src/
│  └─ extension.ts
├─ out/
│  └─ extension.js
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ .gitignore
└─ .vscodeignore
```

* `src/` → TypeScript source
* `out/` → compiled JS
* `.vscodeignore` → files to exclude from `.vsix`
* `.gitignore` → files to exclude from Git

---

## **2. Compile TypeScript**

```bash
npm run compile
```

* Compiles `src/extension.ts` → `out/extension.js`
* Fix any TypeScript errors before proceeding.

---

## **3. Create VSCE Personal Access Token**

1. Go to [Publisher Management](https://marketplace.visualstudio.com/manage/publishers/)
2. Select your publisher (`cogitoai`)
3. Click **Personal Access Tokens → New Token**
4. Copy the token (you will need it to log in via `vsce`)

> Note: This is not in your profile picture menu—it’s under the publisher management page.

---

## **4. Login with VSCE**

```bash
vsce login cogitoai
```

* Enter your **Personal Access Token** when prompted.

---

## **5. Package the Extension**

```bash
vsce package
```

* This creates `ai-helper-0.0.1.vsix`
* Uses `.vscodeignore` to exclude unnecessary files
* If there are warnings about `.vscodeignore` or `.vsix` size, you can adjust `.vscodeignore`.

---

## **6. Publish the Extension**

**First-time publishing:**

```bash
vsce publish
```

**Or specify version (patch, minor, major):**

```bash
vsce publish minor
```

* `vsce` reads `package.json` version and increments it if needed
* After publishing, your extension will appear on [Visual Studio Marketplace](https://marketplace.visualstudio.com/)

---

## **7. Update / Maintain**

1. Make code changes in `src/`
2. Run `npm run compile`
3. Increment version in `package.json` (`patch`, `minor`, `major`)
4. Run `vsce package` → `vsce publish`

---

### ✅ **Tips for Smooth Publishing**

* Ensure `repository.url` in `package.json` is valid.
* Keep `out/` in `.vscodeignore` included, but ignore `src/` TS files.
* Commit `package-lock.json` to ensure reproducible installs.
* Use `.env` or `vscode.workspace.getConfiguration()` for private API keys instead of committing secrets.
