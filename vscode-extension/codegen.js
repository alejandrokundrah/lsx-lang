'use strict';

/**
 * LSX Code Generator
 *
 * Walks the AST produced by parser.js and emits React-flavoured JavaScript
 * (still containing JSX, which @babel/preset-react lowers later).
 *
 * The interesting transformations all come from the component model:
 *   state { count = 0 }        -> const [count, setCount] = useState(0)
 *   count = count + 1          -> setCount(count + 1)
 *   effect init() { ... }      -> useEffect(() => { ... }, [])
 *   style { card { ... } }     -> const styles = { card: { ... } }
 *   props { title }            -> const Name = ({ title }) => ...
 *   bare assignment targets    -> `let x;` hoisted into the component
 */

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

function precOf(node) {
    if (!node) return 15;
    switch (node.type) {
        case 'AssignmentExpression':
        case 'ArrowFunctionExpression':
        case 'SequenceExpression':
            return 0;
        case 'ConditionalExpression':
            return 1;
        case 'BinaryExpression':
        case 'LogicalExpression':
            return BINARY_PRECEDENCE[node.operator] || 1;
        case 'UnaryExpression':
        case 'AwaitExpression':
        case 'UpdateExpression':
            return 12;
        case 'CallExpression':
        case 'NewExpression':
        case 'MemberExpression':
            return 13;
        case 'ObjectExpression':
        case 'ArrayExpression':
        case 'FunctionExpression':
        case 'JSXElement':
        case 'JSXFragment':
            return 14;
        default:
            return 15;
    }
}

function isCapitalized(name) {
    return typeof name === 'string' && name.length > 0 && name[0] === name[0].toUpperCase()
        && name[0] !== name[0].toLowerCase();
}

function setterName(name) {
    return 'set' + name.charAt(0).toUpperCase() + name.slice(1);
}

function collectPatternNames(pattern, out) {
    if (!pattern) return;
    switch (pattern.type) {
        case 'Identifier': out.add(pattern.name); break;
        case 'AssignmentPattern': collectPatternNames(pattern.left, out); break;
        case 'RestElement': collectPatternNames(pattern.argument, out); break;
        case 'ObjectPattern':
            pattern.properties.forEach((p) => collectPatternNames(p.value || p.argument, out));
            break;
        case 'ArrayPattern':
            pattern.elements.forEach((p) => collectPatternNames(p, out));
            break;
        default: break;
    }
}

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((n) => walk(n, visit));
        return;
    }
    if (typeof node.type === 'string') visit(node);
    Object.keys(node).forEach((key) => {
        if (key === 'loc' || key === 'raw' || key === 'type') return;
        const value = node[key];
        if (value && typeof value === 'object') walk(value, visit);
    });
}

function assignedName(node) {
    if (node.type === 'AssignmentExpression') {
        return node.left.type === 'Identifier' ? node.left.name : null;
    }
    if (node.type === 'UpdateExpression') {
        return node.argument.type === 'Identifier' ? node.argument.name : null;
    }
    return null;
}

function assignmentTargets(root) {
    const names = new Set();
    walk(root, (node) => {
        const name = assignedName(node);
        if (name) names.add(name);
    });
    return names;
}

function isStatementExpressionWrappable(node) {
    return node && (node.type === 'ObjectExpression' || node.type === 'ArrowFunctionExpression'
        || node.type === 'FunctionExpression' || node.type === 'SequenceExpression');
}

class Codegen {
    /**
     * @param {object} program  AST from parser.js
     * @param {object} options  { coreNames: string[], filename: string }
     */
    constructor(program, options) {
        options = options || {};
        this.program = program;
        this.coreNames = new Set(options.coreNames || []);
        this.filename = options.filename || '<lsx>';
        this.warnings = [];
        this.out = [];
        this.indent = 0;
        this.uses = { jsx: false, useState: false, useEffect: false };
        this.imports = [];
        this.declared = new Set();
        this.allStateNames = new Set();
        this.componentHoists = new Map();
        this.moduleHoists = new Set();
        this.coreImports = new Set();
    }

    // -- helpers ------------------------------------------------------------

    line(text) {
        this.out.push(text === '' ? '' : '  '.repeat(this.indent) + text);
    }

    open(text) {
        this.line(text);
        this.indent += 1;
    }

    close(text) {
        this.indent = Math.max(0, this.indent - 1);
        this.line(text);
    }

    capture(fn) {
        const savedOut = this.out;
        const savedIndent = this.indent;
        this.out = [];
        this.indent = 0;
        fn();
        const text = this.out.map((s) => s.trim()).filter((s) => s !== '').join(' ');
        this.out = savedOut;
        this.indent = savedIndent;
        return text;
    }

    warn(message) {
        this.warnings.push(`${this.filename}: ${message}`);
    }

    // -- entry point --------------------------------------------------------

    generate() {
        this.collectInfo();

        // Source imports are emitted first so we know which react bindings
        // are already provided before injecting our own.
        this.program.body
            .filter((stmt) => stmt.type === 'ImportDeclaration')
            .forEach((node) => this.emitImport(node));

        const reactImports = new Set();
        this.imports.forEach((node) => {
            if (node.source !== 'react') return;
            if (node.default) reactImports.add(node.default);
            if (node.namespace) reactImports.add(node.namespace);
            node.names.forEach((n) => reactImports.add(n.local));
        });

        const neededReact = [];
        if (this.uses.jsx && !reactImports.has('React')) neededReact.push('React');
        if (this.uses.useState && !reactImports.has('useState')) neededReact.push('useState');
        if (this.uses.useEffect && !reactImports.has('useEffect')) neededReact.push('useEffect');

        const defaultImport = neededReact.indexOf('React') >= 0 ? 'React' : null;
        const namedReact = neededReact.filter((n) => n !== 'React');

        // 2. auto-imported react bindings
        if (defaultImport && namedReact.length) {
            this.line(`import ${defaultImport}, { ${namedReact.join(', ')} } from 'react';`);
        } else if (defaultImport) {
            this.line(`import ${defaultImport} from 'react';`);
        } else if (namedReact.length) {
            this.line(`import { ${namedReact.join(', ')} } from 'react';`);
        }

        // 3. auto-imported lsx-core layout components
        if (this.coreImports.size) {
            const names = Array.from(this.coreImports).sort();
            this.line(`import { ${names.join(', ')} } from 'lsx-core';`);
        }

        if (this.imports.length || neededReact.length || this.coreImports.size) {
            this.out.push('');
        }

        // 4. module scope hoists for bare assignments
        this.moduleHoists.forEach((name) => this.line(`let ${name};`));
        if (this.moduleHoists.size) this.out.push('');

        // 5. everything else
        const moduleCtx = { state: new Set() };
        this.program.body.forEach((stmt) => {
            if (stmt.type === 'ImportDeclaration') return;
            this.emitStatement(stmt, moduleCtx);
            this.out.push('');
        });

        // trim trailing blank lines
        while (this.out.length && this.out[this.out.length - 1] === '') this.out.pop();

        return this.out.join('\n') + '\n';
    }

    emitImport(node) {
        const source = /\.lsx$|\.jsx$/.test(node.source) ? node.source.replace(/\.lsx$|\.jsx$/, '.js') : node.source;
        const parts = [];
        if (node.default) parts.push(node.default);
        if (node.namespace) parts.push(`* as ${node.namespace}`);
        if (node.names.length) {
            parts.push(`{ ${node.names.map((n) => (n.imported === n.local ? n.imported : `${n.imported} as ${n.local}`)).join(', ')} }`);
        }
        if (!parts.length) return;
        this.line(`import ${parts.join(', ')} from '${source}';`);
        this.imports.push(node);
    }

    // -- analysis -----------------------------------------------------------

    collectInfo() {
        // Pass 1: imports (needed before emitImport records them), declarations
        // and JSX usage.
        const tags = [];

        walk(this.program, (node) => {
            switch (node.type) {
                case 'ImportDeclaration': {
                    if (node.default) this.declared.add(node.default);
                    if (node.namespace) this.declared.add(node.namespace);
                    node.names.forEach((n) => this.declared.add(n.local));
                    break;
                }
                case 'ComponentDeclaration':
                    this.declared.add(node.name);
                    node.props.forEach((p) => this.declared.add(p.name));
                    node.state.forEach((s) => {
                        this.declared.add(s.name);
                        this.allStateNames.add(s.name);
                    });
                    node.methods.forEach((m) => this.declared.add(m.name));
                    node.effects.forEach((e) => { if (e.name) this.declared.add(e.name); });
                    break;
                case 'FunctionDeclaration':
                    this.declared.add(node.name);
                    node.params.forEach((p) => collectPatternNames(p, this.declared));
                    break;
                case 'FunctionExpression':
                    if (node.name) this.declared.add(node.name);
                    node.params.forEach((p) => collectPatternNames(p, this.declared));
                    break;
                case 'ArrowFunctionExpression':
                case 'MethodDeclaration':
                case 'EffectDeclaration':
                    (node.params || []).forEach((p) => collectPatternNames(p, this.declared));
                    break;
                case 'VariableDeclaration':
                    node.declarations.forEach((d) => collectPatternNames(d.id, this.declared));
                    break;
                case 'JSXElement':
                    tags.push(node.name ? node.name.split('.')[0] : null);
                    break;
                default:
                    break;
            }
        });

        // Pass 2: bare assignment targets, split by scope.
        this.program.body.forEach((stmt) => {
            const node = stmt.type === 'ExportNamedDeclaration' && stmt.declaration
                ? stmt.declaration : stmt;
            if (node.type === 'ComponentDeclaration') {
                this.componentHoists.set(node.name, assignmentTargets(node));
                node.state.forEach((s) => this.componentHoists.get(node.name).delete(s.name));
            } else if (node.type !== 'ImportDeclaration') {
                assignmentTargets(node).forEach((n) => this.moduleHoists.add(n));
            }
        });
        this.declared.forEach((name) => this.moduleHoists.delete(name));
        this.allStateNames.forEach((name) => this.moduleHoists.delete(name));
        this.componentHoists.forEach((set, key) => {
            const keep = new Set(Array.from(set).filter((n) => !this.declared.has(n)));
            this.componentHoists.set(key, keep);
        });

        // Pass 3: resolve capitalized JSX tags to lsx-core imports.
        tags.forEach((tag) => {
            if (!tag || !isCapitalized(tag)) return;
            if (this.declared.has(tag)) return;
            if (this.coreNames.has(tag)) {
                this.coreImports.add(tag);
                return;
            }
            this.warn(`Unknown component <${tag}>: not defined or imported in this file, and not exported by lsx-core`);
        });

        // Pass 4: auto-import helper functions from lsx-core
        const helperFunctions = ['get', 'post', 'put', 'del'];
        walk(this.program, (node) => {
            if (node.type === 'CallExpression' && node.callee
                && node.callee.type === 'Identifier' && helperFunctions.includes(node.callee.name)) {
                if (!this.declared.has(node.callee.name) && this.coreNames.has(node.callee.name)) {
                    this.coreImports.add(node.callee.name);
                }
            }
        });

        // Usage flags. These must be known before generate() emits imports,
        // so they are derived from the AST rather than from emission itself.
        walk(this.program, (node) => {
            if (node.type === 'JSXElement' || node.type === 'JSXFragment') this.uses.jsx = true;
            if (node.type === 'CallExpression' && node.callee
                && node.callee.type === 'Identifier' && node.callee.name === 'useState') {
                this.uses.useState = true;
            }
            if (node.type === 'CallExpression' && node.callee
                && node.callee.type === 'Identifier' && node.callee.name === 'useEffect') {
                this.uses.useEffect = true;
            }
            if (node.type === 'ComponentDeclaration') {
                if (node.state.length) this.uses.useState = true;
                if (node.effects.length) this.uses.useEffect = true;
            }
        });
    }

    // -- statements ---------------------------------------------------------

    emitStatement(node, ctx) {
        if (!node) return;
        switch (node.type) {
            case 'EmptyStatement':
                return;
            case 'ImportDeclaration':
                this.emitImport(node);
                return;
            case 'ExportDefaultDeclaration':
                this.line(`export default ${this.genExpr(node.expression, 0, ctx)};`);
                return;
            case 'ExportNamedDeclaration':
                if (node.declaration) {
                    this.emitStatement(node.declaration, ctx);
                } else if (node.names) {
                    this.line(`export { ${node.names.map((n) => (n.local === n.exported ? n.local : `${n.local} as ${n.exported}`)).join(', ')} };`);
                }
                return;
            case 'VariableDeclaration': {
                const text = node.declarations.map((d) => {
                    const init = d.init ? ` = ${this.genExpr(d.init, 0, ctx)}` : '';
                    return `${d.id.name}${init}`;
                }).join(', ');
                this.line(`${node.kind} ${text};`);
                return;
            }
            case 'FunctionDeclaration': {
                const params = this.genParams(node.params, ctx);
                this.line(`function ${node.name}(${params}) {`);
                this.indent += 1;
                node.body.body.forEach((s) => this.emitStatement(s, ctx));
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                return;
            }
            case 'ComponentDeclaration':
                this.emitComponent(node, ctx);
                return;
            case 'ExpressionStatement': {
                let expr = this.genExpr(node.expression, 0, ctx);
                if (isStatementExpressionWrappable(node.expression)) expr = `(${expr})`;
                this.line(`${expr};`);
                return;
            }
            case 'ReturnStatement':
                this.line(node.argument ? `return ${this.genExpr(node.argument, 0, ctx)};` : 'return;');
                return;
            case 'ThrowStatement':
                this.line(`throw ${this.genExpr(node.argument, 0, ctx)};`);
                return;
            case 'BreakStatement':
                this.line('break;');
                return;
            case 'ContinueStatement':
                this.line('continue;');
                return;
            case 'BlockStatement':
                this.line('{');
                this.indent += 1;
                node.body.forEach((s) => this.emitStatement(s, ctx));
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                return;
            case 'IfStatement':
                this.line(`if (${this.genExpr(node.test, 0, ctx)}) {`);
                this.indent += 1;
                this.emitBraced(node.consequent, ctx);
                this.indent = Math.max(0, this.indent - 1);
                if (node.alternate) {
                    this.line('} else {');
                    this.indent += 1;
                    this.emitBraced(node.alternate, ctx);
                    this.indent = Math.max(0, this.indent - 1);
                }
                this.line('}');
                return;
            case 'WhileStatement':
                this.line(`while (${this.genExpr(node.test, 0, ctx)}) {`);
                this.indent += 1;
                this.emitBraced(node.body, ctx);
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                return;
            case 'DoWhileStatement':
                this.line('do {');
                this.indent += 1;
                this.emitBraced(node.body, ctx);
                this.indent = Math.max(0, this.indent - 1);
                this.line(`} while (${this.genExpr(node.test, 0, ctx)});`);
                return;
            case 'TryStatement':
                this.line('try {');
                this.indent += 1;
                node.block.body.forEach((s) => this.emitStatement(s, ctx));
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                if (node.handler) {
                    this.line(`catch (${node.handler.param}) {`);
                    this.indent += 1;
                    node.handler.body.body.forEach((s) => this.emitStatement(s, ctx));
                    this.indent = Math.max(0, this.indent - 1);
                    this.line('}');
                }
                if (node.finalizer) {
                    this.line('finally {');
                    this.indent += 1;
                    node.finalizer.body.forEach((s) => this.emitStatement(s, ctx));
                    this.indent = Math.max(0, this.indent - 1);
                    this.line('}');
                }
                return;
            case 'ForStatement': {
                const init = node.init
                    ? (node.init.type === 'VariableDeclaration'
                        ? this.genVarDeclText(node.init, ctx)
                        : this.genExpr(node.init.expression, 0, ctx))
                    : '';
                const test = node.test ? this.genExpr(node.test, 0, ctx) : '';
                const update = node.update ? this.genExpr(node.update, 0, ctx) : '';
                this.line(`for (${init}; ${test}; ${update}) {`);
                this.indent += 1;
                this.emitBraced(node.body, ctx);
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                return;
            }
            case 'ForInStatement': {
                let left;
                if (node.left.type === 'VariableDeclaration') {
                    left = this.genVarDeclText(node.left, ctx);
                } else if (node.left.type === 'ExpressionStatement'
                    && node.left.expression.type === 'Identifier') {
                    const name = node.left.expression.name;
                    left = this.declared.has(name) ? name : `const ${name}`;
                } else {
                    left = this.genExpr(node.left.expression, 0, ctx);
                }
                this.line(`for (${left} ${node.kind} ${this.genExpr(node.right, 0, ctx)}) {`);
                this.indent += 1;
                this.emitBraced(node.body, ctx);
                this.indent = Math.max(0, this.indent - 1);
                this.line('}');
                return;
            }
            case 'FunctionExpression':
            case 'ArrowFunctionExpression': {
                const text = this.genExpr(node, 0, ctx);
                this.line(`${text};`);
                return;
            }
            default:
                this.warn(`Unhandled statement "${node.type}"`);
        }
    }

    emitBraced(stmt, ctx) {
        if (stmt && stmt.type === 'BlockStatement') {
            stmt.body.forEach((s) => this.emitStatement(s, ctx));
        } else {
            this.emitStatement(stmt, ctx);
        }
    }

    genVarDeclText(node, ctx) {
        const text = node.declarations.map((d) => {
            const init = d.init ? ` = ${this.genExpr(d.init, 0, ctx)}` : '';
            return `${d.id.name}${init}`;
        }).join(', ');
        return `${node.kind} ${text}`;
    }

    // -- components ---------------------------------------------------------

    emitComponent(comp, ctx) {
        const stateNames = new Set(comp.state.map((s) => s.name));
        const localCtx = { state: stateNames };
        const propsPattern = comp.props.length
            ? `{ ${comp.props.map((p) => (p.default
                ? `${p.name} = ${this.genExpr(p.default, 0, localCtx)}`
                : p.name)).join(', ')} }`
            : '';

        this.line(`const ${comp.name} = (${propsPattern}) => {`);
        this.indent += 1;

        // bare assignment targets -> let declarations
        const hoists = this.componentHoists.get(comp.name) || new Set();
        hoists.forEach((name) => this.line(`let ${name};`));

        // state -> useState
        comp.state.forEach((s) => {
            this.uses.useState = true;
            const init = s.default ? this.genExpr(s.default, 0, localCtx) : '';
            this.line(`const [${s.name}, ${setterName(s.name)}] = useState(${init});`);
        });

        // style blocks -> one styles object for inline styles
        if (comp.styles.length) {
            this.line(`const styles = {`);
            this.indent += 1;
            comp.styles.forEach((block) => {
                if (block.flat.length) {
                    block.flat.forEach((p) => this.line(`${this.cssKey(p.key)}: ${this.cssValue(p.value)},`));
                }
                block.rules.forEach((rule) => {
                    this.line(`${this.cssKey(rule.name)}: {`);
                    this.indent += 1;
                    rule.props.forEach((p) => this.line(`${this.cssKey(p.key)}: ${this.cssValue(p.value)},`));
                    this.indent = Math.max(0, this.indent - 1);
                    this.line('},');
                });
            });
            this.indent = Math.max(0, this.indent - 1);
            this.line('};');

            // Also generate CSS string for className usage
            this.line(`const css = {`);
            this.indent += 1;
            comp.styles.forEach((block) => {
                block.rules.forEach((rule) => {
                    const className = this.cssClassName(rule.name);
                    this.line(`${className}: ${JSON.stringify(this.generateCSSRule(rule))},`);
                });
            });
            this.indent = Math.max(0, this.indent - 1);
            this.line('};');
        }

        // methods -> arrow consts (defined before render so handlers resolve)
        comp.methods.forEach((m) => {
            const params = this.genParams(m.params, localCtx);
            const asyncKeyword = m.async ? 'async ' : '';
            this.line(`const ${m.name} = ${asyncKeyword}(${params}) => {`);
            this.indent += 1;
            m.body.body.forEach((s) => this.emitStatement(s, localCtx));
            this.indent = Math.max(0, this.indent - 1);
            this.line('};');
        });

        // effects -> useEffect
        comp.effects.forEach((e) => this.emitEffect(e, localCtx));

        // render block, emitted last so it can close with the component's return
        if (comp.render) {
            comp.render.body.forEach((s) => this.emitStatement(s, localCtx));
            const returns = comp.render.body.some((s) => s.type === 'ReturnStatement');
            if (!returns) this.line('return null;');
        } else {
            this.line('return null;');
        }

        this.indent = Math.max(0, this.indent - 1);
        this.line('};');
    }

    emitEffect(effect, ctx) {
        this.uses.useEffect = true;
        this.line('useEffect(() => {');
        this.indent += 1;

        // A `cleanup() { ... }` nested in the effect body is the effect's own
        // teardown: hoist it out of the body and return it below.
        const nestedCleanups = effect.body.body.filter((s) => s.type === 'CleanupDeclaration');
        const body = effect.body.body.filter((s) => s.type !== 'CleanupDeclaration');

        if (effect.async) this.line('(async () => {');
        if (effect.async) this.indent += 1;
        body.forEach((s) => this.emitStatement(s, ctx));
        if (effect.async) {
            this.indent = Math.max(0, this.indent - 1);
            this.line('})();');
        }

        // `effect.cleanup` is a BlockStatement; a nested CleanupDeclaration
        // carries its own BlockStatement — normalise both to statement lists.
        const cleanups = [];
        if (effect.cleanup) cleanups.push(effect.cleanup.body);
        nestedCleanups.forEach((c) => cleanups.push(c.body.body));
        if (cleanups.length) {
            this.line('return () => {');
            this.indent += 1;
            cleanups.forEach((stmts) => stmts.forEach((s) => this.emitStatement(s, ctx)));
            this.indent = Math.max(0, this.indent - 1);
            this.line('};');
        }

        this.indent = Math.max(0, this.indent - 1);
        this.line('}, []);');
    }

    genParams(params, ctx) {
        return params.map((p) => {
            if (p.type === 'RestElement') return `...${p.argument.name}`;
            if (p.type === 'AssignmentPattern') {
                return `${p.left.name} = ${this.genExpr(p.right, 0, ctx)}`;
            }
            return p.name;
        }).join(', ');
    }

    cssKey(key) {
        if (key.startsWith('--')) return JSON.stringify(key);
        const camel = key.replace(/-([a-zA-Z0-9])/g, (m, c) => c.toUpperCase());
        return /^[A-Za-z_$][\w$]*$/.test(camel) ? camel : JSON.stringify(camel);
    }

    cssValue(value) {
        const text = String(value).trim();
        if (/^-?\d+(\.\d+)?$/.test(text)) return text;
        if (text === 'true' || text === 'false' || text === 'null') return JSON.stringify(text);
        return JSON.stringify(text);
    }

    cssClassName(name) {
        // Convert kebab-case to camelCase for JS object keys
        return name.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    }

    /** A CSS rule body as authored (`padding: 20px; ...`) — raw text, not JS. */
    generateCSSRule(rule) {
        return rule.props.map((p) => `${p.key}: ${String(p.value).trim()};`).join(' ');
    }

    // -- expressions --------------------------------------------------------

    genExpr(node, minPrec, ctx) {
        const text = this.genExprRaw(node, ctx);
        if (precOf(node) < (minPrec || 0)) return `(${text})`;
        return text;
    }

    genExprRaw(node, ctx) {
        if (!node) return '';
        switch (node.type) {
            case 'Identifier':
                return node.name;
            case 'Literal':
                if (node.raw !== undefined && node.raw !== null && node.kind !== 'undefined') return node.raw;
                if (node.kind === 'undefined') return 'undefined';
                if (node.kind === 'string') return JSON.stringify(node.value);
                return String(node.value);
            case 'ThisExpression':
                return 'this';
            case 'MemberExpression': {
                const object = this.genExpr(node.object, 13, ctx);
                if (node.computed) return `${object}[${this.genExpr(node.property, 0, ctx)}]`;
                const prop = node.property.name !== undefined ? node.property.name : this.genExpr(node.property, 0, ctx);
                return `${object}.${prop}`;
            }
            case 'CallExpression': {
                const callee = this.genExpr(node.callee, 13, ctx);
                const args = node.arguments.map((a) => this.genExpr(a, 0, ctx)).join(', ');
                return `${callee}(${args})`;
            }
            case 'NewExpression': {
                const callee = this.genExpr(node.callee, 13, ctx);
                const args = node.arguments.map((a) => this.genExpr(a, 0, ctx)).join(', ');
                return `new ${callee}(${args})`;
            }
            case 'BinaryExpression':
            case 'LogicalExpression': {
                const prec = BINARY_PRECEDENCE[node.operator] || 1;
                const left = this.genExpr(node.left, prec, ctx);
                const right = this.genExpr(node.right, prec + 1, ctx);
                return `${left} ${node.operator} ${right}`;
            }
            case 'ConditionalExpression':
                return `${this.genExpr(node.test, 1, ctx)} ? ${this.genExpr(node.consequent, 1, ctx)} : ${this.genExpr(node.alternate, 1, ctx)}`;
            case 'UnaryExpression': {
                const spaced = /^[a-z]/.test(node.operator);
                const arg = this.genExpr(node.argument, 12, ctx);
                return spaced ? `${node.operator} ${arg}` : `${node.operator}${arg.startsWith('<') ? ' ' : ''}${arg}`;
            }
            case 'AwaitExpression':
                return `await ${this.genExpr(node.argument, 12, ctx)}`;
            case 'UpdateExpression': {
                const arg = this.genExpr(node.argument, 13, ctx);
                return node.prefix ? `${node.operator}${arg}` : `${arg}${node.operator}`;
            }
            case 'AssignmentExpression':
                return this.genAssignment(node, ctx);
            case 'SequenceExpression':
                return node.expressions.map((e) => this.genExpr(e, 1, ctx)).join(', ');
            case 'ArrayExpression':
                return `[${node.elements.map((e) => (e ? this.genExpr(e, 0, ctx) : '')).join(', ')}]`;
            case 'ObjectExpression':
                return `{ ${node.properties.map((p) => this.genObjectProperty(p, ctx)).join(', ')} }`;
            case 'SpreadElement':
                return `...${this.genExpr(node.argument, 0, ctx)}`;
            case 'SpreadProperty':
                return `...${this.genExpr(node.argument, 0, ctx)}`;
            case 'Property': {
                const key = node.computed
                    ? `[${this.genExpr(node.key, 0, ctx)}]`
                    : (node.key.name !== undefined ? node.key.name : (node.key.type === 'Literal' ? JSON.stringify(node.key.value) : this.genExpr(node.key, 0, ctx)));
                return `${key}: ${this.genExpr(node.value, 0, ctx)}`;
            }
            case 'ArrowFunctionExpression': {
                const params = this.genParams(node.params, ctx);
                if (node.expression) {
                    return `(${params}) => ${this.genExpr(node.body, 1, ctx)}`;
                }
                const body = this.capture(() => {
                    node.body.body.forEach((s) => this.emitStatement(s, ctx));
                });
                return `(${params}) => { ${body} }`;
            }
            case 'FunctionExpression': {
                const params = this.genParams(node.params, ctx);
                const name = node.name ? ` ${node.name}` : '';
                const body = this.capture(() => {
                    node.body.body.forEach((s) => this.emitStatement(s, ctx));
                });
                return `function${name}(${params}) { ${body} }`;
            }
            case 'JSXElement':
            case 'JSXExpressionContainer':
            case 'JSXEmptyExpression':
            case 'JSXSpreadAttribute':
            case 'JSXText':
                return this.genJSX(node, ctx);
            default:
                this.warn(`Unhandled expression "${node.type}"`);
                return 'undefined';
        }
    }

    genAssignment(node, ctx) {
        const name = node.left.type === 'Identifier' ? node.left.name : null;
        if (name && ctx && ctx.state && ctx.state.has(name)) {
            const setter = setterName(name);
            if (node.operator === '=') {
                return `${setter}(${this.genExpr(node.right, 0, ctx)})`;
            }
            const op = node.operator.slice(0, -1);
            return `${setter}(${name} ${op} ${this.genExpr(node.right, 0, ctx)})`;
        }
        const left = this.genExpr(node.left, 0, ctx);
        return `${left} ${node.operator} ${this.genExpr(node.right, 0, ctx)}`;
    }

    genObjectProperty(p, ctx) {
        if (p.type === 'SpreadProperty') return `...${this.genExpr(p.argument, 0, ctx)}`;
        const key = p.computed
            ? `[${this.genExpr(p.key, 0, ctx)}]`
            : (p.key.name !== undefined ? p.key.name : this.genExpr(p.key, 0, ctx));
        return `${key}: ${this.genExpr(p.value, 0, ctx)}`;
    }

    // -- JSX ----------------------------------------------------------------

    genJSX(node, ctx) {
        switch (node.type) {
            case 'JSXText':
                return node.raw !== undefined ? node.raw : node.value;
            case 'JSXEmptyExpression':
                return '';
            case 'JSXExpressionContainer':
                return `{${this.genExpr(node.expression, 0, ctx)}}`;
            case 'JSXSpreadAttribute':
                return `{...${this.genExpr(node.argument, 0, ctx)}}`;
            case 'JSXElement': {
                const name = node.name || '';
                const attrs = node.attributes.map((a) => this.genJSXAttr(a, ctx)).join('');
                if (node.selfClosing) return `<${name}${attrs} />`;
                const children = node.children.map((c) => this.genJSX(c, ctx)).join('');
                return `<${name}${attrs}>${children}</${name}>`;
            }
            default:
                return '';
        }
    }

    genJSXAttr(attr, ctx) {
        if (attr.type === 'JSXSpreadAttribute') return `{...${this.genExpr(attr.argument, 0, ctx)}}`;
        if (attr.value === null) return ` ${attr.name}`;
        if (attr.rawValue !== null && attr.rawValue !== undefined) {
            return ` ${attr.name}=${attr.rawValue}`;
        }
        if (attr.value.type === 'Literal' && attr.value.kind === 'string') {
            const raw = attr.value.raw !== undefined ? attr.value.raw : JSON.stringify(attr.value.value);
            return ` ${attr.name}=${raw}`;
        }
        return ` ${attr.name}={${this.genExpr(attr.value, 0, ctx)}}`;
    }
}

module.exports = Codegen;
module.exports.isCapitalized = isCapitalized;
