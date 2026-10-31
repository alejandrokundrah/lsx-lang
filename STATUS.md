# LSX Language Status Report

## Overview

LSX (Lumina Syntax eXtended) is a component-based language that compiles to
React/JavaScript. This document states the project's actual status: what is
verified working, what is not, and what remains before a public release.

**Status: usable beta.** The language, compiler and development workflow work
end to end, but LSX is not published to npm and should not yet be described as
production-ready.

## What is verified working

Each item below was exercised as part of this status pass:

| Area | Verification |
| --- | --- |
| Transpiler (lexer → parser → codegen → Babel) | 24 unit tests pass |
| CLI `init` → `build` → browser bundle | end-to-end suite: real bundle written, exit 0 |
| Failure semantics | unresolvable imports, syntax errors and missing `src/` all exit non-zero |
| Package entry point | `require('lsx-lang')` resolves and exports the API |
| Dev server | serves the app, injects the HMR client, serves the bundle |
| Production server (`npm start`) | serves the built app with production React, 404s unknown paths, rejects path traversal |
| Development React swap | `index.html` ships production React; `lsx dev` serves the development build |
| `@lsx/core` resolution | projects bundle with no `node_modules` present |
| Examples | `todo-app`, `router-app`, `api-app` all build; `todo-app` renders in a browser with no console errors |
| npm packaging | `npm pack` produces a 38 kB / 18-file tarball (runtime files only) |
| VS Code extension + language server | both compile clean under `tsc` |
| Quality gate | `npm run quality` passes (24 unit + 33 e2e + 2 compiles) |

Test counts: **24 unit** (`test.js`) and **33 end-to-end** (`test-e2e.js`),
run together by `npm test`. `prepublishOnly` runs the full gate before any
publish; CI runs it on push and pull request.

## Shipped components

- **Language**: spec (`SPEC.md`), lexer, recursive-descent parser, code generator
- **Compiler pipeline**: LSX → AST → JS with JSX → Babel lowering → esbuild bundle
- **CLI**: `lsx init`, `lsx build`, `lsx dev [port]`, `lsx add component|page`
- **Dev server**: file watching, hot reload over SSE, error reporting, dev React swap
- **Production server**: generated `server.js` (`npm start` builds and serves)
- **Component library** (`@lsx/core`): layout, UI, forms, routing, API helpers
- **Editor tooling**: VS Code extension with syntax highlighting, snippets and a language server
- **Type checking**: basic, opt-in via `"typeCheck": true` in `lsx.config.json`

## Known limitations

These are the gaps between the current state and a production-grade release:

1. **Not published to npm.** `lsx-lang` and `@lsx/core` return 404 on the
   registry, so installation is clone-and-`npm link` only. The published
   package also needs a `repository` field and a `LICENSE` file (the license is
   declared as MIT in `package.json` but no file ships yet).
2. **No production bundling.** React is loaded from a CDN rather than bundled;
   there are no hashed asset names, no code splitting and no CSS extraction.
   `public/index.html` and `dist/` must both be served, which the generated
   `server.js` handles but a static host needs configuring for.
3. **Type checking is basic.** It infers a handful of primitive types and
   reports mismatches as warnings; there are no interfaces, no generics and no
   soundness guarantees, and the checker has no dedicated tests.
4. **Automated coverage is narrow.** The 24 unit tests exercise the
   transpiler's output only; the type checker, config loader and VS Code
   extension have no behavioural tests, and the extension has only been
   compiled, not exercised in a running editor.
5. **Examples are build-verified, not all browser-verified.** Only `todo-app`
   was rendered and checked in a browser during this pass; `router-app` and
   `api-app` were built but not interacted with.
6. **No security or dependency audit.** No `npm audit` pass, no
   `SECURITY.md`, and dependencies are unpinned semver ranges.
7. **Pre-1.0 API.** At `0.1.0`, breaking changes are expected between versions.
8. **CI has not been observed running.** The workflow definitions exist and
   the commands they run pass locally; the workflow itself has not been
   triggered in this pass.

## Roadmap

Ordered by what unblocks external adoption first:

1. **Publish to npm** — add `LICENSE` and `repository`, publish `@lsx/core`,
   then `lsx-lang`; switch the README install section to `npm install -g lsx-lang`
2. **Production bundling** — bundle React locally, hashed filenames, code splitting
3. **Broader test coverage** — type checker, config loader, and an editor smoke test
4. **Full type system** — interfaces, generics, real error reporting
5. **Deploy recipes** — documented config for common static hosts

## Getting started

```bash
git clone <this repository>
cd lsx
npm install
npm link

lsx init my-app
cd my-app
lsx dev        # development server with hot reload
npm start      # production build + serve
```

## Example code

```lsx
import { Header, Footer, Section, Body, Button } from '@lsx/core'

component App {
    state {
        count = 0
    }

    render {
        return <Page>
            <Header title="Counter App" />
            <Section>
                <Body>
                    <h1>Count: {count}</h1>
                    <Button onClick={increment}>+</Button>
                </Body>
            </Section>
            <Footer copyright="2024" />
        </Page>
    }

    increment() {
        count = count + 1
    }
}

export default App
```

## Conclusion

LSX works as a development tool today: you can scaffold a project, develop it
with hot reload, build it, and run the result — with failures reported honestly
and a test suite that guards that behaviour. It is not yet published, not yet
bundled for production, and not yet covered broadly enough by tests to call it
production-grade. The gaps above are the work list.
