# LSX Language Support

Syntax highlighting, IntelliSense, and language support for the LSX programming language in Visual Studio Code.

## Features

- **Syntax Highlighting**: Beautiful syntax highlighting for LSX files with support for:
  - HTML tags and components
  - JSX-like syntax
  - Keywords and operators
  - Strings and numbers
  - Comments

- **Code Snippets**: 30+ code snippets for common patterns:
  - Component templates (`comp`, `compprops`, `compstate`, `page`)
  - Function templates (`fn`, `asyncfn`)
  - UI components (`btn`, `input`, `card`, `modal`, `grid`, `flex`)
  - API helpers (`get`, `post`)
  - Event handlers (`onclick`, `onchange`)
  - Control flow (`if`, `for`, `try`, `cond`, `map`)

- **Emmet Support**: Use Emmet abbreviations to quickly generate HTML-like tags

- **IntelliSense**: 
  - Auto-completion for keywords and built-in components
  - Hover documentation
  - Go to definition
  - Find references
  - Rename symbols

- **Diagnostics**: Real-time error and warning detection

- **Code Formatting**: Basic code formatting support

- **File Icons**: Custom LSX file icon for easy identification

- **Code Folding**: Folding support for components, functions, and code blocks

- **Bracket Pair Colorization**: Colored bracket matching for better readability

## Installation

### From VSIX

1. Download the latest `.vsix` file from the [Releases](https://github.com/alejandrokundrah/lsx-lang/releases) page
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Run "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file

### From Marketplace

Search for "LSX Language Support" in the VS Code Extensions Marketplace.

## Usage

### Snippets

Type any of the following prefixes and press `Tab` to expand:

- `comp` - Create a new LSX component
- `compprops` - Create a component with props
- `compstate` - Create a component with state
- `page` - Create a full page component
- `fn` - Create a function
- `asyncfn` - Create an async function
- `btn` - Button component
- `input` - Input component
- `card` - Card component
- `grid` - Grid layout
- `flex` - Flex layout
- `get` - API GET request
- `post` - API POST request
- And many more...

### Emmet

Type HTML-like abbreviations and press `Tab` to expand:

- `div` → `<div></div>`
- `section` → `<section></section>`
- `header` → `<header></header>`
- And more...

## Requirements

- Visual Studio Code 1.80.0 or higher

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/alejandrokundrah/lsx-lang).
