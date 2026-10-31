# Contributing to LSX

Thank you for your interest in contributing to LSX! This document provides guidelines for contributing to the project.

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Link the CLI: `npm link`
4. Run tests: `npm test`

## Project Structure

```
lsx/
├── packages/
│   └── lsx-core/          # Core component library
│       ├── index.js
│       └── package.json
├── cli.js                 # CLI entry point
├── transpiler.js          # Main transpiler class
├── lexer.js               # Tokenizer
├── parser.js              # AST parser
├── codegen.js             # Code generator
├── config.js              # Configuration handling
├── dev-server.js          # Development server
├── test.js                # Test suite
└── package.json
```

## Architecture

The LSX transpiler follows a pipeline:

1. **Lexer** (`lexer.js`): Converts source code into tokens
2. **Parser** (`parser.js`): Builds an AST from tokens
3. **Codegen** (`codegen.js`): Generates React/JavaScript from AST
4. **Babel**: Lowers JSX to React.createElement calls

## Adding New Features

### Adding a New Keyword

1. Add to `KEYWORDS` set in `lexer.js`
2. Add parsing logic in `parser.js`
3. Add code generation in `codegen.js`
4. Add tests in `test.js`

### Adding a New Component to lsx-core

1. Add component to `packages/lsx-core/index.js`
2. Add component name to `DEFAULT_CORE_NAMES` in `transpiler.js`
3. Add tests for the component
4. Update documentation

### Adding CLI Commands

1. Add command handler in `cli.js`
2. Update help text
3. Add error handling
4. Add tests

## Code Style

- Use 2-space indentation
- Use `'use strict'` at the top of files
- Add JSDoc comments for functions and classes
- Keep functions focused and small
- Use descriptive variable names

## Testing

- Add tests for new features in `test.js` (transpiler) or `test-e2e.js` (CLI, servers)
- Run tests before committing: `npm test`
- Ensure all tests pass
- Test edge cases and error conditions
- Run the quality gate before release: `npm run quality`

## Release Process

See [PUBLISHING.md](PUBLISHING.md) for the full checklist and one-time setup.
In short:

1. Ensure the main branch is green in CI
2. Bump the versions in `package.json`, `packages/lsx-core/package.json` and the VS Code extension
3. Run `npm run quality`
4. Tag `vX.Y.Z` (matching `package.json`) and push the tag — the release
   workflow builds the VSIX, creates the GitHub release, then publishes
   `lsx-core` followed by `lsx-lang` to npm

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run tests and ensure they pass
6. Commit with clear messages
7. Push to your fork
8. Create a pull request

## Issues

- Search existing issues before creating new ones
- Use issue templates when available
- Provide reproduction steps for bugs
- Include code examples for feature requests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
