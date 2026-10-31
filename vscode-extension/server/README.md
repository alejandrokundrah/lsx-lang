# LSX Language Server

A basic language server implementation for LSX providing IntelliSense and hover information.

## Setup

This language server is written in TypeScript and requires:

```bash
cd server
npm install
npm run compile
```

## Features

- **Completion**: Suggests keywords, components, and API helpers
- **Hover**: Shows documentation for keywords and components
- **Diagnostics**: Parses LSX source and reports syntax errors in real time
- **Basic IntelliSense**: Context-aware suggestions

## Configuration

The language server integrates with the VS Code extension defined in the parent directory.

## Future Enhancements

- Go to definition
- Find references
- Signature help
- Code formatting
- Refactoring support
