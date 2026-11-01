# LSX Language Documentation

## Install

```
npm install -g lsx-lang
```

## Create your first project

```
lsx init my-app
cd my-app
lsx dev
```

Open http://localhost:3000

## Build for production

```
lsx build
npm start
```

## Your first page

Edit `src/App.lsx`:

```lsx
component App {
    render {
        return <Page>
            <Header title="My Site" subtitle="Hello" />
            <Section>
                <Body>
                    <h1>Welcome</h1>
                    <p>This is my first LSX website.</p>
                </Body>
            </Section>
            <Footer copyright="2026" />
        </Page>
    }
}
export default App
```

## Divs and HTML

Use any HTML tag directly:

```lsx
render {
    return <div className="box">
        <h2>Title</h2>
        <p>Text</p>
        <button onClick={doThing}>Click</button>
    </div>
}
```

## Components

```lsx
component Card {
    props { title, body }
    render {
        return <div className="card">
            <h3>{title}</h3>
            <p>{body}</p>
        </div>
    }
}

component App {
    render {
        return <div>
            <Card title="A" body="First" />
            <Card title="B" body="Second" />
        </div>
    }
}
```

## State

```lsx
component Counter {
    state { count = 0 }
    render {
        return <div>
            <p>Count: {count}</p>
            <button onClick={inc}>+</button>
        </div>
    }
    inc() { count = count + 1 }
}
```

## Loops

```lsx
render {
    return <ul>
        {items.map((x) => <li>{x}</li>)}
    </ul>
}
```

## Effects

```lsx
component Clock {
    state { time = "" }
    render { return <p>{time}</p> }
    effect {
        setInterval(() => { time = new Date().toLocaleTimeString() }, 1000)
    }
}
```

## Styling

```lsx
component Box {
    style {
        .box { padding: 1rem; background: #eee; }
    }
    render { return <div className="box">Hi</div> }
}
```

## Routing

```lsx
import { Router, Link } from 'lsx-core'
component App {
    render {
        return <Router>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
        </Router>
    }
}
```

## API

```lsx
import { get } from 'lsx-core'
component App {
    state { data = null }
    async load() { data = await get('/api/items') }
    render { return <div>{data}</div> }
}
```

## CLI commands

- `lsx init <name>` create project
- `lsx build` compile
- `lsx dev [port]` dev server
- `lsx add component <name>`
- `lsx add page <name>`

## Config (lsx.config.json)

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

## VS Code

Install extension from `vscode-extension` for syntax highlighting.
