#!/usr/bin/env node

/**
 * LSX CLI Tool
 * Command-line interface for LSX
 */

const fs = require('fs');
const path = require('path');
const LSXTranspiler = require('./transpiler');
const LSXBundler = require('./bundler');
const { loadConfig, createConfig } = require('./config');

const args = process.argv.slice(2);
const command = args[0];
const commandArg = args[1];

function showHelp() {
    console.log(`
LSX - The Easiest Programming Language

Commands:
  lsx init <project-name>    Create a new LSX project
  lsx build                  Build LSX project to JavaScript
  lsx dev [port]             Start development server (default port: 3000)
  lsx add component <name>   Add a new component
  lsx add page <name>        Add a new page

Examples:
  lsx init my-app
  lsx build
  lsx dev
  lsx dev 8080
  lsx add component Header
  lsx add page Home
`);
}

async function executeCommand() {
    switch (command) {
        case 'init':
            if (commandArg) {
                createProject(commandArg);
            } else {
                console.log('Error: Please provide a project name');
                console.log('Usage: lsx init <project-name>');
            }
            break;
        case 'build':
            await buildProject();
            break;
        case 'dev':
            const port = commandArg ? parseInt(commandArg, 10) : 3000;
            startDevServer(port);
            break;
        case 'add':
            if (commandArg && args[2]) {
                const type = commandArg;
                const name = args[2];
                if (type === 'component') {
                    addComponent(name);
                } else if (type === 'page') {
                    addPage(name);
                } else {
                    console.log('Error: Invalid type. Use "component" or "page"');
                }
            } else {
                console.log('Error: Please provide type and name');
                console.log('Usage: lsx add component <name> or lsx add page <name>');
            }
            break;
        default:
            showHelp();
    }
}

/**
 * Create new LSX project
 */
function createProject(projectName) {
    const projectPath = path.join(process.cwd(), projectName);

    console.log(`Creating LSX project: ${projectName}`);

    // Create directory structure
    const dirs = [
        path.join(projectPath, 'src'),
        path.join(projectPath, 'src', 'components'),
        path.join(projectPath, 'src', 'pages'),
        path.join(projectPath, 'public'),
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Create package.json
    // No runtime dependencies: React is loaded from the CDN by index.html and
    // server.js uses only Node core modules, so scaffolded output runs without
    // an npm install.
    const packageJson = {
        name: projectName,
        version: '1.0.0',
        private: true,
        scripts: {
            dev: 'lsx dev',
            build: 'lsx build',
            start: 'lsx build && node server.js'
        }
    };

    fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );

    // Create lsx.config.json
    createConfig(projectPath, {
        entry: './src/App.lsx',
        output: './dist',
        publicDir: './public'
    });

    // Create App.lsx
    const appLsx = `import { Header, Footer, Section, Body } from '@lsx/core'

component App {
    render {
        return <Page>
            <Header title="Welcome to LSX" />
            <Section>
                <Body>
                    <h1>Hello, World!</h1>
                    <p>This is your first LSX application.</p>
                </Body>
            </Section>
            <Footer copyright="2024" />
        </Page>
    }
}

export default App
`;

    fs.writeFileSync(path.join(projectPath, 'src', 'App.lsx'), appLsx);

    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
</head>
<body>
    <div id="root"></div>
    <script src="./dist/bundle/App.js"></script>
    <script>
        const App = LSXApp.default || LSXApp.App_default;
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script>
</body>
</html>
`;

    fs.writeFileSync(path.join(projectPath, 'public', 'index.html'), indexHtml);

    // Production server referenced by the "start" script above. Serves the
    // static app exactly like the dev server does (public/ + /dist). Node core
    // only — a freshly scaffolded app must run without an npm install.
    const serverJs = `'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

// Coerce to a number: some environments export PORT=0 (or a non-numeric
// value), and passing that straight to listen() would bind an unexpected port.
const port = Number(process.env.PORT) || 3000;

// Two roots: /dist serves the compiled bundle (public/index.html loads
// ./dist/bundle/App.js), everything else comes from public/.
const roots = [
    { prefix: '/dist', dir: path.join(__dirname, 'dist') },
    { prefix: '/', dir: path.join(__dirname, 'public') }
];

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8'
};

function resolveFile(urlPath) {
    let pathname;
    try {
        pathname = decodeURIComponent(urlPath.split('?')[0]);
    } catch (err) {
        return null;
    }

    for (const root of roots) {
        if (pathname.indexOf(root.prefix) !== 0) continue;

        let relative = pathname.slice(root.prefix.length);
        while (relative.charAt(0) === '/') relative = relative.slice(1);
        if (relative === '' && root.prefix === '/') relative = 'index.html';

        const full = path.normalize(path.join(root.dir, relative));
        if (full !== root.dir && full.indexOf(root.dir + path.sep) !== 0) continue;

        try {
            if (fs.statSync(full).isFile()) return full;
        } catch (err) {
            // Not a file under this root; try the next one.
        }
    }
    return null;
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('405 Method Not Allowed');
        return;
    }

    const file = resolveFile(req.url || '/');
    if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
    }

    res.writeHead(200, {
        'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
        res.end();
        return;
    }

    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
});

server.listen(port, () => {
    console.log('✅ Serving ${projectName} at http://localhost:' + port);
});
`;

    fs.writeFileSync(path.join(projectPath, 'server.js'), serverJs);

    console.log('✅ Project created successfully!');
    console.log(`\nNext steps:`);
    console.log(`  cd ${projectName}`);
    console.log(`  lsx dev      # development server with hot reload`);
    console.log(`  npm start    # production build + serve`);
    console.log(`\nNo npm install required.`);
}

/**
 * Build project
 */
async function buildProject() {
    const transpiler = new LSXTranspiler();
    const config = loadConfig();

    console.log('Building LSX project...');

    const srcDir = path.dirname(config.entry);
    const distDir = config.output;

    if (!fs.existsSync(srcDir)) {
        console.error('Error: Missing src/ directory.');
        console.error('Create a project with "lsx init <project-name>" or initialize src/ before building.');
        process.exitCode = 1;
        return;
    }

    // Create dist directory
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    // Find all .lsx files recursively
    const lsxFiles = findLSXFiles(srcDir);

    if (lsxFiles.length === 0) {
        console.warn('No .lsx files found in src/. Nothing was built.');
        process.exitCode = 1;
        return;
    }

    console.log(`Building ${lsxFiles.length} file(s)...`);

    if (config.sourceMaps) {
        console.log('Source maps enabled');
    }

    if (config.minify) {
        console.log('Minification enabled');
    }

    let successCount = 0;
    let errorCount = 0;

    lsxFiles.forEach((file) => {
        try {
            const relativePath = path.relative(srcDir, file);
            const outputPath = path.join(distDir, relativePath.replace('.lsx', '.js'));

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Read source
            const source = fs.readFileSync(file, 'utf-8');

            // Use compile to get plain JavaScript (Babel lowers JSX and handles imports)
            const { code, warnings } = transpiler.compile(source, {
                filename: file,
                sourceMaps: config.sourceMaps,
                minify: config.minify,
                typeCheck: config.typeCheck,
                browser: false  // Use ES6 modules for now
            });

            fs.writeFileSync(outputPath, code, 'utf-8');

            // Show warnings
            warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));

            successCount++;
        } catch (err) {
            errorCount++;
            console.error(`\n❌ Error transpiling ${file}:`);
            console.error(`   ${err.message}`);
            if (err.lsxStage) {
                console.error(`   Stage: ${err.lsxStage}`);
            }
            if (err.line && err.col) {
                console.error(`   Location: line ${err.line}, column ${err.col}`);
            }
            if (err.lsxMessage) {
                console.error(`\n${err.lsxMessage}`);
            }
        }
    });

    if (errorCount > 0) {
        console.log(`⚠️  Build complete with ${errorCount} error(s)`);
        process.exitCode = 1;
    } else {
        console.log(`✅ Build complete! (${successCount} file(s))`);
        
        // Bundle for browser use
        console.log('Bundling for browser...');
        const bundler = new LSXBundler();
        const bundleDir = path.join(distDir, 'bundle');
        
        try {
            const { bundles, warnings: bundleWarnings, failures } = await bundler.bundleDirectory(distDir, bundleDir, {
                sourcemap: config.sourceMaps,
                minify: config.minify,
                globalName: 'LSXApp'
            });

            bundleWarnings.forEach(w => console.warn(`  ⚠️  ${w}`));

            if (failures.length > 0) {
                failures.forEach((failure) => {
                    console.error(`\n❌ Failed to bundle ${failure.file}:`);
                    console.error(`   ${failure.message}`);
                });
                console.error(`\n❌ Bundle failed for ${failures.length} file(s). No usable bundle was written.`);
                process.exitCode = 1;
            } else {
                console.log(`✅ Bundle complete! (${bundles.length} file(s))`);
            }
        } catch (err) {
            console.error(`❌ Bundle failed: ${err.message}`);
            process.exitCode = 1;
        }
    }
}

/**
 * Find all .lsx files recursively
 */
function findLSXFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const items = fs.readdirSync(dir);

    items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...findLSXFiles(fullPath));
        } else if (item.endsWith('.lsx')) {
            files.push(fullPath);
        }
    });

    return files;
}

/**
 * Start development server
 */
function startDevServer(port) {
    const DevServer = require('./dev-server');
    const server = new DevServer({ port });
    server.start();
}

/**
 * Add component
 */
function addComponent(name) {
    const componentsDir = path.join(process.cwd(), 'src', 'components');
    const componentPath = path.join(componentsDir, `${name}.lsx`);

    const componentTemplate = `component ${name} {
    props {
        // Add props here
    }

    render {
        return <div>
            <p>${name} Component</p>
        </div>
    }
}

export default ${name}
`;

    if (!fs.existsSync(componentsDir)) {
        fs.mkdirSync(componentsDir, { recursive: true });
    }

    fs.writeFileSync(componentPath, componentTemplate);
    console.log(`✅ Component created: ${name}.lsx`);
}

/**
 * Add page
 */
function addPage(name) {
    const pagesDir = path.join(process.cwd(), 'src', 'pages');
    const pagePath = path.join(pagesDir, `${name}.lsx`);

    const pageTemplate = `component ${name} {
    render {
        return <div>
            <h1>${name}</h1>
            <p>This is the ${name} page.</p>
        </div>
    }
}

export default ${name}
`;

    if (!fs.existsSync(pagesDir)) {
        fs.mkdirSync(pagesDir, { recursive: true });
    }

    fs.writeFileSync(pagePath, pageTemplate);
    console.log(`✅ Page created: ${name}.lsx`);
}

// Execute command
(async () => {
    await executeCommand();
})();
