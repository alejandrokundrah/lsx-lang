'use strict';

/**
 * LSX Parser
 *
 * A recursive-descent parser: no regex rewriting, so nested blocks, JSX,
 * operators and scope are all handled structurally and every error carries
 * line/column information.
 *
 * AST nodes are plain objects with a `type` field, ESTree-flavoured where it
 * makes sense, plus LSX-specific nodes:
 *
 *   ComponentDeclaration, PropsBlock/StateBlock items, StyleBlock,
 *   EffectDeclaration, MethodDeclaration, CleanupDeclaration
 */

const Lexer = require('./lexer');

const ASSIGN_OPS = new Set([
    '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '**=',
]);

const BINARY_PRECEDENCE = {
    '??': 1, '||': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6, '!=': 6, '===': 6, '!==': 6,
    '<': 7, '<=': 7, '>': 7, '>=': 7, 'instanceof': 7,
    '<<': 8, '>>': 8, '>>>': 8,
    '+': 9, '-': 9,
    '*': 10, '/': 10, '%': 10,
    '**': 11,
};

const LOGICAL = new Set(['||', '&&', '??']);

class Parser {
    constructor(source, options) {
        options = options || {};
        this.filename = options.filename || '<lsx>';
        this.lexer = new Lexer(source, { filename: this.filename });
        this.buf = [];
        this.last = null;
        this.effectDepth = 0;
        this.inStyleBlock = false;
    }

    // -- token plumbing ----------------------------------------------------

    peekAt(n) {
        n = n || 0;
        while (this.buf.length <= n) {
            this.buf.push(this.lexer.next());
        }
        return this.buf[n];
    }

    peek() {
        return this.peekAt(0);
    }

    next() {
        const t = this.buf.length ? this.buf.shift() : this.lexer.next();
        this.last = t;
        return t;
    }

    /** True when the next token starts on a line after the last consumed one. */
    newlineAhead() {
        if (!this.last) return true;
        const lastEndLine = this.last.line + (String(this.last.raw).split('\n').length - 1);
        return this.peek().line > lastEndLine;
    }

    at(type, value) {
        const t = this.peek();
        return t.type === type && (value === undefined || t.value === value);
    }

    eat(type, value) {
        return this.at(type, value) ? this.next() : null;
    }

    expect(type, value, message) {
        if (!this.at(type, value)) {
            const t = this.peek();
            const found = t.type === 'eof' ? 'end of file' : JSON.stringify(t.value);
            this.fail(message || `Expected ${value !== undefined ? JSON.stringify(value) : type} but found ${found}`, t);
        }
        return this.next();
    }

    expectName(message) {
        const t = this.peek();
        if (t.type !== 'ident' && t.type !== 'kw') {
            this.fail(message || 'Expected a name', t);
        }
        return this.next();
    }

    fail(message, token) {
        const t = token || this.peek();
        throw this.lexer.makeError(message, t.line, t.col);
    }

    eatSemicolon() {
        this.eat('punct', ';');
    }

    /**
     * Flip JSX children mode. Buffered tokens were scanned under the old mode,
     * so rewind the lexer to the first unconsumed token and drop the buffer.
     */
    setChildren(value) {
        if (this.buf.length) {
            const first = this.buf[0];
            this.lexer.pos = first.start;
            this.lexer.line = first.line;
            this.lexer.col = first.col;
            this.lexer.peeked = null;
            this.buf = [];
        }
        this.lexer.setChildren(value);
    }

    // -- program ------------------------------------------------------------

    parseProgram() {
        const body = [];
        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') break;
            body.push(this.parseStatement());
        }
        return { type: 'Program', body };
    }

    parseStatement() {
        const t = this.peek();

        if (t.type === 'punct') {
            if (t.value === '{') return this.parseBlock();
            if (t.value === ';') { this.next(); return { type: 'EmptyStatement' }; }
        }

        if (t.type === 'kw') {
            switch (t.value) {
                case 'if': return this.parseIf();
                case 'for': return this.parseFor();
                case 'while': return this.parseWhile();
                case 'return': return this.parseReturn();
                case 'break':
                case 'continue': {
                    this.next();
                    this.eatSemicolon();
                    return { type: t.value === 'break' ? 'BreakStatement' : 'ContinueStatement' };
                }
                case 'const':
                case 'let':
                case 'var': {
                    const decl = this.parseVariableDeclaration();
                    this.eatSemicolon();
                    return decl;
                }
                case 'import': return this.parseImport();
                case 'export': return this.parseExport();
                case 'component': return this.parseComponent();
                case 'fn': return this.parseFunctionDeclaration();
                case 'throw': {
                    this.next();
                    const argument = this.parseExpression();
                    this.eatSemicolon();
                    return { type: 'ThrowStatement', argument };
                }
                case 'try': return this.parseTry();
                case 'do': return this.parseDoWhile();
                default:
                    break;
            }
        }

        if (t.type === 'ident' && t.value === 'cleanup'
            && this.peekAt(1).type === 'punct' && this.peekAt(1).value === '('
            && this.effectDepth > 0) {
            return this.parseCleanupDeclaration();
        }

        const expression = this.parseExpression();
        this.eatSemicolon();
        return { type: 'ExpressionStatement', expression };
    }

    parseBlock() {
        const start = this.expect('punct', '{', 'Expected { to start a block');
        const body = [];
        while (!this.at('punct', '}')) {
            if (this.at('eof')) this.fail('Unterminated block, expected }', start);
            body.push(this.parseStatement());
        }
        this.next();
        return { type: 'BlockStatement', body };
    }

    parseIf() {
        this.expect('kw', 'if');
        this.expect('punct', '(', 'Expected ( after if');
        const test = this.parseExpression();
        this.expect('punct', ')', 'Expected ) after if condition');
        const consequent = this.parseStatement();
        let alternate = null;
        if (this.at('kw', 'else')) {
            this.next();
            alternate = this.parseStatement();
        }
        return { type: 'IfStatement', test, consequent, alternate };
    }

    parseWhile() {
        this.expect('kw', 'while');
        this.expect('punct', '(', 'Expected ( after while');
        const test = this.parseExpression();
        this.expect('punct', ')', 'Expected ) after while condition');
        const body = this.parseStatement();
        return { type: 'WhileStatement', test, body };
    }

    parseDoWhile() {
        this.expect('kw', 'do');
        const body = this.parseStatement();
        this.expect('kw', 'while', 'Expected while after do block');
        this.expect('punct', '(', 'Expected ( after while');
        const test = this.parseExpression();
        this.expect('punct', ')', 'Expected ) after while condition');
        this.eatSemicolon();
        return { type: 'DoWhileStatement', body, test };
    }

    parseTry() {
        this.expect('kw', 'try');
        const block = this.parseBlock();
        let handler = null;
        let finalizer = null;

        if (this.at('kw', 'catch')) {
            this.next();
            this.expect('punct', '(', 'Expected ( after catch');
            const param = this.expectName('Expected a catch parameter');
            this.expect('punct', ')', 'Expected ) after catch parameter');
            const handlerBlock = this.parseBlock();
            handler = { param: param.value, body: handlerBlock };
        }

        if (this.at('kw', 'finally')) {
            this.next();
            finalizer = this.parseBlock();
        }

        if (!handler && !finalizer) {
            this.fail('try statement must have catch or finally', this.peek());
        }

        return { type: 'TryStatement', block, handler, finalizer };
    }

    parseReturn() {
        const tok = this.expect('kw', 'return');
        let argument = null;
        const t = this.peek();
        const stops = (t.type === 'punct' && (t.value === ';' || t.value === '}')) || t.type === 'eof';
        if (!stops) {
            if (t.line !== tok.line) {
                // `return` followed by a newline returns undefined (ASId rules).
                argument = null;
            } else {
                argument = this.parseExpression();
            }
        }
        this.eatSemicolon();
        return { type: 'ReturnStatement', argument };
    }

    parseFor() {
        this.expect('kw', 'for');
        this.expect('punct', '(', 'Expected ( after for');

        let left;
        if (this.at('kw', 'const') || this.at('kw', 'let') || this.at('kw', 'var')) {
            left = this.parseVariableDeclaration();
        } else {
            left = { type: 'ExpressionStatement', expression: this.parseAssignment() };
        }

        if (this.at('kw', 'in') || this.at('kw', 'of')) {
            const kind = this.next().value;
            const right = this.parseExpression();
            this.expect('punct', ')', 'Expected ) after for-in head');
            const body = this.parseStatement();
            return { type: 'ForInStatement', kind, left, right, body };
        }

        this.expect('punct', ';', 'Expected ; in for loop head');
        const test = this.at('punct', ';') ? null : this.parseExpression();
        this.expect('punct', ';', 'Expected ; in for loop head');
        const update = this.at('punct', ')') ? null : this.parseExpression();
        this.expect('punct', ')', 'Expected ) after for loop head');
        const body = this.parseStatement();
        return { type: 'ForStatement', init: left, test, update, body };
    }

    // -- declarations -------------------------------------------------------

    parseVariableDeclaration() {
        const kindTok = this.next();
        const declarations = [];
        do {
            const nameTok = this.expectName('Expected a variable name');
            let id = { type: 'Identifier', name: nameTok.value };
            if (this.eat('punct', ':')) this.skipType();
            let init = null;
            if (this.eat('punct', '=')) {
                init = this.parseAssignment();
            }
            declarations.push({ type: 'VariableDeclarator', id, init });
        } while (this.eat('punct', ','));
        return { type: 'VariableDeclaration', kind: kindTok.value, declarations };
    }

    parseFunctionDeclaration() {
        this.expect('kw', 'fn');
        const nameTok = this.expectName('Expected a function name after fn');
        const params = this.parseParams();
        if (this.eat('punct', ':')) this.skipType();
        const body = this.parseBlock();
        return { type: 'FunctionDeclaration', name: nameTok.value, params, body };
    }

    parseImport() {
        this.expect('kw', 'import');
        const node = { type: 'ImportDeclaration', default: null, namespace: null, names: [], source: null };

        if (this.at('punct', '*')) {
            this.next();
            this.expect('kw', 'as', 'Expected "as" after * in import');
            node.namespace = this.expectName('Expected a namespace name').value;
        } else if (this.at('punct', '{')) {
            this.next();
            this.parseImportNames(node);
        } else if (this.at('ident') || this.at('kw')) {
            node.default = this.next().value;
            if (this.eat('punct', ',')) {
                this.expect('punct', '{', 'Expected { after default import');
                this.parseImportNames(node);
            }
        }

        this.expect('kw', 'from', 'Expected "from" in import statement');
        const sourceTok = this.expect('str', undefined, 'Expected a module path string after "from"');
        node.source = sourceTok.value;
        this.eatSemicolon();
        return node;
    }

    parseImportNames(node) {
        while (!this.at('punct', '}')) {
            const imported = this.expectName('Expected an imported name');
            let local = imported.value;
            if (this.at('kw', 'as')) {
                this.next();
                local = this.expectName('Expected a local name after "as"').value;
            }
            node.names.push({ imported: imported.value, local });
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', '}', 'Expected } to close import list');
    }

    parseExport() {
        this.expect('kw', 'export');

        if (this.at('kw', 'default')) {
            this.next();
            const expression = this.parseAssignment();
            this.eatSemicolon();
            return { type: 'ExportDefaultDeclaration', expression };
        }

        if (this.at('punct', '{')) {
            this.next();
            const names = [];
            while (!this.at('punct', '}')) {
                const local = this.expectName('Expected an exported name');
                let exported = local.value;
                if (this.at('kw', 'as')) {
                    this.next();
                    exported = this.expectName('Expected an export name after "as"').value;
                }
                names.push({ local: local.value, exported });
                if (!this.eat('punct', ',')) break;
            }
            this.expect('punct', '}', 'Expected } to close export list');
            this.eatSemicolon();
            return { type: 'ExportNamedDeclaration', names, declaration: null };
        }

        const declaration = this.parseStatement();
        return { type: 'ExportNamedDeclaration', names: null, declaration };
    }

    // -- component ----------------------------------------------------------

    parseComponent() {
        this.expect('kw', 'component');
        const nameTok = this.expectName('Expected a component name');
        this.expect('punct', '{', 'Expected { after component name');

        const comp = {
            type: 'ComponentDeclaration',
            name: nameTok.value,
            props: [],
            state: [],
            styles: [],
            effects: [],
            methods: [],
            render: null,
        };
        let lastEffect = null;

        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') this.fail('Unterminated component body, expected }', t);
            if (t.type === 'punct' && t.value === '}') { this.next(); break; }

            if (t.type !== 'ident' && t.type !== 'kw') {
                this.fail(`Unexpected ${JSON.stringify(t.value)} in component body`, t);
            }

            const word = t.value;
            const nextIs = (v) => {
                const n = this.peekAt(1);
                return n.type === 'punct' && n.value === v;
            };

            if (word === 'props' && nextIs('{')) {
                if (comp.props.length) this.fail('Duplicate props block', t);
                comp.props = this.parseNameBlock('props');
            } else if (word === 'state' && nextIs('{')) {
                if (comp.state.length) this.fail('Duplicate state block', t);
                comp.state = this.parseNameBlock('state');
            } else if (word === 'style' && nextIs('{')) {
                comp.styles.push(this.parseStyleBlock());
            } else if (word === 'render' && nextIs('{')) {
                if (comp.render) this.fail('Duplicate render block', t);
                this.next();
                comp.render = this.parseBlock();
            } else if (word === 'effect' || (word === 'async' && this.peekAt(1).type === 'ident'
                && this.peekAt(1).value === 'effect')) {
                lastEffect = this.parseEffect();
                comp.effects.push(lastEffect);
            } else if (word === 'cleanup' && nextIs('(')) {
                const cleanup = this.parseCleanupDeclaration();
                if (lastEffect) {
                    if (lastEffect.cleanup) this.fail('Duplicate cleanup for this effect', t);
                    lastEffect.cleanup = cleanup.body;
                } else {
                    comp.methods.push({ type: 'MethodDeclaration', name: 'cleanup', params: [], body: cleanup.body });
                }
            } else if (nextIs('(') || (word === 'async' && this.peekAt(2).type === 'punct' && this.peekAt(2).value === '(')) {
                comp.methods.push(this.parseMethod());
            } else {
                this.fail(`Unexpected "${word}" in component body (expected props, state, style, render, effect, cleanup or a method)`, t);
            }
        }

        return comp;
    }

    /** `props { title, subtitle = "x" }` or `state { count = 0 }` */
    parseNameBlock(kind) {
        this.next(); // keyword-ish word
        this.expect('punct', '{', `Expected { after ${kind}`);
        const items = [];
        while (!this.at('punct', '}')) {
            const nameTok = this.expectName(`Expected a ${kind} name`);
            if (this.eat('punct', ':')) this.skipType();
            let defaultValue = null;
            if (this.eat('punct', '=')) defaultValue = this.parseAssignment();
            items.push({ name: nameTok.value, default: defaultValue });
            if (this.eat('punct', ',')) continue;
            if (this.newlineAhead()) continue;
            break;
        }
        this.expect('punct', '}', `Expected } to close ${kind} block`);
        return items;
    }

    parseStyleBlock() {
        this.next(); // style
        this.expect('punct', '{', 'Expected { after style');
        const rules = [];
        const flat = [];
        this.inStyleBlock = true;
        while (!this.at('punct', '}')) {
            if (this.at('eof')) this.fail('Unterminated style block, expected }', this.peek());
            const t = this.peek();
            if ((t.type === 'ident' || t.type === 'kw') && this.peekAt(1).type === 'punct'
                && this.peekAt(1).value === '{') {
                const name = this.readAdjacentName().name;
                this.expect('punct', '{', 'Expected { after style rule name');
                rules.push({ name, props: this.parseStyleProps() });
                this.expect('punct', '}', 'Expected } to close style rule');
            } else {
                flat.push(...this.parseStyleProps());
                break;
            }
        }
        this.expect('punct', '}', 'Expected } to close style block');
        this.inStyleBlock = false;
        return { type: 'StyleBlock', rules, flat };
    }

    parseStyleProps() {
        const props = [];
        for (;;) {
            const t = this.peek();
            if ((t.type === 'punct' && (t.value === '}' || t.value === ';')) || t.type === 'eof') {
                if (t.type === 'punct' && t.value === ';') { this.next(); continue; }
                break;
            }
            // In style blocks, property names don't use adjacent separators (except for -)
            const keyTok = this.expectName('Expected a style property name');
            let key = keyTok.value;
            // Allow hyphenated property names like border-radius: the `-` must
            // touch the key, and the part after it must touch the `-`.
            while (this.at('punct', '-') && this.peek().start === this.last.end
                && (this.peekAt(1).type === 'ident' || this.peekAt(1).type === 'kw')
                && this.peekAt(1).start === this.peek().end) {
                this.next(); // consume hyphen
                const part = this.expectName('Expected a name after hyphen');
                key += '-' + part.value;
            }
            this.expect('punct', ':', `Expected : after style property "${key}"`);
            const first = this.peek();
            if (first.type === 'punct' && (first.value === ';' || first.value === '}')) {
                this.fail(`Missing value for style property "${key}"`, first);
            }
            let last = this.next();
            for (;;) {
                const n = this.peek();
                if (n.type === 'eof') break;
                if (n.type === 'punct' && (n.value === ';' || n.value === '}')) break;
                if (this.newlineAhead()) break;
                last = this.next();
            }
            const src = this.lexer.src;
            props.push({ key, value: src.slice(first.start, last.end).trim() });
        }
        return props;
    }

    parseEffect() {
        const node = {
            type: 'EffectDeclaration',
            async: false,
            name: null,
            params: [],
            body: null,
            cleanup: null,
        };
        if (this.at('kw', 'async')) { this.next(); node.async = true; }
        this.expect('ident', 'effect', 'Expected "effect"');
        if (this.at('ident')) node.name = this.next().value;
        node.params = this.parseParams();
        if (this.eat('punct', ':')) this.skipType();
        this.effectDepth += 1;
        node.body = this.parseBlock();
        this.effectDepth -= 1;
        return node;
    }

    parseMethod() {
        let isAsync = false;
        if (this.at('kw', 'async')) {
            isAsync = true;
            this.next();
        }
        const nameTok = this.expectName('Expected a method name');
        const params = this.parseParams();
        if (this.eat('punct', ':')) this.skipType();
        const body = this.parseBlock();
        return { type: 'MethodDeclaration', name: nameTok.value, params, body, async: isAsync };
    }

    parseCleanupDeclaration() {
        const nameTok = this.expectName('Expected "cleanup"');
        this.expect('punct', '(', 'Expected ( after cleanup');
        this.expect('punct', ')', 'Expected ) after cleanup');
        this.effectDepth += 1;
        const body = this.parseBlock();
        this.effectDepth -= 1;
        return { type: 'CleanupDeclaration', name: nameTok.value, body };
    }

    parseParams() {
        this.expect('punct', '(', 'Expected ( to start parameter list');
        const params = [];
        while (!this.at('punct', ')')) {
            if (this.at('eof')) this.fail('Unterminated parameter list, expected )', this.peek());
            if (this.eat('punct', '...')) {
                const id = this.expectName('Expected a parameter name after ...');
                params.push({ type: 'RestElement', argument: { type: 'Identifier', name: id.value } });
            } else {
                const nameTok = this.expectName('Expected a parameter name');
                let id = { type: 'Identifier', name: nameTok.value };
                if (this.eat('punct', ':')) this.skipType();
                if (this.eat('punct', '=')) {
                    const right = this.parseAssignment();
                    id = { type: 'AssignmentPattern', left: id, right };
                }
                params.push(id);
            }
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')', 'Expected ) to close parameter list');
        return params;
    }

    /** Skip a `: type` annotation without interpreting it. */
    skipType() {
        // Don't skip if we're in a style block (colons are CSS property separators)
        if (this.inStyleBlock) return;

        let depth = 0;
        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') return;
            if (t.type === 'punct') {
                const v = t.value;
                if (depth === 0 && (v === ')' || v === ',' || v === '{')) return;
                if (v === '(' || v === '[' || v === '{') depth += 1;
                else if (v === ')' || v === ']' || v === '}') { if (depth === 0) return; depth -= 1; }
            }
            this.next();
        }
    }

    /**
     * Read a name that may contain adjacent `-` / `.` / `:` separators, e.g.
     * `border-radius`, `data-id`, `Foo.Bar`. Adjacency (no whitespace) is what
     * separates a compound name from `a - b`.
     */
    readAdjacentName() {
        const first = this.expectName('Expected a name');
        let name = first.value;
        let lastEnd = first.end;
        for (;;) {
            const n = this.peek();
            const adjacent = n.type === 'punct' && (n.value === '-' || n.value === '.' || n.value === ':')
                && n.start === lastEnd;
            if (!adjacent) break;
            const sep = this.next();
            const part = this.peek();
            if (part.type !== 'ident' && part.type !== 'kw') {
                this.fail(`Expected a name after "${sep.value}"`, part);
            }
            const p = this.next();
            name += sep.value + p.value;
            lastEnd = p.end;
        }
        return { name, end: lastEnd };
    }

    // -- expressions --------------------------------------------------------

    parseExpression() {
        return this.parseAssignment();
    }

    parseAssignment() {
        // Arrow functions are detected before the left-hand side is committed.
        if (this.at('punct', '(') && this.arrowAhead(0)) {
            return this.parseArrowFromParens();
        }
        if (this.at('ident') && this.peekAt(1).type === 'punct' && this.peekAt(1).value === '=>') {
            const nameTok = this.next();
            const params = [{ type: 'Identifier', name: nameTok.value }];
            return this.finishArrow(params);
        }
        if (this.at('kw', 'async')) {
            const n1 = this.peekAt(1);
            const arrow = (n1.type === 'ident' && this.peekAt(2).type === 'punct' && this.peekAt(2).value === '=>')
                || (n1.type === 'punct' && n1.value === '(' && this.arrowAhead(1));
            if (arrow) return this.parseAsyncArrow();
        }

        const left = this.parseConditional();
        const t = this.peek();
        if (t.type === 'punct' && ASSIGN_OPS.has(t.value)) {
            this.next();
            const right = this.parseAssignment();
            if (left.type !== 'Identifier' && left.type !== 'MemberExpression') {
                this.fail('Invalid assignment target', t);
            }
            return { type: 'AssignmentExpression', operator: t.value, left, right };
        }
        return left;
    }

    /** Scan ahead from a `(` at `offset` to see whether `=>` follows its match. */
    arrowAhead(offset) {
        let depth = 0;
        for (let i = offset; ; i++) {
            const t = this.peekAt(i);
            if (t.type === 'eof') return false;
            if (t.type === 'punct') {
                if (t.value === '(' || t.value === '[' || t.value === '{') depth += 1;
                else if (t.value === ')' || t.value === ']' || t.value === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        const after = this.peekAt(i + 1);
                        return after.type === 'punct' && after.value === '=>';
                    }
                }
            }
            if (depth < 0) return false;
        }
    }

    parseArrowFromParens() {
        const params = this.parseParams();
        return this.finishArrow(params);
    }

    parseAsyncArrow() {
        this.expect('kw', 'async');
        const params = this.parseParams();
        const arrow = this.finishArrow(params);
        arrow.async = true;
        return arrow;
    }

    finishArrow(params) {
        this.expect('punct', '=>', 'Expected => in arrow function');
        if (this.at('punct', '{')) {
            return { type: 'ArrowFunctionExpression', params, body: this.parseBlock(), expression: false };
        }
        const body = this.parseAssignment();
        return { type: 'ArrowFunctionExpression', params, body, expression: true };
    }

    parseConditional() {
        const test = this.parseBinary(1);
        if (this.at('punct', '?')) {
            this.next();
            const consequent = this.parseAssignment();
            this.expect('punct', ':', 'Expected : in conditional expression');
            const alternate = this.parseAssignment();
            return { type: 'ConditionalExpression', test, consequent, alternate };
        }
        return test;
    }

    parseBinary(minPrec) {
        let left = this.parseUnary();
        for (;;) {
            const t = this.peek();
            let op = null;
            if (t.type === 'punct' && Object.prototype.hasOwnProperty.call(BINARY_PRECEDENCE, t.value)) {
                op = t.value;
            } else if (t.type === 'kw' && t.value === 'instanceof') {
                op = 'instanceof';
            }
            if (!op) break;
            const prec = BINARY_PRECEDENCE[op];
            if (prec < minPrec) break;
            this.next();
            const right = this.parseBinary(prec + 1);
            left = LOGICAL.has(op)
                ? { type: 'LogicalExpression', operator: op, left, right }
                : { type: 'BinaryExpression', operator: op, left, right };
        }
        return left;
    }

    parseUnary() {
        const t = this.peek();

        if (t.type === 'punct' && (t.value === '!' || t.value === '-' || t.value === '+' || t.value === '~')) {
            this.next();
            return { type: 'UnaryExpression', operator: t.value, argument: this.parseUnary(), prefix: true };
        }
        if (t.type === 'punct' && (t.value === '++' || t.value === '--')) {
            this.next();
            return { type: 'UpdateExpression', operator: t.value, argument: this.parseUnary(), prefix: true };
        }
        if (t.type === 'kw' && (t.value === 'typeof' || t.value === 'void' || t.value === 'delete')) {
            this.next();
            return { type: 'UnaryExpression', operator: t.value, argument: this.parseUnary(), prefix: true };
        }
        if (t.type === 'kw' && t.value === 'await') {
            this.next();
            return { type: 'AwaitExpression', argument: this.parseUnary() };
        }
        if (t.type === 'kw' && t.value === 'new') {
            return this.parseNew();
        }
        return this.parsePostfix();
    }

    parseNew() {
        this.expect('kw', 'new');
        let callee = this.parsePrimary();
        for (;;) {
            if (this.at('punct', '.')) {
                this.next();
                const nameTok = this.expectName('Expected a property name after .');
                callee = { type: 'MemberExpression', object: callee, property: { type: 'Identifier', name: nameTok.value }, computed: false };
            } else if (this.at('punct', '[')) {
                this.next();
                const property = this.parseExpression();
                this.expect('punct', ']', 'Expected ]');
                callee = { type: 'MemberExpression', object: callee, property, computed: true };
            } else {
                break;
            }
        }
        if (this.at('punct', '(')) {
            const args = this.parseArguments();
            return { type: 'NewExpression', callee, arguments: args };
        }
        return { type: 'NewExpression', callee, arguments: [] };
    }

    parsePostfix() {
        let node = this.parsePrimary();
        for (;;) {
            const t = this.peek();
            if (t.type === 'punct' && t.value === '.') {
                this.next();
                const nameTok = this.expectName('Expected a property name after .');
                node = { type: 'MemberExpression', object: node, property: { type: 'Identifier', name: nameTok.value }, computed: false };
                continue;
            }
            if (t.type === 'punct' && t.value === '[') {
                this.next();
                const property = this.parseExpression();
                this.expect('punct', ']', 'Expected ] to close computed member');
                node = { type: 'MemberExpression', object: node, property, computed: true };
                continue;
            }
            if (t.type === 'punct' && t.value === '(') {
                const args = this.parseArguments();
                node = { type: 'CallExpression', callee: node, arguments: args };
                continue;
            }
            if (t.type === 'punct' && (t.value === '++' || t.value === '--')) {
                this.next();
                node = { type: 'UpdateExpression', operator: t.value, argument: node, prefix: false };
                continue;
            }
            break;
        }
        return node;
    }

    parseArguments() {
        this.expect('punct', '(', 'Expected ( to start arguments');
        const args = [];
        while (!this.at('punct', ')')) {
            if (this.at('eof')) this.fail('Unterminated argument list, expected )', this.peek());
            if (this.eat('punct', '...')) {
                args.push({ type: 'SpreadElement', argument: this.parseAssignment() });
            } else {
                args.push(this.parseAssignment());
            }
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')', 'Expected ) to close argument list');
        return args;
    }

    parsePrimary() {
        const t = this.peek();

        if (t.type === 'num') { this.next(); return { type: 'Literal', value: t.value, raw: t.raw, kind: 'number' }; }
        if (t.type === 'str') { this.next(); return { type: 'Literal', value: t.value, raw: t.raw, kind: 'string' }; }
        if (t.type === 'tmpl') { this.next(); return { type: 'Literal', value: null, raw: t.raw, kind: 'template' }; }
        if (t.type === 'eof') this.fail('Unexpected end of file while reading an expression', t);
        if (t.type === 'jsxText') this.fail('Unexpected JSX text in an expression', t);

        if (t.type === 'ident') {
            this.next();
            return { type: 'Identifier', name: t.value };
        }

        if (t.type === 'kw') {
            switch (t.value) {
                case 'true':
                case 'false':
                    this.next();
                    return { type: 'Literal', value: t.value === 'true', raw: t.raw, kind: 'boolean' };
                case 'null':
                    this.next();
                    return { type: 'Literal', value: null, raw: 'null', kind: 'null' };
                case 'undefined':
                    this.next();
                    return { type: 'Literal', value: undefined, raw: 'undefined', kind: 'undefined' };
                case 'this':
                    this.next();
                    return { type: 'ThisExpression' };
                case 'function':
                    return this.parseFunctionExpression();
                default:
                    this.fail(`Unexpected keyword "${t.value}" in an expression`, t);
            }
        }

        if (t.type === 'punct') {
            switch (t.value) {
                case '(': {
                    this.next();
                    const first = this.parseAssignment();
                    if (this.at('punct', ',')) {
                        const expressions = [first];
                        while (this.eat('punct', ',')) expressions.push(this.parseAssignment());
                        this.expect('punct', ')', 'Expected ) to close sequence');
                        return { type: 'SequenceExpression', expressions };
                    }
                    this.expect('punct', ')', 'Expected ) to close expression');
                    return first;
                }
                case '[': return this.parseArrayLiteral();
                case '{': return this.parseObjectLiteral();
                case '<': return this.parseJSXElement(false);
                default:
                    this.fail(`Unexpected "${t.value}" in an expression`, t);
            }
        }

        this.fail(`Unexpected ${JSON.stringify(t.value)} in an expression`, t);
    }

    parseFunctionExpression() {
        this.expect('kw', 'function');
        const name = this.at('ident') ? this.next().value : null;
        const params = this.parseParams();
        const body = this.parseBlock();
        return { type: 'FunctionExpression', name, params, body };
    }

    parseArrayLiteral() {
        this.expect('punct', '[', 'Expected [ to start array');
        const elements = [];
        while (!this.at('punct', ']')) {
            if (this.at('eof')) this.fail('Unterminated array literal, expected ]', this.peek());
            if (this.eat('punct', '...')) {
                elements.push({ type: 'SpreadElement', argument: this.parseAssignment() });
            } else if (this.at('punct', ',')) {
                elements.push(null);
                this.next();
                continue;
            } else {
                elements.push(this.parseAssignment());
            }
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ']', 'Expected ] to close array literal');
        return { type: 'ArrayExpression', elements };
    }

    parseObjectLiteral() {
        this.expect('punct', '{', 'Expected { to start object literal');
        const properties = [];
        while (!this.at('punct', '}')) {
            if (this.at('eof')) this.fail('Unterminated object literal, expected }', this.peek());
            if (this.eat('punct', '...')) {
                properties.push({ type: 'SpreadProperty', argument: this.parseAssignment() });
                if (!this.eat('punct', ',')) break;
                continue;
            }
            const keyTok = this.peek();
            if (keyTok.type !== 'ident' && keyTok.type !== 'kw' && keyTok.type !== 'str'
                && keyTok.type !== 'num' && !(keyTok.type === 'punct' && keyTok.value === '[')) {
                this.fail('Expected an object key', keyTok);
            }
            let key;
            let computed = false;
            if (keyTok.type === 'punct' && keyTok.value === '[') {
                this.next();
                key = this.parseAssignment();
                this.expect('punct', ']', 'Expected ] to close computed key');
                computed = true;
            } else {
                this.next();
                if (keyTok.type === 'str' || keyTok.type === 'num') {
                    key = { type: 'Literal', value: keyTok.value, raw: keyTok.raw, kind: keyTok.type === 'str' ? 'string' : 'number' };
                } else {
                    key = { type: 'Identifier', name: keyTok.value };
                }
            }
            let value;
            if (this.eat('punct', ':')) {
                value = this.parseAssignment();
            } else if (key.type === 'Identifier') {
                // shorthand { foo }
                value = { type: 'Identifier', name: key.name };
            } else {
                this.fail('Expected : after object key', this.peek());
            }
            properties.push({ type: 'Property', key, value, computed, shorthand: false });
            if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', '}', 'Expected } to close object literal');
        return { type: 'ObjectExpression', properties };
    }

    // -- JSX ----------------------------------------------------------------

    /**
     * Called with the `<` consumed (or about to be). `isChild` records whether
     * this element lives inside JSX children, which determines which context
     * the lexer returns to when the element ends.
     */
    parseJSXElement(isChild) {
        const open = this.expect('punct', '<', 'Expected <');
        this.setChildren(false);
        return this.parseJSXElementRest(open, isChild);
    }

    parseJSXElementRest(openToken, isChild) {
        let name = null;
        const next = this.peek();
        if (next.type === 'ident' || next.type === 'kw') {
            name = this.readAdjacentName().name;
        } else if (!(next.type === 'punct' && next.value === '>')) {
            this.fail('Expected a component name after <', next);
        }

        const attributes = [];
        let selfClosing = false;

        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') this.fail('Unterminated JSX tag', t);
            if (t.type === 'punct' && t.value === '>') { this.next(); break; }
            if (t.type === 'punct' && t.value === '/') {
                this.next();
                this.expect('punct', '>', 'Expected > after / in JSX tag');
                selfClosing = true;
                break;
            }
            if (t.type === 'punct' && t.value === '{') {
                this.next();
                this.expect('punct', '...', 'Expected ... inside a JSX spread container');
                const argument = this.parseAssignment();
                this.expect('punct', '}', 'Expected } to close JSX spread');
                attributes.push({ type: 'JSXSpreadAttribute', argument });
                continue;
            }
            if (t.type === 'ident' || t.type === 'kw') {
                attributes.push(this.parseJSXAttribute());
                continue;
            }
            this.fail(`Unexpected ${JSON.stringify(t.value)} in JSX tag`, t);
        }

        if (selfClosing) {
            this.setChildren(isChild);
            return {
                type: 'JSXElement', name, attributes, children: [], selfClosing: true, loc: openToken,
            };
        }

        this.setChildren(true);
        const children = [];
        const element = {
            type: 'JSXElement', name, attributes, children, selfClosing: false, loc: openToken,
        };

        for (;;) {
            const t = this.peek();
            if (t.type === 'eof') {
                this.fail(`Unterminated JSX element <${name || ''}>: missing closing tag`, t);
            }
            if (t.type === 'jsxText') {
                this.next();
                children.push({ type: 'JSXText', value: t.value, raw: t.raw });
                continue;
            }
            if (t.type === 'punct' && t.value === '{') {
                this.next();
                this.setChildren(false);
                children.push(this.parseJSXExpressionContainer());
                this.expect('punct', '}', 'Expected } to close JSX expression');
                this.setChildren(true);
                continue;
            }
            if (t.type === 'punct' && t.value === '<') {
                const lt = this.next();
                this.setChildren(false);
                if (this.at('punct', '/')) {
                    this.next();
                    let closeName = null;
                    const closeTok = this.peek();
                    if (closeTok.type === 'ident' || closeTok.type === 'kw') {
                        closeName = this.readAdjacentName().name;
                    }
                    this.expect('punct', '>', 'Expected > in closing JSX tag');
                    if ((closeName || null) !== (name || null)) {
                        this.fail(
                            `Expected </${name || ''}> but found </${closeName || ''}>`,
                            lt
                        );
                    }
                    this.setChildren(isChild);
                    return element;
                }
                children.push(this.parseJSXElementRest(lt, true));
                continue;
            }
            this.fail(`Unexpected ${JSON.stringify(t.value)} in JSX children`, t);
        }
    }

    parseJSXExpressionContainer() {
        if (this.at('punct', '}')) {
            this.next();
            return { type: 'JSXEmptyExpression' };
        }
        const expression = this.parseExpression();
        return { type: 'JSXExpressionContainer', expression };
    }

    parseJSXAttribute() {
        const nameTok = this.peek();
        const name = this.readAdjacentName().name;
        if (this.eat('punct', '=')) {
            const valueTok = this.peek();
            if (valueTok.type === 'str') {
                this.next();
                return {
                    type: 'JSXAttribute',
                    name,
                    value: { type: 'Literal', value: valueTok.value, raw: valueTok.raw, kind: 'string' },
                    rawValue: valueTok.raw,
                };
            }
            if (valueTok.type === 'punct' && valueTok.value === '{') {
                this.next();
                const expression = this.parseExpression();
                this.expect('punct', '}', 'Expected } to close JSX attribute value');
                return { type: 'JSXAttribute', name, value: expression, rawValue: null };
            }
            this.fail(`Expected a value for JSX attribute "${name}"`, valueTok);
        }
        if (this.at('punct', '{')) {
            this.fail(`JSX attribute "${name}" needs a value (write ${name}={"..."})`, this.peek());
        }
        return { type: 'JSXAttribute', name, value: null, rawValue: null };
    }
}

module.exports = Parser;
