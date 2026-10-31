# LSX Language Specification

## Overview

LSX (Lumina Syntax eXtended) is a modern, component-based programming language designed for full-stack development. It compiles to React/JavaScript and features a simplified syntax for building web applications.

## Philosophy

- **Simplicity First**: Easier than TypeScript, more powerful than plain JavaScript
- **Component-Based**: Everything is a component
- **Zero Configuration**: Works out of the box
- **Type-Safe Optional**: Types are optional but encouraged
- **Modern**: Compiles to modern JavaScript/React

## File Extension

`.lsx` - LSX source files

## Basic Syntax

### Variables
```lsx
name = "LSX";
age = 25;
isAwesome = true;
```

### Functions
```lsx
fn greet(name) {
    return "Hello, " + name;
}
```

### Components
```lsx
component Header {
    props {
        title
    }

    render {
        return <header>
            <h1>{title}</h1>
        </header>
    }
}
```

### State
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

### Effects
```lsx
component Timer {
    state {
        seconds = 0
    }

    effect init() {
        interval = setInterval(() => {
            seconds = seconds + 1
        }, 1000)
    }

    cleanup() {
        clearInterval(interval)
    }

    render {
        return <div>Time: {seconds}s</div>
    }
}
```

## Layout Components

### Built-in Layout Components

```lsx
// Page layout
component App {
    render {
        return <Page>
            <Header title="My Website" />
            <Section>
                <Body>
                    <p>Welcome to LSX!</p>
                </Body>
            </Section>
            <Footer copyright="2024" />
        </Page>
    }
}
```

## Type System (Optional)

```lsx
// Optional type annotations
fn add(x: number, y: number): number {
    return x + 1
}

// Without types
fn add(x, y) {
    return x + y
}
```

## Imports/Exports

```lsx
// Import component
import { Button } from './components/Button.lsx'

// Export default
export default App

// Export named
export { Header, Footer }
```

## CSS-in-LSX

```lsx
component StyledCard {
    style {
        card {
            padding: 20px
            background: white
            border-radius: 8px
        }
    }

    render {
        return <div className="card">
            <p>Hello</p>
        </div>
    }
}
```

## Data Fetching

```lsx
component UserList {
    state {
        users = []
        loading = true
    }

    async effect loadUsers() {
        users = await fetch('/api/users')
        loading = false
    }

    render {
        if (loading) {
            return <p>Loading...</p>
        }

        return <ul>
            for (user in users) {
                <li>{user.name}</li>
            }
        </ul>
    }
}
```

## Project Structure

```
my-project/
├── src/
│   ├── App.lsx              # Main app component
│   ├── components/         # Reusable components
│   │   ├── Header.lsx
│   │   ├── Footer.lsx
│   │   └── Button.lsx
│   ├── pages/               # Page components
│   │   ├── Home.lsx
│   │   └── About.lsx
│   └── styles/              # Global styles
├── public/                  # Static assets
├── lsx.config.json          # LSX configuration
└── package.json             # Node dependencies
```

## CLI Commands

```bash
lsx init my-project          # Create new project
lsx build                    # Compile to JavaScript
lsx dev                      # Start dev server
lsx add component Header     # Add new component
lsx add page Home            # Add new page
lsx start                    # Production build and start
```

## Compilation Target

LSX compiles to:
- React functional components
- Modern JavaScript (ES6+)
- JSX syntax
- Optional TypeScript

## Example: Complete Landing Page

```lsx
// main.lsx
import { Header, Footer, Section } from '@lsx/core'

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
                    <p>LSX makes development simple</p>
                    <Button>Get Started</Button>
                </Body>
            </Section>
            <Footer copyright="2024 LSX" />
        </Page>
    }
}

export default LandingPage
```

## Roadmap

### Phase 1: Core Language
- [x] Language specification
- [ ] Transpiler (LSX → React)
- [ ] Basic syntax support

### Phase 2: Build System
- [ ] CLI tool
- [ ] Project scaffolding
- [ ] Build pipeline

### Phase 3: Component Library
- [ ] Core components (Header, Footer, Section, Body)
- [ ] Layout system
- [ ] UI components

### Phase 4: Development Tools
- [ ] Dev server
- [ ] Hot reload
- [ ] Error reporting

### Phase 5: Advanced Features
- [ ] Type system
- [ ] State management
- [ ] Routing
- [ ] API integration
