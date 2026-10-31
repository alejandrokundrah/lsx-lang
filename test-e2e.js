'use strict';

/**
 * LSX end-to-end smoke tests.
 *
 * test.js covers the transpiler in isolation. These tests drive the CLI the
 * way a user does — init, build, serve — and pin down the failure semantics:
 * a build that cannot produce a bundle must exit non-zero, never report
 * success with an empty dist/.
 *
 * Run with: npm test
 */

const { spawn, spawnSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, 'cli.js');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lsx-e2e-'));
const DEV_PORT = 3977;
const PROD_PORT = 3978;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log(`✅ ${name}`);
    } else {
        failed++;
        failures.push(name);
        console.log(`❌ ${name}`);
        if (detail) console.log(`   ${String(detail).split('\n').join('\n   ')}`);
    }
}

function runCli(args, cwd) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 60000,
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        output: `${result.stdout || ''}${result.stderr || ''}`,
    };
}

function makeProject(name, files) {
    const dir = path.join(ROOT, name);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    Object.entries(files).forEach(([relative, content]) => {
        const target = path.join(dir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
    });
    return dir;
}

/**
 * Raw GET that does not normalise the path, so path traversal can be tested.
 */
function rawGet(port, rawPath) {
    return new Promise((resolve) => {
        const req = require('http').get(
            { host: '127.0.0.1', port, path: rawPath, agent: false },
            (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }
        );
        req.on('error', (err) => resolve({ status: 0, body: err.message }));
    });
}

function cleanup() {
    try {
        fs.rmSync(ROOT, { recursive: true, force: true });
    } catch (err) {
        console.warn(`warning: could not remove ${ROOT}: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// 1. The package entry point resolves.
// ---------------------------------------------------------------------------
try {
    console.log('\n— package entry point —');
    let api = null;
    try {
        api = require('./index.js');
    } catch (err) {
        check('require("lsx-lang") loads', false, err.message);
    }
    if (api) {
        check('require("lsx-lang") loads', true);
        check('exports LSXTranspiler', typeof api.LSXTranspiler === 'function');
        check('exports LSXBundler', typeof api.LSXBundler === 'function');
        check('exports loadConfig', typeof api.loadConfig === 'function');
    }

    // -------------------------------------------------------------------------
    // 2. lsx init scaffolds a project that builds without any npm install.
    // -------------------------------------------------------------------------
    console.log('\n— lsx init + lsx build —');
    const init = runCli(['init', 'demo'], ROOT);
    const demo = path.join(ROOT, 'demo');

    check('lsx init exits 0', init.status === 0, init.output);
    ['src/App.lsx', 'public/index.html', 'server.js', 'lsx.config.json', 'package.json']
        .forEach((file) => {
            check(`init creates ${file}`, fs.existsSync(path.join(demo, file)));
        });

    const build = runCli(['build'], demo);
    check('fresh project build exits 0', build.status === 0, build.output);

    const bundlePath = path.join(demo, 'dist', 'bundle', 'App.js');
    check('build writes dist/bundle/App.js', fs.existsSync(bundlePath));

    if (fs.existsSync(bundlePath)) {
        const bundle = fs.readFileSync(bundlePath, 'utf8');
        check('bundle is non-trivial', bundle.length > 1000, `only ${bundle.length} bytes`);
        check('bundle exposes the LSXApp global', bundle.includes('LSXApp'));
        check('bundle does not call require() for packages', !/require\(['"]react/.test(bundle));
    }

    // -------------------------------------------------------------------------
    // 3. Failures must fail: non-zero exit, no success message.
    // -------------------------------------------------------------------------
    console.log('\n— failure semantics —');

    const unresolvable = makeProject('unresolvable', {
        'src/App.lsx':
            'import { Nope } from "totally-missing-pkg"\n\n' +
            'component App {\n    render {\n        return <div>{Nope}</div>\n    }\n}\n\n' +
            'export default App\n',
        'public/index.html': '<!DOCTYPE html><html><body><div id="root"></div></body></html>\n',
    });
    const unresolvableBuild = runCli(['build'], unresolvable);
    check('unresolvable import exits non-zero', unresolvableBuild.status !== 0,
        `exit ${unresolvableBuild.status}`);
    check('unresolvable import does not claim success',
        !unresolvableBuild.stdout.includes('Bundle complete'), unresolvableBuild.stdout);
    check('unresolvable import names the failing module',
        unresolvableBuild.output.includes('totally-missing-pkg'), unresolvableBuild.output);

    const broken = makeProject('broken', {
        'src/App.lsx':
            'component Broken {\n    render {\n        return <div>\n            <p>unclosed\n    }\n}\n',
        'public/index.html': '<!DOCTYPE html><html><body><div id="root"></div></body></html>\n',
    });
    const brokenBuild = runCli(['build'], broken);
    check('syntax error exits non-zero', brokenBuild.status !== 0, `exit ${brokenBuild.status}`);
    check('syntax error reports a line number', /line \d+/.test(brokenBuild.output),
        brokenBuild.output);

    const empty = makeProject('empty', {
        'public/index.html': '<!DOCTYPE html><html><body></body></html>\n',
    });
    const emptyBuild = runCli(['build'], empty);
    check('missing src/ exits non-zero', emptyBuild.status !== 0, `exit ${emptyBuild.status}`);

    // -------------------------------------------------------------------------
    // 4. The dev server serves the scaffolded app.
    // -------------------------------------------------------------------------
    console.log('\n— dev server —');
    const devLogPath = path.join(ROOT, 'dev-server.log');
    const devLogFd = fs.openSync(devLogPath, 'w');
    const devServer = spawn(process.execPath, [CLI, 'dev', String(DEV_PORT)], {
        cwd: demo,
        // File descriptors, not pipes: closing piped stdio of a killed child
        // trips a libuv assertion on Windows during teardown.
        stdio: ['ignore', devLogFd, devLogFd],
    });

    const devOutput = () => {
        try {
            return fs.readFileSync(devLogPath, 'utf8');
        } catch (err) {
            return '';
        }
    };

    (async () => {
        let served = null;
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            try {
                const res = await fetch(`http://localhost:${DEV_PORT}/`);
                if (res.ok) {
                    served = await res.text();
                    break;
                }
            } catch (err) {
                // Not listening yet.
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        try {
            check('dev server responds', served !== null, devOutput());
            if (served !== null) {
                check('dev server serves index.html', served.includes('<div id="root">'), served.slice(0, 300));
                check('dev server injects the HMR client', served.includes('/__hmr'));
                check('dev server swaps in development React',
                    served.includes('react.development.js'), served.slice(0, 500));
            }

            if (served !== null) {
                try {
                    const bundleRes = await fetch(`http://localhost:${DEV_PORT}/dist/bundle/App.js`);
                    // Consume the body: leaving it unread keeps the socket in
                    // the pool, and closing it at exit trips a libuv assertion.
                    const bundleBody = await bundleRes.text();
                    check('dev server serves the bundle',
                        bundleRes.status === 200 && bundleBody.includes('LSXApp'),
                        `${bundleRes.status} ${bundleBody.slice(0, 120)}`);
                } catch (err) {
                    check('dev server serves the bundle', false, err.message);
                }
            }
        } finally {
            await new Promise((resolve) => {
                if (devServer.exitCode !== null || devServer.signalCode !== null) {
                    resolve();
                    return;
                }
                devServer.once('exit', resolve);
                devServer.kill();
                setTimeout(resolve, 5000).unref();
            });
            fs.closeSync(devLogFd);
        }

        // -------------------------------------------------------------------------
        // 5. The generated production server serves the built app.
        // -------------------------------------------------------------------------
        console.log('\n— production server —');
        const prodLogPath = path.join(ROOT, 'prod-server.log');
        const prodLogFd = fs.openSync(prodLogPath, 'w');
        const prodServer = spawn(process.execPath, ['server.js'], {
            cwd: demo,
            env: Object.assign({}, process.env, { PORT: String(PROD_PORT) }),
            stdio: ['ignore', prodLogFd, prodLogFd],
        });
        const prodOutput = () => {
            try {
                return fs.readFileSync(prodLogPath, 'utf8');
            } catch (err) {
                return '';
            }
        };

        let prodIndex = null;
        const prodDeadline = Date.now() + 20000;
        while (Date.now() < prodDeadline) {
            try {
                const res = await fetch(`http://localhost:${PROD_PORT}/`);
                if (res.ok) {
                    prodIndex = await res.text();
                    break;
                }
            } catch (err) {
                // Not listening yet.
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        try {
            check('production server responds', prodIndex !== null, prodOutput());
            if (prodIndex !== null) {
                check('production server serves index.html',
                    prodIndex.includes('<div id="root">'), prodIndex.slice(0, 300));
                check('production server serves production React',
                    prodIndex.includes('react.production.min.js'), prodIndex.slice(0, 500));
                check('production server does not inject the HMR client',
                    !prodIndex.includes('/__hmr'));

                const bundleRes = await fetch(`http://localhost:${PROD_PORT}/dist/bundle/App.js`);
                const bundleBody = await bundleRes.text();
                check('production server serves the bundle',
                    bundleRes.status === 200 && bundleBody.includes('LSXApp'),
                    `${bundleRes.status} ${bundleBody.slice(0, 120)}`);

                const missing = await rawGet(PROD_PORT, '/definitely-missing.js');
                check('production server 404s unknown paths', missing.status === 404,
                    String(missing.status));

                const traversal = await rawGet(PROD_PORT, '/..%2f..%2fpackage.json');
                check('production server rejects path traversal', traversal.status === 404,
                    `${traversal.status} ${traversal.body.slice(0, 120)}`);
            }
        } finally {
            await new Promise((resolve) => {
                if (prodServer.exitCode !== null || prodServer.signalCode !== null) {
                    resolve();
                    return;
                }
                prodServer.once('exit', resolve);
                prodServer.kill();
                setTimeout(resolve, 5000).unref();
            });
            fs.closeSync(prodLogFd);
        }

        console.log(`\n${passed} passed, ${failed} failed`);
        if (failed > 0) {
            console.log(`Failed: ${failures.join(', ')}`);
        }
        cleanup();

        // Set the code and let the event loop drain instead of calling
        // process.exit(): force-closing sockets that are still shutting down
        // trips a libuv handle assertion during teardown.
        process.exitCode = failed > 0 ? 1 : 0;
        setTimeout(() => process.exit(failed > 0 ? 1 : 0), 15000).unref();
    })();
} catch (err) {
    console.error('❌ End-to-end suite crashed:');
    console.error(err);
    cleanup();
    process.exit(1);
}
