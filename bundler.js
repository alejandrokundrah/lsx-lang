'use strict';

/**
 * LSX Bundler
 *
 * Bundles transpiled LSX code into browser-ready JavaScript using esbuild.
 * This is needed because browsers can't directly load ES6 modules with imports.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// index.html loads React as UMD globals, so the bundle must use those same
// instances — bundling a second copy of React breaks hooks.
const UMD_GLOBALS = {
    react: 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    'react/jsx-runtime': 'React',
    'react/jsx-dev-runtime': 'React',
};

const umdGlobalsPlugin = {
    name: 'lsx-umd-globals',
    setup(build) {
        build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => {
            if (!UMD_GLOBALS[args.path]) return null;
            return { path: args.path, namespace: 'lsx-umd' };
        });
        build.onLoad({ filter: /.*/, namespace: 'lsx-umd' }, (args) => {
            const globalName = UMD_GLOBALS[args.path];
            const contents = [
                `if (typeof ${globalName} === 'undefined') {`,
                `  throw new Error('LSX: missing global "${globalName}" — load React from a <script> tag before the bundle.');`,
                `}`,
                `module.exports = ${globalName};`,
            ].join('\n');
            return { contents, loader: 'js' };
        });
    },
};

// @lsx/core ships inside this package (packages/lsx-core), so a project can
// bundle without installing it separately — required for `lsx init` projects,
// since @lsx/core is not published to npm.
const CORE_PACKAGE_DIR = path.join(__dirname, 'packages', 'lsx-core');

const coreFallbackPlugin = {
    name: 'lsx-core-fallback',
    setup(build) {
        build.onResolve({ filter: /^@lsx\/core$/ }, (args) => {
            // Prefer a copy installed in the user's own project.
            try {
                return { path: require.resolve('@lsx/core', { paths: [args.resolveDir] }) };
            } catch (err) {
                // Not installed locally — fall through to the bundled copy.
            }

            const bundledEntry = path.join(CORE_PACKAGE_DIR, 'index.js');
            if (fs.existsSync(bundledEntry)) {
                return { path: bundledEntry };
            }

            // Nothing to fall back to: let esbuild report its own error.
            return null;
        });
    },
};

class LSXBundler {
    /**
     * Bundle LSX transpiled code for browser use.
     * @param {string} entryPath - Path to the entry file (e.g., dist/App.js)
     * @param {string} outputPath - Path where the bundled file should be written
     * @param {object} options - Bundle options
     * @returns {Promise<{bundlePath: string, warnings: string[]}>}
     */
    async bundle(entryPath, outputPath, options = {}) {
        const warnings = [];
        
        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        try {
            const result = await esbuild.build({
                entryPoints: [entryPath],
                bundle: true,
                plugins: [umdGlobalsPlugin, coreFallbackPlugin],
                outfile: outputPath,
                format: 'iife',  // Immediately-invoked function expression for browser
                globalName: options.globalName || 'LSXApp',
                sourcemap: options.sourcemap || false,
                minify: options.minify || false,
                target: options.target || 'es2015',
                external: options.external || [],
                loader: options.loader || {},
                banner: options.banner ? { js: options.banner } : undefined,
                footer: options.footer ? { js: options.footer } : undefined,
                logLevel: 'error',
            });

            if (result.warnings) {
                result.warnings.forEach(w => warnings.push(w.text));
            }

            return { bundlePath: outputPath, warnings };
        } catch (err) {
            throw new Error(`Bundle failed: ${err.message}`);
        }
    }

    /**
     * Bundle a directory of transpiled files.
     * @param {string} distDir - Directory containing transpiled files
     * @param {string} bundleDir - Directory where bundles should be written
     * @param {object} options - Bundle options
     * @returns {Promise<{bundles: string[], warnings: string[], failures: {file: string, message: string}[]}>}
     */
    async bundleDirectory(distDir, bundleDir, options = {}) {
        const warnings = [];
        const bundles = [];
        const failures = [];

        // Ensure bundle directory exists
        if (!fs.existsSync(bundleDir)) {
            fs.mkdirSync(bundleDir, { recursive: true });
        }

        // Find all .js files in dist directory
        const files = fs.readdirSync(distDir);
        const jsFiles = files.filter(f => f.endsWith('.js'));

        for (const file of jsFiles) {
            const entryPath = path.join(distDir, file);
            const outputPath = path.join(bundleDir, file);
            
            try {
                const result = await this.bundle(entryPath, outputPath, options);
                bundles.push(result.bundlePath);
                warnings.push(...result.warnings);
            } catch (err) {
                failures.push({ file, message: err.message });
            }
        }

        return { bundles, warnings, failures };
    }
}

module.exports = LSXBundler;
