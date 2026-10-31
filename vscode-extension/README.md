# LSX VS Code Extension

Syntax highlighting and code snippets for the LSX programming language.

## Features

- Syntax highlighting for .lsx files
- Code snippets for common patterns
- Comment support (// and /* */)
- JSX highlighting
- Keyword highlighting
- LSX language server integration
- Completion suggestions for keywords, blocks, and lsx-core components
- Hover documentation for LSX keywords and runtime APIs
- Real-time diagnostics from the LSX parser and type checker
- Go to definition and find references
- Workspace symbol search and rename support
- Quick fixes for common semantic issues
- Document formatting support
- Quality gate scripts for build-validation

## Installation

To install this extension locally:

1. Open VS Code
2. Press `F5` to launch Extension Development Host
3. Install the extension from the current directory

## Snippets

- `comp` - Create a new component
- `compprops` - Create a component with props
- `compstate` - Create a component with state
- `fn` - Create a function
- `asyncfn` - Create an async function
- `effect` - Create an effect
- `imp` - Import from lsx-core
- `if` - If statement
- `for` - For-of loop
- `try` - Try-catch block

## Development

This is a basic extension. Future enhancements could include:

- Language server for IntelliSense
- Error highlighting
- Go to definition
- Auto-completion
- Hover information
- Diagnostics integration
