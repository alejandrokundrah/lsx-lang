# Releasing LSX

LSX ships three artifacts from one git tag: two npm packages and a VS Code
extension. `.github/workflows/release.yml` does the publishing; this file
covers the one-time setup and the checklist you run before tagging.

## One-time setup

1. **npm account** with publish rights for the `lsx` scope (`npm login`).
2. **`NPM_TOKEN` repository secret** — create an npm automation token (or a
   granular token with *Read and write* publish permission for `lsx-lang` and
   `@lsx/core`) and add it to the repository secrets as `NPM_TOKEN`. The
   workflow passes it to npm as `NODE_AUTH_TOKEN`. Tokens never belong in the
   repository itself.
3. **Repository metadata** — fill in `repository`, `homepage` and `bugs` in
   both `package.json` and `packages/lsx-core/package.json`. npm only warns if
   they are missing, but they are what links the npm page back to the source.

## Packages and publish order

| Package | Path | Publish |
| --- | --- | --- |
| `@lsx/core` | `packages/lsx-core` | **First.** Scoped, so it needs `--access public` (set in its `publishConfig`). |
| `lsx-lang` | repository root | Second. The CLI; ships a copy of `packages/lsx-core` inside its tarball. |
| VS Code extension | `vscode-extension` | Not on npm — released as a `.vsix` attached to the GitHub release. |

`lsx-lang` does **not** require `@lsx/core` at install time: the bundler falls
back to the copy shipped in its own tarball, so publishing `lsx-lang` alone
works. Publish `@lsx/core` regardless — it is what a project needs if it
consumes compiled output through its own bundler instead of `lsx build`.

## Before you tag

1. `npm run quality` passes locally (unit suite, end-to-end suite, extension
   and language-server compiles).
2. Bump the version in lockstep across:
   - `package.json`
   - `packages/lsx-core/package.json`
   - `vscode-extension/package.json`
   - `vscode-extension/server/package.json`
3. Update `README.md` / `STATUS.md` if the project's status changed.
4. Commit.

## Cutting the release

```bash
git tag v0.2.0
git push origin v0.2.0
```

The tag **must equal `v` plus `package.json`'s version**. The workflow checks
this and fails before publishing anything if they differ.

The workflow then:

1. installs dependencies, runs `npm run quality`, packages the `.vsix`
2. creates the GitHub release with the `.vsix` attached
3. re-runs the quality gate and verifies the tag matches the package version
4. publishes `@lsx/core`, then `lsx-lang`

## Publishing manually

Only needed if CI is unavailable:

```bash
npm run quality

# @lsx/core
cd packages/lsx-core && npm publish --access public && cd ../..

# lsx-lang
npm publish
```

`npm publish` from the repository root runs `prepublishOnly`, which executes
`npm run quality` again — a failing test stops the publish.

## If a release is bad

- **Within 72 hours** of publishing, and only if nothing depends on it:
  `npm unpublish lsx-lang@<version>`
- **Otherwise** deprecate rather than unpublish, so existing installs keep
  resolving:
  `npm deprecate lsx-lang@<version> "reason"`
- Always publish a follow-up fix version instead of overwriting history.
