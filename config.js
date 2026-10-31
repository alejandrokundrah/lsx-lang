'use strict';

/**
 * LSX Configuration System
 *
 * Handles loading, validating, and providing defaults for lsx.config.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    entry: './src/App.lsx',
    output: './dist',
    publicDir: './public',
    port: 3000,
    sourceMaps: false,
    minify: false,
    hotReload: true,
    typeCheck: false,
    babel: {
        presets: ['@babel/preset-react'],
        plugins: []
    }
};

/**
 * Load and validate configuration
 */
function loadConfig(projectDir) {
    projectDir = projectDir || process.cwd();
    const configPath = path.join(projectDir, 'lsx.config.json');

    if (!fs.existsSync(configPath)) {
        console.log('No lsx.config.json found, using defaults');
        return { ...DEFAULT_CONFIG };
    }

    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(configContent);

        // Merge with defaults
        const config = { ...DEFAULT_CONFIG, ...userConfig };

        // Validate paths
        if (config.entry && !path.isAbsolute(config.entry)) {
            config.entry = path.join(projectDir, config.entry);
        }
        if (config.output && !path.isAbsolute(config.output)) {
            config.output = path.join(projectDir, config.output);
        }
        if (config.publicDir && !path.isAbsolute(config.publicDir)) {
            config.publicDir = path.join(projectDir, config.publicDir);
        }

        // Validate port
        if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
            console.warn(`Invalid port ${config.port}, using default 3000`);
            config.port = 3000;
        }

        return config;
    } catch (err) {
        console.error(`Error loading lsx.config.json: ${err.message}`);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Create a default configuration file
 */
function createConfig(projectDir, options) {
    projectDir = projectDir || process.cwd();
    const configPath = path.join(projectDir, 'lsx.config.json');

    const config = {
        entry: options.entry || './src/App.lsx',
        output: options.output || './dist',
        publicDir: options.publicDir || './public',
        port: options.port || 3000,
        sourceMaps: options.sourceMaps || false,
        minify: options.minify || false,
        typeCheck: options.typeCheck || false,
        hotReload: options.hotReload !== false
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Created lsx.config.json`);
}

/**
 * Validate configuration
 */
function validateConfig(config) {
    const errors = [];

    if (!config.entry) {
        errors.push('Missing required "entry" field');
    }

    if (!config.output) {
        errors.push('Missing required "output" field');
    }

    if (!config.publicDir) {
        errors.push('Missing required "publicDir" field');
    }

    if (errors.length > 0) {
        throw new Error(`Invalid configuration:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }

    return true;
}

module.exports = {
    loadConfig,
    createConfig,
    validateConfig,
    DEFAULT_CONFIG
};
