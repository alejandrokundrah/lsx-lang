import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('LSX Language Support is now active!');
    vscode.window.showInformationMessage('LSX Language Support activated!');

    // Automatically enable LSX icon theme on first install
    const config = vscode.workspace.getConfiguration('workbench');
    const currentIconTheme = config.get<string>('iconTheme');
    if (!currentIconTheme || currentIconTheme === 'vs-seti') {
        config.update('iconTheme', 'lsx-icons', vscode.ConfigurationTarget.Global).then(() => {
            console.log('LSX icon theme enabled automatically');
        });
    }

    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6010'],
            },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'lsx' }],
        synchronize: {
            fileEvents: [
                vscode.workspace.createFileSystemWatcher('**/*.lsx'),
            ],
        },
    };

    client = new LanguageClient(
        'lsxLanguageServer',
        'LSX Language Server',
        serverOptions,
        clientOptions,
    );

    context.subscriptions.push(client);
    void client.start();

    const checkVersionCommand = vscode.commands.registerCommand('lsx.checkVersion', () => {
        vscode.window.showInformationMessage('LSX Language Support v0.1.0');
    });

    context.subscriptions.push(checkVersionCommand);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }

    return client.stop();
}
