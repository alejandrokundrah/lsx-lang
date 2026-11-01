# LSX Language Documentation

## Install

```
npm install -g lsx-lang
```

## Create a project

```
lsx init my-app
cd my-app
lsx dev
```

## Build

```
lsx build
npm start
```

## Syntax

```lsx
component App {
    state { count = 0 }
    render {
        return <div><h1>{count}</h1></div>
    }
    increment() { count = count + 1 }
}
export default App
```

## CLI

- `lsx init <name>`
- `lsx build`
- `lsx dev [port]`
- `lsx add component <name>`
- `lsx add page <name>`

## Config (lsx.config.json)

entry, output, publicDir, port, sourceMaps, minify, typeCheck, hotReload.

## Components

Import from `lsx-core`: Header, Footer, Section, Body, Page, Button, Card, Modal, Grid, Flex, Input, Router, Link.

## API helpers

`get`, `post`, `put`, `del`.
