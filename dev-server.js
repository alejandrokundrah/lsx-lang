'use strict';

/**
 * LSX Development Server
 *
 * Provides a development server with:
 * - File watching and automatic rebuilding
 * - Hot reload via HMR (Hot Module Replacement)
 * - Error reporting
 * - Static file serving
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');
const LSXTranspiler = require('./transpiler');
const LSXBundler = require('./bundler');
const { loadConfig } = require('./config');

class DevServer {
    constructor(options) {
        options = options || {};
        this.config = loadConfig();
        this.port = options.port || this.config.port || 3000;
        this.srcDir = path.dirname(this.config.entry);
        this.distDir = this.config.output;
        this.publicDir = this.config.publicDir;
        this.entry = this.config.entry;
        this.transpiler = new LSXTranspiler();
        this.app = express();
        this.watcher = null;
        this.building = false;
        this.rebuildQueued = false;
        this.clients = new Set();
    }

    /**
     * Start the development server
     */
    start() {
        console.log('Starting LSX development server...');

        // Routes first so the HMR endpoint exists before the first build
        // finishes and tries to notify clients.
        this.setupServer();

        // Initial build (async: it bundles for the browser)
        this.build();

        // Setup file watcher
        this.setupWatcher();

        // Start listening
        this.app.listen(this.port, () => {
            console.log(`✅ LSX Dev Server running at http://localhost:${this.port}`);
            console.log(`📁 Watching: ${this.srcDir}`);
            console.log(`📦 Output: ${this.distDir}`);
        });
    }

    /**
     * Setup file watcher for automatic rebuilding
     */
    setupWatcher() {
        this.watcher = chokidar.watch(this.srcDir, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true
        });

        this.watcher
            .on('change', (filePath) => {
                console.log(`\n📝 File changed: ${filePath}`);
                this.build();
            })
            .on('add', (filePath) => {
                console.log(`\n➕ File added: ${filePath}`);
                this.build();
            })
            .on('unlink', (filePath) => {
                console.log(`\n🗑️  File removed: ${filePath}`);
                this.build();
            })
            .on('error', (error) => {
                console.error(`Watcher error: ${error}`);
            });
    }

    /**
     * Setup Express server with routes
     */    setupServer() {
        const hmrScript = `
<script>
    const eventSource = new EventSource('/__hmr');

    eventSource.onmessage = (event) => {
        if (event.data === 'reload') {
            console.log('🔄 Reloading page...');
            location.reload();
        }
    };
    eventSource.onerror = () => {
        console.log('HMR connection lost');
    };
</script>`;

        // HMR endpoint — registered before the HTML catch-all below.
        this.app.get('/__hmr', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders && res.flushHeaders();

            res.write('data: connected\n\n');
            this.clients.add(res);

            req.on('close', () => {
                this.clients.delete(res);
                console.log('HMR client disconnected');
            });
        });

        // HTML pages: injected with the HMR client. This must run before
        // express.static, which would serve index.html verbatim.
        this.app.get('*', (req, res, next) => {
            if (path.extname(req.path)) return next();
            const indexPath = path.join(this.publicDir, 'index.html');
            if (!fs.existsSync(indexPath)) return next();
            let html = fs.readFileSync(indexPath, 'utf-8');

            // index.html ships production React so `lsx build` output is
            // deployable as-is; swap in the development build while serving
            // locally so dev warnings and readable errors stay available.
            html = html
                .replace('umd/react.production.min.js', 'umd/react.development.js')
                .replace('umd/react-dom.production.min.js', 'umd/react-dom.development.js');

            if (html.includes('</body>')) {
                html = html.replace('</body>', `${hmrScript}</body>`);
            }
            res.type('html').send(html);
        });

        // Serve static files from dist directory
        this.app.use('/dist', express.static(this.distDir));

        // Serve static files from public directory
        this.app.use(express.static(this.publicDir));

        // Not found
        this.app.use((req, res) => {
            res.status(404).send('index.html not found. Make sure you have a public/index.html file.');
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).send(`Internal Server Error: ${err.message}`);
        });
    }

    /**
     * Build all .lsx files, then bundle the result for the browser.
     */
    async build() {
        if (this.building) {
            console.log('⏳ Build already in progress, queuing a rebuild...');
            this.rebuildQueued = true;
            return;
        }

        this.building = true;
        const startTime = Date.now();
        let ok = false;

        try {
            // Ensure dist directory exists
            if (!fs.existsSync(this.distDir)) {
                fs.mkdirSync(this.distDir, { recursive: true });
            }

            // Find all .lsx files
            const lsxFiles = this.findLSXFiles(this.srcDir);

            if (lsxFiles.length === 0) {
                console.warn('⚠️  No .lsx files found in src/');
                return;
            }

            console.log(`🔨 Building ${lsxFiles.length} file(s)...`);

            let successCount = 0;
            let errorCount = 0;

            for (const file of lsxFiles) {
                try {
                    const relativePath = path.relative(this.srcDir, file);
                    const outputPath = path.join(this.distDir, relativePath.replace('.lsx', '.js'));

                    // Ensure output directory exists
                    const outputDir = path.dirname(outputPath);
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }

                    // compile() lowers JSX with Babel, so dist holds plain JS
                    const source = fs.readFileSync(file, 'utf-8');
                    const { code, warnings } = this.transpiler.compile(source, {
                        filename: file,
                        sourceMaps: this.config.sourceMaps,
                        minify: this.config.minify,
                        typeCheck: this.config.typeCheck,
                        browser: false,
                    });

                    fs.writeFileSync(outputPath, code, 'utf-8');

                    // Show warnings
                    warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));

                    successCount++;
                } catch (err) {
                    errorCount++;
                    console.error(`  ❌ Error transpiling ${file}:`);
                    console.error(`     ${err.message}`);
                    if (err.lsxStage) {
                        console.error(`     Stage: ${err.lsxStage}`);
                    }
                }
            }

            // Bundle for the browser (index.html loads dist/bundle/*.js)
            if (successCount > 0) {
                const bundler = new LSXBundler();
                const bundleDir = path.join(this.distDir, 'bundle');
                try {
                    const { bundles, warnings, failures } = await bundler.bundleDirectory(this.distDir, bundleDir, {
                        sourcemap: this.config.sourceMaps,
                        minify: this.config.minify,
                        globalName: 'LSXApp',
                    });
                    warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));

                    if (failures.length > 0) {
                        failures.forEach((failure) => {
                            errorCount++;
                            console.error(`  ❌ Failed to bundle ${failure.file}:`);
                            console.error(`     ${failure.message}`);
                        });
                    } else {
                        console.log(`📦 Bundled ${bundles.length} file(s)`);
                    }
                } catch (err) {
                    errorCount++;
                    console.error(`  ❌ Bundle failed: ${err.message}`);
                }
            }

            const elapsed = Date.now() - startTime;
            if (errorCount > 0) {
                console.log(`⚠️  Build finished in ${elapsed}ms (${successCount} succeeded, ${errorCount} failed)`);
            } else {
                console.log(`✅ Build complete in ${elapsed}ms (${successCount} file(s))`);
                ok = true;
            }
        } catch (err) {
            console.error('❌ Build failed:', err.message);
        } finally {
            this.building = false;
            if (ok) this.triggerReload();
            if (this.rebuildQueued) {
                this.rebuildQueued = false;
                this.build();
            }
        }
    }

    /**
     * Find all .lsx files recursively
     */
    findLSXFiles(dir) {
        const files = [];

        if (!fs.existsSync(dir)) {
            return files;
        }

        const items = fs.readdirSync(dir);

        items.forEach((item) => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                files.push(...this.findLSXFiles(fullPath));
            } else if (item.endsWith('.lsx')) {
                files.push(fullPath);
            }
        });

        return files;
    }

    /**
     * Trigger a page reload for every connected SSE client.
     */
    triggerReload() {
        if (!this.clients.size) {
            console.log('🔄 Changes built - no HMR clients connected');
            return;
        }
        let sent = 0;
        for (const res of this.clients) {
            try {
                res.write('data: reload\n\n');
                sent++;
            } catch (err) {
                this.clients.delete(res);
            }
        }
        console.log(`🔄 Reload sent to ${sent} client(s)`);
    }

    /**
     * Stop the development server
     */
    stop() {
        if (this.watcher) {
            this.watcher.close();
            console.log('🛑 File watcher stopped');
        }
    }
}

// Export for use in CLI
module.exports = DevServer;

// If run directly, start the server
if (require.main === module) {
    const server = new DevServer();
    server.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        server.stop();
        process.exit(0);
    });
}
