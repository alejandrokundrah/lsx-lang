# LSX — Lumina Syntax eXtended

**A component-based programming language for building web interfaces with a simpler, more readable syntax.**

LSX is a programming language with its own `.lsx` source files, component syntax, compiler, command-line tools, and core UI library. It compiles to React/JavaScript, allowing LSX projects to use the wider JavaScript ecosystem.

> **Project status:** LSX is published on npm and is actively evolving. Some capabilities are still basic. Review the current specification and examples before depending on a feature in production.

[![npm version](https://img.shields.io/npm/v/lsx-lang)](https://www.npmjs.com/package/lsx-lang)
[![Core package](https://img.shields.io/npm/v/lsx-core)](https://www.npmjs.com/package/lsx-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Contents

- [Why LSX?](#why-lsx)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Your First Component](#your-first-component)
- [Props and State](#props-and-state)
- [Using lsx-core](#using-lsx-core)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Examples](#examples)
- [Testing](#testing)
- [VS Code Support](#vs-code-support)
- [Current Limitations](#current-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why LSX?

Modern web development is powerful, but its tooling and syntax can feel difficult when you are starting out. LSX explores a more approachable way to write component-based interfaces.

The project focuses on:

- **Readable syntax:** Write interface components in `.lsx` files.
- **Component-based development:** Organise interfaces into reusable components.
- **An integrated toolchain:** Use the LSX CLI, compiler, development server, and core component library.
- **JavaScript ecosystem compatibility:** Compile to React/JavaScript instead of requiring a separate browser runtime.

LSX does not replace JavaScript or React at runtime. It provides an alternative authoring language and development workflow built on them.

## Features

The repository includes:

- Custom `.lsx` source-file extension
- Component declarations and render blocks
- Component props and state
- Component methods and event handlers
- JSX-style markup
- Import and export statements
- Compiler/transpiler targeting React/JavaScript
- CLI for project creation, development, builds, and scaffolding
- Development server with file watching and hot reload
- Build options including minification, tree-shaking, and source maps
- Basic opt-in type checking
- CSS-in-LSX style blocks
- Async/await and try/catch support
- Router and Link components
- API helpers in `lsx-core`
- VS Code extension with syntax highlighting, snippets, and language-server support

## Requirements

- Node.js 18 or later
- npm

Check your installed versions:

```bash
node --version
npm --version
```

## Installation

Install the LSX command-line package globally:

```bash
npm install -g lsx-lang
```

The core component library is published separately:

```bash
npm install lsx-core
```

Verify that the CLI is available:

```bash
lsx --help
```

### npm Packages

- [lsx-lang on npm](https://www.npmjs.com/package/lsx-lang)
- [lsx-core on npm](https://www.npmjs.com/package/lsx-core)

## Quick Start

Create a new project:

```bash
lsx init my-first-app
cd my-first-app
```

Start the development server:

```bash
lsx dev
```

The default development port is `3000`. You can specify another port:

```bash
lsx dev 4000
```

When you are ready to compile your project:

```bash
lsx build
```

The documented build output is written to `dist/`, with a browser bundle under `dist/bundle/`.

Scaffolded projects include a production server and an `npm start` script:

```bash
npm start
```

## Your First Component

Create or edit an `.lsx` file:

```lsx
component HelloWorld {
    render {
        return <div>
            <h1>Hello, World!</h1>
            <p>My first component is written in LSX.</p>
        </div>
    }
}

export default HelloWorld
```

A component declaration defines a reusable UI unit. Its `render` block returns JSX-style markup, and `export default` makes the component the module's default export.

## Props and State

### Props

Props allow a component to receive values from its parent:

```lsx
component Greeting {
    props {
        name
    }

    render {
        return <div>
            <p>Hello, {name}!</p>
        </div>
    }
}

export default Greeting
```

A parent can provide the value through an attribute:

```lsx
<Greeting name="Alex" />
```

### State

State stores values owned by a component:

```lsx
component Counter {
    state {
        count = 0
    }

    render {
        return <div>
            <p>Count: {count}</p>
            <button onClick={increment}>Increase</button>
        </div>
    }

    increment() {
        count = count + 1
    }
}

export default Counter
```

In this example, `count` starts at zero. Clicking the button invokes `increment`, which updates the component's state.

## Using lsx-core

The `lsx-core` package provides reusable layout and UI components, routing components, and API helpers.

Example:

```lsx
import { Page, Header, Footer, Section, Body, Button } from 'lsx-core'

component LandingPage {
    render {
        return <Page>
            <Header
                title="Welcome to LSX"
                subtitle="Build your next idea."
            />
            <Section>
                <Body>
                    <h1>Build with components</h1>
                    <p>Compose a page from reusable interface elements.</p>
                    <Button>Get started</Button>
                </Body>
            </Section>
            <Footer copyright="2026 LSX" />
        </Page>
    }
}

export default LandingPage
```

### Layout Components

| Component | Purpose |
|---|---|
| `Page` | Page-level container |
| `Header` | Header with title and subtitle |
| `Footer` | Footer with copyright text |
| `Section` | Section container |
| `Body` | Main content wrapper |

### UI Components

| Component | Purpose |
|---|---|
| `Button` | Button with primary, secondary, and outline variants |
| `Card` | Content container with border and shadow |
| `Modal` | Dialog overlay |
| `Grid` | CSS Grid container |
| `Flex` | Flexbox container |
| `Input` | Text input |

### Routing

| Component | Purpose |
|---|---|
| `Router` | Hash-based router |
| `Link` | Navigation link |

### API Helpers

The package exports the following fetch helpers:

- `get(url, options?)`
- `post(url, data, options?)`
- `put(url, data, options?)`
- `del(url, options?)`

They return parsed JSON and throw an error when the HTTP response is unsuccessful. These are lightweight wrappers around the browser Fetch API, not a replacement for a full API client.

## CLI Commands

| Command | Description |
|---|---|
| `lsx --help` | Display CLI help |
| `lsx init <name>` | Create a new LSX project |
| `lsx dev [port]` | Start the development server |
| `lsx build` | Compile the project |
| `lsx add component <name>` | Scaffold a component |
| `lsx add page <name>` | Scaffold a page |

For production, scaffolded projects provide:

```bash
npm start
```

## Configuration

LSX projects use an `lsx.config.json` file.

Example:

```json
{
  "entry": "./src/App.lsx",
  "output": "./dist",
  "publicDir": "./public",
  "port": 3000,
  "sourceMaps": false,
  "minify": false,
  "typeCheck": false,
  "hotReload": true
}
```

### Configuration Options

| Option | Description | Default |
|---|---|---|
| `entry` | Main LSX entry file | `./src/App.lsx` |
| `output` | Compiled output directory | `./dist` |
| `publicDir` | Static assets directory | `./public` |
| `port` | Development server port | `3000` |
| `sourceMaps` | Generate source maps | `false` |
| `minify` | Minify generated JavaScript | `false` |
| `typeCheck` | Run the basic type checker | `false` |
| `hotReload` | Enable hot module replacement | `true` |

## Examples

The repository includes example projects.

### Todo App

Location: `examples/todo-app`

Demonstrates:

- State management
- Effects
- Local-storage persistence
- Component composition
- Event handling

Run:

```bash
cd examples/todo-app
lsx dev
```

### Router App

Location: `examples/router-app`

Demonstrates:

- Hash-based routing
- Navigation with Link
- Multi-page application structure
- Route parameters

Run:

```bash
cd examples/router-app
lsx dev
```

### API App

Location: `examples/api-app`

Demonstrates:

- API helpers
- Async/await
- Error handling with try/catch
- Loading states
- Data fetching

Run:

```bash
cd examples/api-app
lsx dev
```

## Testing

From a clone of the repository, install development dependencies:

```bash
npm install
```

Run the test suites:

```bash
npm test
```

The test command runs two suites:

**Unit tests (`test.js`)**

- Basic component transpilation
- Props, state, and methods
- Effects and lifecycle
- JSX compilation
- Import/export statements
- Automatic React and hook imports

**End-to-end tests (`test-e2e.js`)**

- Project scaffolding
- Build output generation
- Build failure handling
- Development server behaviour
- Hot module replacement
- Production server behaviour

Run the broader quality command:

```bash
npm run quality
```

This runs the test suites and compiles the VS Code extension and language server.

## VS Code Support

The repository includes a VS Code extension with:

- LSX syntax highlighting
- Code snippets
- Language-server support

The extension is maintained in the repository's `vscode-extension/` directory. Follow the instructions there to build or install it from source.

## Current Limitations

LSX is actively evolving. Some capabilities are still basic:

- **Compilation target:** LSX compiles to React/JavaScript. It does not replace JavaScript in the browser.
- **Type checking:** The current checker is basic and opt-in. It is not a complete type system.
- **Routing:** The `lsx-core` Router uses hash-based routing.
- **API helpers:** The helpers are lightweight wrappers around Fetch.
- **Production readiness:** Evaluate the compiler, generated output, and package versions for your use case before adopting LSX in a critical production system.

For exact syntax and supported constructs, consult [SPEC.md](SPEC.md) and the examples in this repository.

## Roadmap

The initial compiler, CLI, core component library, development server, and editor tooling have been implemented.

Further development includes:

- [ ] Production bundling improvements: hashed assets, code splitting, and CSS extraction
- [ ] A fuller type system, including interfaces, generics, and sound checking
- [ ] Continued compiler and diagnostics improvements
- [ ] Expanded documentation and beginner tutorials
- [ ] More examples and learning resources

Check the repository's issues and releases for current priorities.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make and test your changes.
4. Open a pull request with a clear description.

When contributing language features, update the specification and add tests for the supported syntax.

## License

LSX is released under the [MIT License](LICENSE).
