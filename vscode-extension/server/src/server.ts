import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    Hover,
    MarkupKind,
    Diagnostic,
    DiagnosticSeverity,
    Position,
    TextDocumentSyncKind,
    InitializeResult,
    DefinitionParams,
    Location,
    ReferenceParams,
    WorkspaceSymbol,
    SymbolKind,
    RenameParams,
    WorkspaceEdit,
    TextEdit,
    DocumentFormattingParams,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

const LSXTranspiler = require('../../../transpiler');
const TypeChecker = require('../../../type-checker');

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: { resolveProvider: true },
            hoverProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            workspaceSymbolProvider: true,
            renameProvider: {
                prepareProvider: true,
            },
            documentSymbolProvider: true,
            documentFormattingProvider: true,
            codeActionProvider: true,
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false,
            },
        },
    };
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});

function makeDiagnosticRange(line: number, col: number, endCol?: number): { start: Position; end: Position } {
    const start: Position = {
        line: Math.max(0, line - 1),
        character: Math.max(0, col - 1),
    };
    const end: Position = {
        line: Math.max(0, line - 1),
        character: Math.max(0, endCol ?? col),
    };
    return { start, end };
}

function createLocationRange(loc: any, fallbackCol = 1): Range {
    const startLine = loc?.start?.line ?? loc?.line ?? 1;
    const startCol = loc?.start?.column ?? loc?.col ?? fallbackCol;
    const endLine = loc?.end?.line ?? startLine;
    const endCol = loc?.end?.column ?? Math.max(startCol + 1, fallbackCol + 1);

    return {
        start: { line: Math.max(0, startLine - 1), character: Math.max(0, startCol - 1) },
        end: { line: Math.max(0, endLine - 1), character: Math.max(0, endCol - 1) },
    };
}

function collectDeclaredNames(node: any, names = new Set<string>()): Set<string> {
    if (!node || typeof node !== 'object') return names;

    if (node.type === 'ComponentDeclaration') {
        if (node.name) names.add(node.name);
        node.props?.forEach((prop: any) => prop?.name && names.add(prop.name));
        node.state?.forEach((state: any) => state?.name && names.add(state.name));
        node.methods?.forEach((method: any) => method?.name && names.add(method.name));
    }

    if (node.type === 'FunctionDeclaration' && node.name) {
        names.add(node.name);
    }

    if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations || []) {
            if (decl?.id?.name) names.add(decl.id.name);
        }
    }

    if (node.type === 'VariableDeclarator' && node.id?.name) {
        names.add(node.id.name);
    }

    if (node.type === 'Property' && node.key?.name) {
        names.add(node.key.name);
    }

    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'range') continue;
        const value = (node as any)[key];
        if (Array.isArray(value)) {
            for (const child of value) collectDeclaredNames(child, names);
        } else if (value && typeof value === 'object') {
            collectDeclaredNames(value, names);
        }
    }

    return names;
}

function collectUndefinedSymbols(document: TextDocument): Diagnostic[] {
    const source = document.getText();
    try {
        const ast = new LSXTranspiler().parse(source, document.uri);
        const known = collectDeclaredNames(ast);
        const builtins = new Set([
            'console', 'Math', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON',
            'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'fetch', 'window',
            'document', 'localStorage', 'sessionStorage', 'Date', 'RegExp', 'Promise',
            'Map', 'Set', 'Error', 'undefined', 'null', 'true', 'false', 'this', 'super',
            'render', 'props', 'state', 'effect', 'style', 'cleanup', 'Page', 'Header', 'Footer',
            'Section', 'Body', 'Button', 'Card', 'Modal', 'Grid', 'Flex', 'Input', 'Router', 'Link',
            'get', 'post', 'put', 'del',
        ]);

        const diagnostics: Diagnostic[] = [];
        const visit = (node: any, parent?: any) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'Identifier') {
                const name = node.name;
                if (
                    typeof name === 'string' &&
                    !known.has(name) &&
                    !builtins.has(name) &&
                    !(parent && parent.type === 'Property' && parent.key === node && !parent.computed) &&
                    !(parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed)
                ) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: createLocationRange(node.loc || { line: 1, col: 1 }, 1),
                        message: `Undefined symbol: ${name}`,
                        source: 'lsx',
                    });
                }
            }

            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'loc' || key === 'range') continue;
                const value = node[key];
                if (Array.isArray(value)) {
                    for (const child of value) visit(child, node);
                } else if (value && typeof value === 'object') {
                    visit(value, node);
                }
            }
        };

        visit(ast);
        return diagnostics;
    } catch {
        return [];
    }
}

function validateTextDocument(document: TextDocument): Diagnostic[] {
    const source = document.getText();

    try {
        const ast = new LSXTranspiler().parse(source, document.uri);
        const checker = new TypeChecker();
        const result = checker.check(ast);

        const diagnostics: Diagnostic[] = [];
        for (const error of result.errors) {
            const location = error.location || { line: 1, col: 1 };
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: makeDiagnosticRange(location.line || 1, location.col || 1, (location.col || 1) + 1),
                message: error.message || 'Type error',
                source: 'lsx',
            });
        }

        for (const warning of result.warnings) {
            const location = warning.location || { line: 1, col: 1 };
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: makeDiagnosticRange(location.line || 1, location.col || 1, (location.col || 1) + 1),
                message: warning.message || 'Type warning',
                source: 'lsx',
            });
        }

        diagnostics.push(...collectUndefinedSymbols(document));
        return diagnostics;
    } catch (error: any) {
        const message = String(error?.message || 'LSX syntax error').split('\n')[0];
        const cleanedMessage = message.replace(/^.*?:\d+:\d+:\s*/, '');
        const line = Number.isFinite(error?.line) ? Number(error.line) : 1;
        const col = Number.isFinite(error?.col) ? Number(error.col) : 1;

        return [{
            severity: DiagnosticSeverity.Error,
            range: makeDiagnosticRange(line, col, col + 1),
            message: cleanedMessage,
            source: 'lsx',
        }];
    }
}

documents.onDidChangeContent((change) => {
    const diagnostics = validateTextDocument(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

documents.onDidOpen((change) => {
    const diagnostics = validateTextDocument(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        const keywords = [
            'component', 'fn', 'import', 'export', 'default', 'from', 'as',
            'if', 'else', 'for', 'in', 'of', 'while', 'do', 'return',
            'break', 'continue', 'const', 'let', 'var', 'function',
            'async', 'await', 'new', 'typeof', 'instanceof', 'void',
            'delete', 'throw', 'try', 'catch', 'finally', 'true', 'false',
            'null', 'undefined', 'this', 'super', 'yield', 'class', 'extends'
        ];

        const componentKeywords = ['props', 'state', 'render', 'effect', 'cleanup', 'style'];
        const coreComponents = ['Page', 'Header', 'Footer', 'Section', 'Body', 'Button', 'Card', 'Modal', 'Grid', 'Flex', 'Input', 'Router', 'Link'];
        const apiHelpers = ['get', 'post', 'put', 'del'];

        const items: CompletionItem[] = [];

        keywords.forEach((kw) => {
            items.push({ label: kw, kind: CompletionItemKind.Keyword, detail: 'LSX keyword' });
        });

        componentKeywords.forEach((kw) => {
            items.push({ label: kw, kind: CompletionItemKind.Keyword, detail: 'Component block keyword' });
        });

        coreComponents.forEach((comp) => {
            items.push({
                label: comp,
                kind: CompletionItemKind.Class,
                detail: 'lsx-core component',
                documentation: `Component from lsx-core: ${comp}`,
            });
        });

        apiHelpers.forEach((helper) => {
            items.push({
                label: helper,
                kind: CompletionItemKind.Function,
                detail: 'lsx-core API helper',
                documentation: `HTTP ${helper} helper function`,
            });
        });

        return items;
    }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function offsetToPosition(document: TextDocument, offset: number): Position {
    const text = document.getText();
    const before = text.slice(0, offset);
    const line = before.split('\n').length - 1;
    const lastLineBreak = before.lastIndexOf('\n');
    const character = lastLineBreak === -1 ? before.length : before.length - lastLineBreak - 1;
    return { line, character };
}

function rangeFromMatch(document: TextDocument, match: RegExpExecArray, matchIndex: number): Location {
    const start = match.index + matchIndex;
    const end = start + match[0].length;
    return {
        uri: document.uri,
        range: {
            start: offsetToPosition(document, start),
            end: offsetToPosition(document, end),
        },
    };
}

function findNameRanges(document: TextDocument, name: string): Array<{ kind: string; range: Location['range'] }> {
    const text = document.getText();
    const ranges: Array<{ kind: string; range: Location['range'] }> = [];
    const patterns = [
        { kind: 'component', re: new RegExp(`\\bcomponent\\s+${escapeRegExp(name)}\\b`, 'g') },
        { kind: 'function', re: new RegExp(`\\b(?:async\\s+)?fn\\s+${escapeRegExp(name)}\\b`, 'g') },
        { kind: 'method', re: new RegExp(`\\b(?:async\\s+)?${escapeRegExp(name)}\\s*\\(`, 'g') },
        { kind: 'variable', re: new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\b`, 'g') },
    ];

    for (const { kind, re } of patterns) {
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            ranges.push({
                kind,
                range: {
                    start: offsetToPosition(document, start),
                    end: offsetToPosition(document, end),
                },
            });
        }
    }

    return ranges;
}

function findDefinitionForWord(word: string, currentDoc: TextDocument, docs: TextDocument[]): Location[] {
    const locations: Location[] = [];
    const definitions: Array<{ uri: string; range: Location['range'] }> = [];

    for (const doc of docs) {
        for (const entry of findNameRanges(doc, word)) {
            definitions.push({ uri: doc.uri, range: entry.range });
        }
    }

    if (definitions.length === 0) {
        return [];
    }

    for (const def of definitions) {
        locations.push({ uri: def.uri, range: def.range });
    }

    const preferred = definitions.find((def) => def.uri === currentDoc.uri) ?? definitions[0];
    if (preferred) {
        return [{ uri: preferred.uri, range: preferred.range }];
    }

    return locations;
}

function findReferencesForWord(word: string, docs: TextDocument[]): Location[] {
    const refs: Location[] = [];
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');

    for (const doc of docs) {
        const text = doc.getText();
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            refs.push({
                uri: doc.uri,
                range: {
                    start: offsetToPosition(doc, match.index),
                    end: offsetToPosition(doc, match.index + word.length),
                },
            });
        }
    }

    return refs;
}

function collectDocumentSymbols(document: TextDocument): WorkspaceSymbol[] {
    const text = document.getText();
    const symbols: WorkspaceSymbol[] = [];
    const patterns = [
        { kind: SymbolKind.Class, regex: /\bcomponent\s+([A-Za-z_$][\w$]*)\b/g },
        { kind: SymbolKind.Function, regex: /\b(?:async\s+)?fn\s+([A-Za-z_$][\w$]*)\b/g },
        { kind: SymbolKind.Variable, regex: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g },
    ];

    for (const { kind, regex } of patterns) {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            if (!name) continue;
            const start = match.index + match[0].indexOf(name);
            const end = start + name.length;
            symbols.push({
                name,
                kind,
                location: {
                    uri: document.uri,
                    range: {
                        start: offsetToPosition(document, start),
                        end: offsetToPosition(document, end),
                    },
                },
            });
        }
    }

    return symbols;
}

connection.onWorkspaceSymbol((params): WorkspaceSymbol[] => {
    const query = params.query.trim().toLowerCase();
    if (!query) {
        return documents.all().flatMap((document) => collectDocumentSymbols(document));
    }

    return documents.all()
        .flatMap((document) => collectDocumentSymbols(document))
        .filter((symbol) => symbol.name.toLowerCase().includes(query));
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAt(document.getText(), document.offsetAt(params.position));
    if (!word || word === params.newName) return null;

    const edits: { [uri: string]: TextEdit[] } = {};
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');

    for (const doc of documents.all()) {
        const text = doc.getText();
        const fileEdits: TextEdit[] = [];
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
            fileEdits.push({
                range: {
                    start: offsetToPosition(doc, match.index),
                    end: offsetToPosition(doc, match.index + word.length),
                },
                newText: params.newName,
            });
        }

        if (fileEdits.length > 0) {
            edits[doc.uri] = fileEdits;
        }
    }

    return Object.keys(edits).length > 0 ? { changes: edits } : null;
});

connection.onDefinition((params: DefinitionParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const word = getWordAt(document.getText(), document.offsetAt(params.position));
    if (!word) return [];

    return findDefinitionForWord(word, document, documents.all());
});

connection.onReferences((params: ReferenceParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const word = getWordAt(document.getText(), document.offsetAt(params.position));
    if (!word) return [];

    return findReferencesForWord(word, documents.all());
});

connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const lines = document.getText().split(/\r?\n/);
    const output: string[] = [];
    let indentLevel = 0;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        if (trimmed === '') {
            output.push('');
            continue;
        }

        const blockOpeners = ['component', 'props', 'state', 'style', 'render', 'effect', 'fn', 'if', 'for', 'while', 'try', 'catch', 'else', 'do'];
        const blockClosers = ['}'];
        const startsBlock = blockOpeners.some((keyword) => trimmed.startsWith(keyword) && trimmed.includes('{'));
        const endsBlock = blockClosers.some((suffix) => trimmed.startsWith(suffix));

        if (endsBlock) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        output.push(`${'  '.repeat(Math.max(0, indentLevel))}${trimmed}`);

        if (startsBlock && !trimmed.startsWith('}')) {
            indentLevel += 1;
        }
    }

    const formatted = output.join('\n');
    return [{
        range: {
            start: { line: 0, character: 0 },
            end: { line: lines.length, character: 0 },
        },
        newText: formatted,
    }];
});

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const actions: CodeAction[] = [];

    for (const diagnostic of params.context.diagnostics) {
        const match = /^Undefined symbol: ([A-Za-z_$][\w$]*)$/.exec(diagnostic.message);
        if (!match) continue;

        const name = match[1];
        const insertAt = document.getText().search(/\b(?:import|component|fn|export|const|let|var)\b/);
        const start = insertAt === -1 ? 0 : 0;
        const insertText = `const ${name} = null;\n`;

        actions.push({
            title: `Create local variable '${name}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [{
                        range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 0 },
                        },
                        newText: insertText,
                    }],
                },
            },
        });
    }

    return actions;
});

connection.onHover((textDocumentPosition: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
    const word = getWordAt(text, offset);

    if (!word) return null;

    const keywordDocs: Record<string, string> = {
        component: 'Define a new LSX component',
        fn: 'Define a function',
        import: 'Import from another module',
        export: 'Export to other modules',
        if: 'Conditional statement',
        for: 'Loop statement',
        while: 'While loop',
        return: 'Return from function',
        async: 'Async function',
        await: 'Wait for promise',
        try: 'Try-catch block',
        catch: 'Catch errors',
        props: 'Component props block',
        state: 'Component state block',
        render: 'Component render block',
        effect: 'Component effect block',
    };

    const componentDocs: Record<string, string> = {
        Page: 'Main page container',
        Header: 'Header with title and subtitle',
        Footer: 'Footer with copyright',
        Section: 'Content section',
        Body: 'Main content body',
        Button: 'Clickable button',
        Card: 'Card container',
        Modal: 'Modal dialog',
        Grid: 'CSS Grid layout',
        Flex: 'Flexbox layout',
        Input: 'Text input field',
        Router: 'Hash-based router',
        Link: 'Navigation link',
    };

    if (keywordDocs[word]) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${word}**\n\n${keywordDocs[word]}`,
            },
        };
    }

    if (componentDocs[word]) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${word}**\n\n${componentDocs[word]}\n\nFrom lsx-core`,
            },
        };
    }

    return null;
});

function getWordAt(text: string, offset: number): string | null {
    const before = text.slice(0, offset);
    const after = text.slice(offset);
    const wordStart = before.search(/\w+$/);
    const wordEnd = after.search(/\W/);

    if (wordStart === -1) return null;

    const start = offset - (before.length - wordStart);
    const end = offset + (wordEnd === -1 ? after.length : wordEnd);
    return text.slice(start, end);
}

documents.listen(connection);
connection.listen();
