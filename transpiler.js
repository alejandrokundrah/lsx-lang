'use strict';

/**
 * LSX Transpiler
 *
 * Source -> Lexer -> Parser -> AST -> Codegen -> JS with JSX -> Babel -> JS
 *
 * The heavy lifting lives in lexer.js / parser.js / codegen.js; this module is
 * the pipeline that ties them together and applies the final JSX lowering with
 * @babel/preset-react (already a dependency of this package).
 */

const Parser = require('./parser');
const Codegen = require('./codegen');
const TypeChecker = require('./type-checker');

// Default core component names from @lsx/core
const DEFAULT_CORE_NAMES = [
    'Page', 'Header', 'Footer', 'Section', 'Body',
    'Button', 'Card', 'Modal', 'Grid', 'Flex', 'Input',
    'Router', 'Link',
    'get', 'post', 'put', 'del'
];

class LSXTranspiler {
    /**
     * @param {object} options
     * @param {string[]} options.coreNames components exported by @lsx/core,
     *                                     used to auto-import missing tags
     */
    constructor(options) {
        this.options = options || {};
        this.coreNames = this.options.coreNames || DEFAULT_CORE_NAMES;
        this.warnings = [];
    }

    /** Parse LSX source into an AST. */
    parse(source, filename) {
        return new Parser(source, { filename: filename || '<lsx>' }).parseProgram();
    }

    /**
     * Transpile LSX source to JavaScript containing JSX.
     * @returns {{ code: string, warnings: string[] }}
     */
    transpile(source, options) {
        options = options || {};
        const filename = options.filename || '<lsx>';
        const program = this.parse(source, filename);
        const warnings = [];

        // Run type checking if enabled
        if (options.typeCheck) {
            const checker = new TypeChecker();
            const typeResult = checker.check(program);
            typeResult.errors.forEach((err) => {
                warnings.push(`Type error: ${err.message}`);
            });
            typeResult.warnings.forEach((warn) => {
                warnings.push(`Type warning: ${warn.message}`);
            });
        }

        const generator = new Codegen(program, {
            coreNames: options.coreNames || this.coreNames,
            filename,
        });
        const code = generator.generate();
        warnings.push(...generator.warnings);

        // Warnings are per-transpile: accumulating across calls would re-report
        // earlier files' warnings on every subsequent file.
        this.warnings = warnings;
        return { code, warnings };
    }

    /**
     * Transpile and lower JSX, returning plain JavaScript ready for a browser.
     * @returns {{ code: string, warnings: string[] }}
     */
    compile(source, options) {
        const result = this.transpile(source, options);
        const babel = require('@babel/core');
        const enableSourceMaps = (options && options.sourceMaps) || false;
        const enableMinify = (options && options.minify) || false;
        const browser = (options && options.browser) || false;

        const presets = [
            [require.resolve('@babel/preset-react'), { runtime: 'classic' }]
        ];

        // Add @babel/preset-env for modern JS features
        const envOptions = {
            targets: '> 0.25%, not dead',
            modules: browser ? 'umd' : false  // UMD for browser, false for build tools
        };
        presets.push([require.resolve('@babel/preset-env'), envOptions]);

        // Add minification preset if enabled
        if (enableMinify) {
            presets.push(require.resolve('babel-preset-minify'));
        }

        let lowered;
        try {
            lowered = babel.transformSync(result.code, {
                filename: (options && options.filename) || 'module.lsx.jsx',
                presets,
                configFile: false,
                babelrc: false,
                sourceMaps: enableSourceMaps ? 'inline' : false,
                compact: enableMinify,
                comments: !enableMinify,
            });
        } catch (err) {
            err.lsxStage = 'jsx-lowering';
            err.lsxGenerated = result.code;
            err.lsxMessage = this.formatBabelError(err);
            throw err;
        }
        return { code: lowered.code, warnings: result.warnings };
    }

    /**
     * Format Babel errors with helpful context
     */
    formatBabelError(err) {
        let message = err.message || 'Unknown Babel error';

        // Add common fixes
        if (message.includes('Unexpected token')) {
            message += '\n\n💡 Common fixes:';
            message += '\n  - Check for unclosed brackets or braces';
            message += '\n  - Verify JSX syntax (all tags must be closed)';
            message += '\n  - Check for missing commas in arrays/objects';
        }

        if (message.includes('is not defined')) {
            message += '\n\n💡 Common fixes:';
            message += '\n  - Ensure the component or variable is imported';
            message += '\n  - Check for typos in variable names';
            message += '\n  - Verify the component is defined before use';
        }

        return message;
    }

    /**
     * Transpile a single file (kept for compatibility with older callers).
     */
    transpileFile(inputPath, outputPath, options) {
        options = options || {};
        const fs = require('fs');
        const source = fs.readFileSync(inputPath, 'utf-8');
        const { code, warnings } = this.transpile(source, {
            filename: inputPath,
            sourceMaps: options.sourceMaps,
            minify: options.minify,
            typescript: options.typescript
        });
        fs.writeFileSync(outputPath, code, 'utf-8');
        warnings.forEach((w) => console.warn(`warning: ${w}`));
        console.log(`Transpiled: ${inputPath} → ${outputPath}`);
        return { code, warnings };
    }
}

module.exports = LSXTranspiler;
