# Dallas Bulls Stats

⚠️ Work-in-progress starter code for custom notebook renderers in VS Code. Expect this to change as notebooks matures. ⚠️

This starter includes:

 - 🖥️ TypeScript code to create a simple `NotebookOutputRenderer`
 - 📦 A Webpack build for renderer client code
 - ⚡ Support for hot module reloading and safe boilerplate
 - 🎨 CSS modules support

### Running this App

 1. `cd <project-folder>`
 1. `code-insiders .`: Open the folder in VS Code Insiders
 1. Hit `F5` to build+debug

### Structure

A Notebook Renderer consists of code that runs in the VS Code Extension Host (Node.js), which registers the renderer and passes data into the UI code running inside a WebView (Browser/DOM).

This uses TypeScript project references. There are three projects in the `src` directory:

 - `extension` contains the code running in Node.js extension host. It's compiled with `tsc`.
 - `client` is the UI code, built by Webpack, with access to the DOM.
 - `common` contains code shared between the extension and client.

When you run `watch`, `compile`, or `dev`, we invoke both `tsc` and `webpack` to compile the extension and the client portion of the code.

### Versioning and Release

Use npm version commands so `package.json` and `package-lock.json` stay in sync automatically.

 - Patch release: `npm run release:patch`
 - Minor release: `npm run release:minor`
 - Major release: `npm run release:major`

If you only want to bump locally (without push), use:

 - `npm run version:patch`
 - `npm run version:minor`
 - `npm run version:major`
