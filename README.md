# LSX - The Easiest Programming Language

**LSX (Lumina Syntax eXtended)** - A modern, component-based programming language that compiles to React/JavaScript.

## Vision

LSX makes programming accessible to everyone by providing:
- ✅ Custom `.lsx` file extension
- ✅ Simple, readable syntax
- ✅ Component-based architecture
- ✅ Built-in layout components (Header, Footer, Section, Body)
- ✅ Full development ecosystem (CLI, build system, dev server)
- ✅ Compiles to modern React/JavaScript

## Status

### Phase 1: Foundation ✅
- [x] Language specification
- [x] Transpiler (LSX → React/JavaScript)
- [x] CLI tool (init, build, add component/page)
- [x] Component library (lsx-core)
- [x] Development server with hot reload
- [x] Configuration system

### Phase 2: Development Tools ✅
- [x] Hot reload dev server with file watching
- [x] Enhanced error reporting
- [x] Build optimization (minification, tree-shaking)
- [x] Source maps support

### Phase 3: Component Library ✅
- [x] Core components (Header, Footer, Section, Body, Page)
- [x] UI components (Button, Card, Modal)
- [x] Layout system (Grid, Flexbox)
- [x] Form components (Input)
- [x] Routing (Router, Link)
- [x] API helpers (get, post, put, del)

### Phase 4: Advanced Features ✅
- [x] CSS-in-LSX (style blocks)
- [x] State management (built-in useState/useEffect)
- [x] Async/await support
- [x] Error handling (try/catch)
- [x] API integration
- [x] Type checking (basic, opt-in via `typeCheck` in lsx.config.json)
- [x] VS Code extension (syntax highlighting, snippets, language server)

## Installation

LSX is **not yet published to npm**, so install it from a clone of this repository:

```bash
git clone <this repository>
cd lsx
npm install
npm link          # makes the `lsx` command available on your PATH
```

Verify the installation:

```bash
lsx --help
npm test          # runs the unit + end-to-end suites
```

Without `npm link`, run the CLI directly with `node cli.js <command>`.

> Publishing to npm is on the roadmap — see [PUBLISHING.md](PUBLISHING.md) for
> the release checklist and one-time setup. Once published, this section will
> read `npm install -g lsx-lang`.

## Quick Start

### Create a New Project

```bash
lsx init my-app
cd my-app
```

No `npm install` is required: React is loaded from a CDN and the generated
`server.js` uses only Node core modules.

### Build the Project

```bash
lsx build
```

### Start Development Server

```bash
lsx dev
```

### Run the Production Build

`lsx build` writes compiled output to `dist/` and a browser bundle to `dist/bundle/`.
Scaffolded projects include a `server.js`, so build-and-serve is one command:

```bash
npm start          # runs: lsx build && node server.js
```

The generated `public/index.html` loads the **production** React build, so the
output is deployable as-is: `node server.js`, or any static host that serves
both `public/` and `dist/`. During `lsx dev` the server swaps in the development
React build for better warnings.

### Add Components

```bash
lsx add component Header
lsx add page Home
```

## LSX Syntax

### Basic Component

```lsx
component HelloWorld {
    render {
        return <div>
            <h1>Hello, World!</h1>
        </div>
    }
}

export default HelloWorld
```

### Component with Props

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
```

### Component with State

```lsx
component Counter {
    state {
        count = 0
    }

    render {
        return <div>
            <p>Count: {count}</p>
            <button onClick={increment}>+</button>
        </div>
    }

    increment() {
        count = count + 1
    }
}
```

### Using Layout Components

```lsx
import { Header, Footer, Section, Body } from 'lsx-core'

component LandingPage {
    render {
        return <Page>
            <Header title="My Website" subtitle="Welcome" />
            <Section>
                <Body>
                    <h1>Main Content</h1>
                    <p>This is the body section.</p>
                </Body>
            </Section>
            <Footer copyright="2024" />
        </Page>
    }
}
```

## Project Structure

```
my-app/
├── src/
│   ├── App.lsx              # Main app component
│   ├── components/         # Reusable components
│   │   ├── Header.lsx
│   │   └── Footer.lsx
│   └── pages/               # Page components
│       └── Home.lsx
├── public/                  # Static assets
│   └── index.html
├── dist/                    # Compiled JavaScript + browser bundle
├── server.js                # Production server (npm start)
├── lsx.config.json          # LSX configuration
└── package.json             # Node dependencies
```

## CLI Commands

```bash
lsx init <name>              # Create new LSX project
lsx build                    # Build LSX project to JavaScript
lsx dev [port]               # Start development server (default: 3000)
lsx add component <name>     # Add a new component
lsx add page <name>          # Add a new page
```

## Configuration

LSX projects use a `lsx.config.json` file for configuration:

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

- **entry**: Path to the main LSX file (default: `./src/App.lsx`)
- **output**: Directory for compiled JavaScript (default: `./dist`)
- **publicDir**: Directory for static assets (default: `./public`)
- **port**: Development server port (default: `3000`)
- **sourceMaps**: Enable source maps for debugging (default: `false`)
- **minify**: Minify output JavaScript (default: `false`)
- **typeCheck**: Run the basic type checker and report problems as build warnings (default: `false`)
- **hotReload**: Enable hot module replacement (default: `true`)

## Example: Landing Page

```lsx
// main.lsx
import { Header, Footer, Section, Body } from 'lsx-core'

component LandingPage {
    render {
        return <Page>
            <Header
                title="Welcome to LSX"
                subtitle="The Easiest Programming Language"
            />
            <Section>
                <Body>
                    <h1>Build Anything</h1>
                    <p>LSX makes development simple and fun.</p>
                    <p>Start building your dream project today!</p>
                </Body>
            </Section>
            <Footer copyright="2024 LSX" />
        </Page>
    }
}

export default LandingPage
```

## Example: Todo App

A complete Todo app example is available in the `examples/todo-app` directory. It demonstrates:

- State management with `useState`
- Effects with `useEffect`
- LocalStorage persistence
- Component composition
- Event handling

To run the example:

```bash
cd examples/todo-app
lsx dev
```

## Example: Router App

A routing example is available in the `examples/router-app` directory. It demonstrates:

- Hash-based routing with Router component
- Navigation with Link component
- Multi-page application structure
- Route parameters

To run the example:

```bash
cd examples/router-app
lsx dev
```

## Example: API App

An API integration example is available in the `examples/api-app` directory. It demonstrates:

- API helpers (get, post)
- Async/await patterns
- Error handling with try/catch
- Loading states
- Data fetching from real APIs

To run the example:

```bash
cd examples/api-app
lsx dev
```

## Available Components

### Layout Components (lsx-core)

- **Page**: Main page container
- **Header**: Top section with title and subtitle
- **Footer**: Bottom section with copyright
- **Section**: Content section container
- **Body**: Main content container

### UI Components (lsx-core)

- **Button**: Clickable button with variants (primary, secondary, outline)
- **Card**: Container with border and shadow
- **Modal**: Dialog overlay
- **Grid**: CSS Grid layout
- **Flex**: Flexbox layout
- **Input**: Text input field

## Testing

Run the test suite:

```bash
npm test
```

Two suites run under `npm test`:

**Unit (`test.js`)** — transpiler behaviour:
- Basic component transpilation
- Props, state, and methods
- Effects and lifecycle
- JSX compilation
- Import/export statements
- Auto-imports (React, useState, useEffect)

**End-to-end (`test-e2e.js`)** — the CLI as a user drives it:
- `lsx init` scaffolds a project that builds with no `npm install`
- `lsx build` produces a real browser bundle
- failing builds exit non-zero (unresolvable imports, syntax errors, missing `src/`)
- the dev server serves the app, injects HMR and swaps in development React
- the generated production server serves the built app, 404s unknown paths and rejects path traversal

`npm run quality` runs both suites plus the VS Code extension and language-server
compiles. CI runs it on every push, and `prepublishOnly` runs it before any publish.

## Roadmap

- [x] Complete transpiler with full syntax support
- [x] Implement development server with hot reload
- [x] Build core component library
- [x] Basic type checking (opt-in via `typeCheck`)
- [x] VS Code extension (syntax highlighting + language server)
- [x] Routing (`Router`, `Link`) and API helpers (`get`, `post`, `put`, `del`)
- [x] End-to-end smoke suite covering the CLI's failure semantics
- [ ] Publish to npm
- [ ] Production bundling (hashed assets, code splitting, CSS extraction)
- [ ] Full type system (interfaces, generics, sound checking)

## Contributing

This is an early-stage project. Contributions welcome!

## License

MIT License - Feel free to use and modify!
