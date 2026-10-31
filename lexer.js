'use strict';

/**
 * LSX Lexer
 *
 * Produces a flat token stream for the LSX grammar. Two things make this
 * different from a plain JavaScript tokenizer:
 *
 *  1. JSX children are scanned as raw text (jsxText) until the next `<` or
 *     `{`, because `Hello, World!` is not valid JavaScript tokenization.
 *  2. The parser flips `inChildren` on and off at the exact points where the
 *     context changes (opening tag consumed -> children, closing tag consumed
 *     -> back to code). Whenever that flag changes we rewind any token that
 *     was already peeked so it gets re-scanned under the new mode.
 *
 * Token shape: { type, value, raw, start, end, line, col }
 * Types: 'num' | 'str' | 'tmpl' | 'ident' | 'kw' | 'punct' | 'jsxText' | 'eof'
 */

// Note: `props`, `state`, `render`, `effect`, `cleanup` and `style` are purely
// contextual (they only mean something inside a component body), so they stay
// ordinary identifiers and can still be used as names or in expressions.
const KEYWORDS = new Set([
    'component', 'fn',
    'import', 'export', 'default', 'from', 'as',
    'if', 'else', 'for', 'in', 'of', 'while', 'do',
    'return', 'break', 'continue',
    'const', 'let', 'var', 'function', 'async', 'await',
    'new', 'typeof', 'instanceof', 'void', 'delete', 'throw', 'try', 'catch',
    'finally', 'true', 'false', 'null', 'undefined', 'this', 'super', 'yield',
    'class', 'extends',
]);

// Longest first so `>>>` wins over `>>` over `>`.
const PUNCTUATORS = [
    '>>>=', '...', '===', '!==', '<<=', '>>=', '**=', '>>>',
    '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '++', '--',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**',
    '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/',
    '%', '=', '!', '&', '|', '^', '~', '?', ':', '.', '#',
].sort((a, b) => b.length - a.length);

function isIdentStart(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
}

function isIdentPart(c) {
    return isIdentStart(c) || (c >= '0' && c <= '9');
}

function isDigit(c) {
    return c >= '0' && c <= '9';
}

class Lexer {
    constructor(source, options) {
        options = options || {};
        this.src = typeof source === 'string' ? source : String(source);
        this.filename = options.filename || '<lsx>';
        this.pos = 0;
        this.line = 1;
        this.col = 1;
        this.inChildren = false;
        this.peeked = null;
    }

    // -- error reporting ---------------------------------------------------

    makeError(message, line, col) {
        const lines = this.src.split('\n');
        const sourceLine = lines[line - 1] !== undefined ? lines[line - 1] : '';
        const gutter = String(line) + ' | ';
        const caret = ' '.repeat(gutter.length + Math.max(0, col - 1)) + '^';
        const err = new SyntaxError(
            `${this.filename}:${line}:${col}: ${message}\n${gutter}${sourceLine}\n${caret}`
        );
        err.line = line;
        err.col = col;
        err.filename = this.filename;
        return err;
    }

    fail(message, token) {
        const t = token || { line: this.line, col: this.col };
        throw this.makeError(message, t.line, t.col);
    }

    // -- low level ---------------------------------------------------------

    advance(n) {
        for (let i = 0; i < n && this.pos < this.src.length; i++) {
            if (this.src[this.pos] === '\n') {
                this.line += 1;
                this.col = 1;
            } else {
                this.col += 1;
            }
            this.pos += 1;
        }
    }

    token(type, value, start, startLine, startCol) {
        return {
            type,
            value,
            raw: this.src.slice(start, this.pos),
            start,
            end: this.pos,
            line: startLine,
            col: startCol,
        };
    }

    /**
     * Flip JSX children mode. Any already-peeked token was scanned under the
     * old mode, so rewind to its start position and let it be re-scanned.
     */
    setChildren(value) {
        if (this.inChildren === value) return;
        if (this.peeked) {
            this.pos = this.peeked.start;
            this.line = this.peeked.line;
            this.col = this.peeked.col;
            this.peeked = null;
        }
        this.inChildren = value;
    }

    peek() {
        if (!this.peeked) this.peeked = this.scan();
        return this.peeked;
    }

    next() {
        if (this.peeked) {
            const t = this.peeked;
            this.peeked = null;
            return t;
        }
        return this.scan();
    }

    // -- scanning ----------------------------------------------------------

    scan() {
        if (this.inChildren) return this.scanChildren();
        this.skipTrivia();

        const src = this.src;
        if (this.pos >= src.length) {
            return this.token('eof', '', this.pos, this.line, this.col);
        }

        const startLine = this.line;
        const startCol = this.col;
        const start = this.pos;
        const c = src[start];

        if (isDigit(c) || (c === '.' && isDigit(src[start + 1]))) {
            return this.scanNumber(start, startLine, startCol);
        }
        if (c === '"' || c === "'") {
            return this.scanString(start, startLine, startCol);
        }
        if (c === '`') {
            return this.scanTemplate(start, startLine, startCol);
        }
        if (isIdentStart(c)) {
            this.advance(1);
            while (this.pos < src.length && isIdentPart(src[this.pos])) this.advance(1);
            const text = src.slice(start, this.pos);
            return this.token(KEYWORDS.has(text) ? 'kw' : 'ident', text, start, startLine, startCol);
        }

        for (const p of PUNCTUATORS) {
            if (src.startsWith(p, start)) {
                this.advance(p.length);
                return this.token('punct', p, start, startLine, startCol);
            }
        }

        throw this.makeError(`Unexpected character ${JSON.stringify(c)}`, startLine, startCol);
    }

    skipTrivia() {
        const src = this.src;
        for (;;) {
            if (this.pos >= src.length) return;
            const c = src[this.pos];
            if (c === '\n' || c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
                this.advance(1);
                continue;
            }
            if (c === '/' && src[this.pos + 1] === '/') {
                while (this.pos < src.length && src[this.pos] !== '\n') this.advance(1);
                continue;
            }
            if (c === '/' && src[this.pos + 1] === '*') {
                const line = this.line;
                const col = this.col;
                this.advance(2);
                for (;;) {
                    if (this.pos >= src.length) {
                        throw this.makeError('Unterminated block comment', line, col);
                    }
                    if (src[this.pos] === '*' && src[this.pos + 1] === '/') {
                        this.advance(2);
                        break;
                    }
                    this.advance(1);
                }
                continue;
            }
            return;
        }
    }

    scanNumber(start, startLine, startCol) {
        const src = this.src;
        if (src[this.pos] === '0' && (src[this.pos + 1] === 'x' || src[this.pos + 1] === 'X')) {
            this.advance(2);
            while (this.pos < src.length && /[0-9a-fA-F_]/.test(src[this.pos])) this.advance(1);
        } else if (src[this.pos] === '0' && (src[this.pos + 1] === 'b' || src[this.pos + 1] === 'B')) {
            this.advance(2);
            while (this.pos < src.length && /[01_]/.test(src[this.pos])) this.advance(1);
        } else {
            while (this.pos < src.length && /[0-9_]/.test(src[this.pos])) this.advance(1);
            if (src[this.pos] === '.') {
                this.advance(1);
                while (this.pos < src.length && /[0-9_]/.test(src[this.pos])) this.advance(1);
            }
            if (src[this.pos] === 'e' || src[this.pos] === 'E') {
                this.advance(1);
                if (src[this.pos] === '+' || src[this.pos] === '-') this.advance(1);
                while (this.pos < src.length && isDigit(src[this.pos])) this.advance(1);
            }
        }
        const raw = src.slice(start, this.pos);
        return this.token('num', Number(raw.replace(/_/g, '')), start, startLine, startCol);
    }

    scanString(start, startLine, startCol) {
        const src = this.src;
        const quote = src[this.pos];
        this.advance(1);
        let out = '';
        for (;;) {
            if (this.pos >= src.length) {
                throw this.makeError('Unterminated string literal', startLine, startCol);
            }
            const c = src[this.pos];
            if (c === quote) {
                this.advance(1);
                break;
            }
            if (c === '\n') {
                throw this.makeError('Unterminated string literal', startLine, startCol);
            }
            if (c === '\\') {
                this.advance(1);
                if (this.pos >= src.length) continue;
                const esc = src[this.pos];
                const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
                if (esc === 'u' || esc === 'x') {
                    const size = esc === 'u' ? 4 : 2;
                    const hex = src.substr(this.pos + 1, size);
                    out += String.fromCharCode(parseInt(hex, 16));
                    this.advance(1 + size);
                    continue;
                }
                out += map[esc] !== undefined ? map[esc] : esc;
                this.advance(1);
                continue;
            }
            out += c;
            this.advance(1);
        }
        return this.token('str', out, start, startLine, startCol);
    }

    scanTemplate(start, startLine, startCol) {
        const src = this.src;
        this.advance(1); // opening backtick
        for (;;) {
            if (this.pos >= src.length) {
                throw this.makeError('Unterminated template literal', startLine, startCol);
            }
            if (src[this.pos] === '\\') {
                this.advance(2);
                continue;
            }
            if (src[this.pos] === '`') {
                this.advance(1);
                break;
            }
            this.advance(1);
        }
        // Template contents are emitted verbatim; `${...}` holes are passed
        // through untouched (state rewrites inside templates are not supported).
        return this.token('tmpl', src.slice(start, this.pos), start, startLine, startCol);
    }

    /**
     * Inside JSX children everything is raw text until `<` (next tag) or
     * `{` (expression container).
     */
    scanChildren() {
        const src = this.src;
        const startLine = this.line;
        const startCol = this.col;
        const start = this.pos;

        if (this.pos >= src.length) {
            return this.token('eof', '', start, startLine, startCol);
        }

        const c = src[start];
        if (c === '<' || c === '{') {
            this.advance(1);
            return this.token('punct', c, start, startLine, startCol);
        }

        while (this.pos < src.length && src[this.pos] !== '<' && src[this.pos] !== '{') {
            this.advance(1);
        }
        const raw = src.slice(start, this.pos);
        return this.token('jsxText', raw, start, startLine, startCol);
    }
}

module.exports = Lexer;
module.exports.KEYWORDS = KEYWORDS;
