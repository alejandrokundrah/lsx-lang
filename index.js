'use strict';

/**
 * LSX (Lumina Syntax eXtended) — public API.
 *
 * The `lsx` CLI is the primary interface; these exports let build tools,
 * test harnesses and editors drive the pipeline programmatically:
 *
 *   const { LSXTranspiler, LSXBundler, loadConfig } = require('lsx-lang');
 */

const LSXTranspiler = require('./transpiler');
const LSXBundler = require('./bundler');
const TypeChecker = require('./type-checker');
const { loadConfig, createConfig, validateConfig, DEFAULT_CONFIG } = require('./config');

module.exports = {
    LSXTranspiler,
    LSXBundler,
    TypeChecker,
    loadConfig,
    createConfig,
    validateConfig,
    DEFAULT_CONFIG,
};
