import * as vscode from 'vscode';
import { LibraryProvider, Library } from './tree/libraryProvider';
import { CompatibilityProvider, CompatibilityNode } from './tree/compatibilityProvider';
import { NexusClient } from './repositories/nexus/nexusClient';
import * as path from 'path';
import * as fs from 'fs-extra';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 LibManager Flutter Libraries extension activated');

    // Mostrar mensaje de activación inmediato
    vscode.window.showInformationMessage('🎉 [LibManager] Extension activated! Check Activity Bar for the LibManager icon.');

    // Inicializar providers
    const nexusClient = new NexusClient(context);
    const libraryProvider = new LibraryProvider(nexusClient);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const compatibilityProvider = new CompatibilityProvider(workspaceFolder ? workspaceFolder.uri.fsPath : '');

    // Verificar configuración inicial
    setTimeout(async () => {
        const isConfigured = await nexusClient.isConfigured();
        if (!isConfigured) {
            const setupResult = await vscode.window.showInformationMessage(
                '[LibManager] not configured. Setup Artifactory connection?',
                'Setup Now', 'Later'
            );
            
            if (setupResult === 'Setup Now') {
                await setupArtifactory(nexusClient);
                libraryProvider.refresh();
            }
        }
    }, 2000);

    // Registrar TreeView
    const treeView = vscode.window.createTreeView('libmanagerLibraries', {
        treeDataProvider: libraryProvider,
        showCollapseAll: true
    });

    const compatibilityView = vscode.window.createTreeView('libmanagerCompatibility', {
        treeDataProvider: compatibilityProvider,
        showCollapseAll: true
    });

    // Agregar evento de doble clic para mostrar detalles
    treeView.onDidChangeSelection(async (e) => {
        // Eliminar el evento de clic simple - solo responder a comandos específicos
    });
    
    // Comando para mostrar detalles (se ejecuta en doble clic via contributes)
    const showDetailsCommand = vscode.commands.registerCommand('libmanager.showDetails', async (library: Library) => {
        if (library instanceof Library) {
            await showLibraryDetails(library, nexusClient);
        }
    });

    // Comando: Refrescar librerías
    const refreshCommand = vscode.commands.registerCommand('libmanager.refreshLibraries', () => {
        libraryProvider.refresh();
        
        const config = vscode.workspace.getConfiguration('libmanager');
        if (config.get('showNotifications', true)) {
            vscode.window.showInformationMessage('🔄 [LibManager] Refreshing libraries...');
        }
    });

    // Comando: Actualizar credenciales de Artifactory
    const updateCredentialsCommand = vscode.commands.registerCommand('libmanager.updateCredentials', async () => {
        const cfg = vscode.workspace.getConfiguration('libmanager');
        const currentUrl = cfg.get('nexusUrl', 'https://artifactory-service.abexa.pe/repository/flutter-libraries');
        const currentUser = cfg.get('username', '');

        const url = await vscode.window.showInputBox({
            prompt: 'Artifactory URL',
            value: currentUrl
        });
        if (!url) { return; }

        const username = await vscode.window.showInputBox({
            prompt: 'Nexus username',
            value: currentUser
        });
        if (username === undefined) { return; }

        const password = await vscode.window.showInputBox({
            prompt: 'Nexus password',
            password: true
        });
        if (password === undefined) { return; }

        try {
            await nexusClient.setRepositoryUrl(url);
            await nexusClient.setCredentials(username, password);
            vscode.window.showInformationMessage('✅ [LibManager] credentials updated');
            libraryProvider.refresh();
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to update credentials: ${e}`);
        }
    });

    // Comando: Instalar librería
    const installCommand = vscode.commands.registerCommand('libmanager.installLibrary', async (library: Library) => {
        if (!library) {
            vscode.window.showErrorMessage('No library selected');
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `Install ${library.name} v${library.version}?`,
            'Yes', 'No'
        );
        
        if (result === 'Yes') {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Installing ${library.name}...`,
                    cancellable: false
                }, async (progress) => {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (!workspaceFolder) {
                        throw new Error('No workspace folder found');
                    }
                    await installLibrary(library, workspaceFolder.uri.fsPath, nexusClient);
                });

                const config = vscode.workspace.getConfiguration('libmanager');
                if (config.get('showNotifications', true)) {
                    vscode.window.showInformationMessage(`✅ ${library.name} installed successfully!`);
                }
                
                libraryProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`❌ Failed to install ${library.name}: ${error}`);
            }
        }
    });

    // Comando: Publicar librería
    const publishCommand = vscode.commands.registerCommand('libmanager.publishLibrary', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Buscar librerías: raíz o subpaquetes (multimódulo / workspace)
        const workspaceRoot = workspaceFolder.uri.fsPath;
        let candidates: { dir: string, name: string, label: string }[] = [];

        const rootPubspec = path.join(workspaceRoot, 'pubspec.yaml');
        if (await fs.pathExists(rootPubspec)) {
            try {
                const content = await fs.readFile(rootPubspec, 'utf8');
                const yaml = require('yaml');
                const p = yaml.parse(content);
                candidates.push({ dir: workspaceRoot, name: p.name || 'root', label: p.name ? `${p.name} (root)` : 'root' });
            } catch {
                candidates.push({ dir: workspaceRoot, name: 'root', label: 'root' });
            }
        }

        const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !['.git','build','.dart_tool','node_modules','assets','.vscode'].includes(entry.name)) {
                const subPubspec = path.join(workspaceRoot, entry.name, 'pubspec.yaml');
                if (await fs.pathExists(subPubspec)) {
                    try {
                        const content = await fs.readFile(subPubspec, 'utf8');
                        const yaml = require('yaml');
                        const p = yaml.parse(content);
                        candidates.push({ dir: path.join(workspaceRoot, entry.name), name: p.name || entry.name, label: `${p.name || entry.name} (${entry.name})` });
                    } catch {
                        candidates.push({ dir: path.join(workspaceRoot, entry.name), name: entry.name, label: entry.name });
                    }
                }
            }
        }

        if (candidates.length === 0) {
            vscode.window.showErrorMessage('No pubspec.yaml found in current directory or sub-packages');
            return;
        }

        let selectedDir: string = workspaceRoot;
        let libraryName: string = candidates[0].name;

        if (candidates.length > 1) {
            const quickItems = candidates.map(c => ({ label: c.name, description: c.dir === workspaceRoot ? '(workspace root)' : c.dir.replace(workspaceRoot, '').replace(/^\//, ''), dir: c.dir }));
            const pick = await vscode.window.showQuickPick(quickItems, { placeHolder: 'Select package/library to publish' });
            if (!pick) return;
            selectedDir = pick.dir;
            libraryName = pick.label;
            // Recuperar nombre real del pubspec si es diferente del label
            try {
                const realContent = await fs.readFile(path.join(selectedDir, 'pubspec.yaml'), 'utf8');
                const yaml = require('yaml');
                const p = yaml.parse(realContent);
                if (p.name) libraryName = p.name;
            } catch { /* ign */ }
        } else {
            selectedDir = candidates[0].dir;
            libraryName = candidates[0].name;
        }

        // Leer nombre y versión actual del pubspec seleccionado
        try {
            const pubspecPath = path.join(selectedDir, 'pubspec.yaml');
            const pubspecContent = await fs.readFile(pubspecPath, 'utf8');
            const yaml = require('yaml');
            const pubspec = yaml.parse(pubspecContent);

            libraryName = pubspec.name || libraryName;
            const currentVersion = pubspec.version || '0.0.1';

            // Mostrar input para nueva versión
            const version = await vscode.window.showInputBox({
                prompt: 'Enter version number',
                placeHolder: currentVersion,
                value: currentVersion
            });

            if (version) {
                try {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Publishing ${libraryName} v${version}...`,
                        cancellable: false
                    }, async (progress) => {
                        await publishCurrentLibrary(selectedDir, libraryName, version, nexusClient);
                    });

                    vscode.window.showInformationMessage(`✅ ${libraryName} v${version} published successfully!`);
                    libraryProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`❌ Failed to publish: ${error}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Error reading pubspec.yaml: ${error}`);
        }
    });

    // Comando: Configuración
    const settingsCommand = vscode.commands.registerCommand('libmanager.openSettings', async () => {
        const isConfigured = await nexusClient.isConfigured();
        
        if (!isConfigured) {
            const setupResult = await vscode.window.showInformationMessage(
                'Setup LibManager Artifactory connection?',
                'Setup', 'Open Settings'
            );
            
            if (setupResult === 'Setup') {
                await setupArtifactory(nexusClient);
                libraryProvider.refresh();
                return;
            }
        }
        
        vscode.commands.executeCommand('workbench.action.openSettings', 'abexa');
    });

    // Comando: Ver detalles de librería
    const viewDetailsCommand = vscode.commands.registerCommand('libmanager.viewLibraryDetails', async (library: Library) => {
        if (!library) {
            return;
        }

        const details = `
Library: ${library.name}
Version: ${library.version}
Status: ${library.isInstalled ? 'Installed' : 'Available'}
${library.downloadUrl ? `Download URL: ${library.downloadUrl}` : ''}
        `.trim();

        vscode.window.showInformationMessage(details, { modal: true });
    });

    // Comando: Remover librería
    const removeCommand = vscode.commands.registerCommand('libmanager.removeLibrary', async (library: Library) => {
        if (!library) {
            vscode.window.showErrorMessage('No library selected');
            return;
        }

        if (!library.isInstalled) {
            vscode.window.showWarningMessage('Library is not installed');
            return;
        }

        const result = await vscode.window.showWarningMessage(
            `Remove ${library.name} v${library.version}? This will delete the library folder and update pubspec.yaml.`,
            { modal: true },
            'Remove', 'Cancel'
        );
        
        if (result === 'Remove') {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Removing ${library.name}...`,
                    cancellable: false
                }, async (progress) => {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (!workspaceFolder) {
                        throw new Error('No workspace folder found');
                    }
                    await removeLibrary(library, workspaceFolder.uri.fsPath);
                });

                vscode.window.showInformationMessage(`✅ ${library.name} removed successfully!`);
                libraryProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`❌ Failed to remove ${library.name}: ${error}`);
            }
        }
    });

    // Auto-refresh al inicio si está habilitado
    const config = vscode.workspace.getConfiguration('libmanager');
    if (config.get('autoRefresh', true)) {
        setTimeout(() => libraryProvider.refresh(), 1000);
    }

    const scanModuleCommand = vscode.commands.registerCommand('libmanager.scanModule', async (node?: CompatibilityNode) => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder');
            return;
        }
        try {
            const { scanModule } = require('./repositories/compatibility/compatibilityScanner');
            const modules = [workspaceRoot];
            const fs = require('fs-extra');
            const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
            for (const e of entries) {
                if (e.isDirectory() && !['.git','build','.dart_tool','node_modules','.vscode'].includes(e.name)) {
                    const sub = path.join(workspaceRoot, e.name);
                    if (await fs.pathExists(path.join(sub, 'pubspec.yaml'))) modules.push(sub);
                }
            }
            const results = await Promise.all(modules.map(async (m: string) => {
                const d = await scanModule(m);
                return d;
            }));
            const panel = vscode.window.createWebviewPanel('compatibilityScan', 'Module Compatibility Scan', vscode.ViewColumn.One, { enableScripts: true });
            const html = buildCompatibilityHtml(results);
            panel.webview.html = html;
        } catch (e) {
            vscode.window.showErrorMessage(`Scan failed: ${e}`);
        }
    });

    context.subscriptions.push(
        refreshCommand, 
        installCommand, 
        publishCommand, 
        settingsCommand, 
        viewDetailsCommand,
        removeCommand,
        showDetailsCommand,
        updateCredentialsCommand,
        scanModuleCommand,
        treeView,
        compatibilityView
    );
}

function buildCompatibilityHtml(results: any[]): string {
  const rows = results.map((r: any) => {
    const android = r.android ? `<td>AGP=${r.android.agp||'-'} / Gradle=${r.android.gradle||'-'} / Kotlin=${r.android.kotlin||'-'}</td>` : '<td>-</td>';
    const ios = r.ios ? `<td>Podspec=${r.ios.podspecName||'-'} / Deploy=${r.ios.deploymentTarget||'-'}</td>` : '<td>-</td>';
    const perms = r.permissions ? `<td>A:${(r.permissions.android||[]).join(', ').substring(0,40)} / I:${(r.permissions.ios||[]).join(', ').substring(0,40)}</td>` : '<td>-</td>';
    return `<tr><td><b>${r.moduleName}</b><br><small>${r.modulePath}</small><br><span style="font-size:10px;color:#666">${r.type}</span></td><td>${r.version}</td><td>${r.sdk||'-'}</td><td>${r.type}</td>${android}${ios}${perms}</tr>`;
  }).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;}th{background:#2c3e50;color:#fff;}tr:nth-child(even){background:#f2f2f2;}</style></head><body>
<h1>Module Compatibility Scan</h1>
<table><tr><th>Module</th><th>Ver</th><th>SDK</th><th>Type</th><th>Android (AGP/Grad/Kotlin)</th><th>iOS (Pod/Deploy)</th><th>Permissions (A / I)</th></tr>
${rows}</table></body></html>`;
}

async function showLibraryDetails(library: Library, nexusClient: NexusClient): Promise<void> {
    try {
        // Crear panel de detalles
        const panel = vscode.window.createWebviewPanel(
            'libraryDetails',
            `${library.name} v${library.version}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Obtener información detallada desde Nexus
        let detailedInfo: any = null;
        let additionalInfo = '';
        try {
            detailedInfo = await nexusClient.getLibraryDetails(library.name, library.version);
            if (detailedInfo) {
                additionalInfo = '✅ Detailed information loaded from Nexus';
            } else {
                additionalInfo = '⚠️ Could not load detailed information';
            }
        } catch (error) {
            additionalInfo = '❌ Error loading library details';
        }

        // Crear contenido HTML con los detalles
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${library.name} Details</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    line-height: 1.6;
                }
                .header {
                    border-bottom: 2px solid var(--vscode-panel-border);
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                .library-name {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 5px;
                }
                .version {
                    font-size: 16px;
                    color: var(--vscode-descriptionForeground);
                    background: var(--vscode-badge-background);
                    padding: 4px 8px;
                    border-radius: 4px;
                    display: inline-block;
                }
                .info-section {
                    margin: 20px 0;
                    padding: 15px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 6px;
                }
                .info-label {
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 5px;
                }
                .info-value {
                    margin-bottom: 10px;
                    font-family: var(--vscode-editor-font-family);
                }
                .download-url {
                    word-break: break-all;
                    background: var(--vscode-textBlockQuote-background);
                    padding: 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                }
                .action-buttons {
                    margin-top: 25px;
                    display: flex;
                    gap: 10px;
                }
                .btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .status {
                    margin-top: 10px;
                    padding: 8px;
                    border-radius: 4px;
                    background: var(--vscode-inputValidation-infoBackground);
                }
                code {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 11px;
                    color: var(--vscode-textPreformat-foreground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="library-name">📦 ${library.name}</div>
                <div class="version">v${library.version}</div>
            </div>

            <div class="info-section">
                <div class="info-label">Status:</div>
                <div class="info-value">${library.isInstalled ? 'Installed' : 'Available for installation'}</div>
                
                <div class="info-label">Size:</div>
                <div class="info-value">${detailedInfo?.size || library.size || 'Unknown'}</div>
                
                ${(detailedInfo?.lastModified || library.lastModified) ? `
                <div class="info-label">Last Modified:</div>
                <div class="info-value">${new Date(detailedInfo?.lastModified || library.lastModified).toLocaleString()}</div>
                ` : ''}
                
                ${detailedInfo?.lastDownloaded ? `
                <div class="info-label">Last Downloaded:</div>
                <div class="info-value">${new Date(detailedInfo.lastDownloaded).toLocaleString()}</div>
                ` : ''}
                
                ${detailedInfo?.uploader ? `
                <div class="info-label">Uploaded by:</div>
                <div class="info-value">${detailedInfo.uploader} (${detailedInfo.uploaderIp || 'unknown IP'})</div>
                ` : ''}
                
                ${detailedInfo?.contentType ? `
                <div class="info-label">Content Type:</div>
                <div class="info-value">${detailedInfo.contentType}</div>
                ` : ''}
                
                ${detailedInfo?.checksum ? `
                <div class="info-label">Checksums:</div>
                <div class="info-value">
                    ${detailedInfo.checksum.sha1 ? `SHA1: <code>${detailedInfo.checksum.sha1}</code><br>` : ''}
                    ${detailedInfo.checksum.md5 ? `MD5: <code>${detailedInfo.checksum.md5}</code>` : ''}
                </div>
                ` : ''}
            </div>

            <div class="status">
                ${additionalInfo}
            </div>

            <div class="action-buttons">
                ${!library.isInstalled ? `
                <button class="btn" onclick="installLibrary()">
                    Install Library
                </button>
                ` : `
                <button class="btn btn-secondary" onclick="removeLibrary()">
                    Remove Library
                </button>
                `}
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function installLibrary() {
                    vscode.postMessage({
                        command: 'installLibrary'
                    });
                }
                
                function removeLibrary() {
                    vscode.postMessage({
                        command: 'removeLibrary'
                    });
                }
            </script>
        </body>
        </html>
        `;

        panel.webview.html = htmlContent;

        // Manejar mensajes del webview
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'installLibrary':
                    vscode.commands.executeCommand('libmanager.installLibrary', library);
                    break;
                case 'removeLibrary':
                    vscode.commands.executeCommand('libmanager.removeLibrary', library);
                    break;
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show library details: ${error}`);
    }
}

async function setupArtifactory(nexusClient: NexusClient): Promise<void> {
    // Paso 1: Solicitar URL del Artifactory
    const artifactoryUrl = await vscode.window.showInputBox({
        prompt: 'Enter Artifactory Raw Repository URL',
        placeHolder: 'https://your-artifactory.com/repository/flutter-libraries',
        value: 'https://artifactory-service.abexa.pe/repository/flutter-libraries'
    });

    if (!artifactoryUrl) {
        return;
    }

    // Paso 2: Solicitar credenciales
    const username = await vscode.window.showInputBox({
        prompt: 'Enter Nexus username',
        placeHolder: 'your-username'
    });

    if (!username) {
        return;
    }

    const password = await vscode.window.showInputBox({
        prompt: 'Enter Nexus password',
        password: true
    });

    if (!password) {
        return;
    }

    try {
        // Guardar configuración
        await nexusClient.setRepositoryUrl(artifactoryUrl);
        await nexusClient.setCredentials(username, password);
        
        vscode.window.showInformationMessage('✅ Artifactory configured successfully!');
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Failed to save configuration: ${error}`);
    }
}

async function installLibrary(library: Library, workspacePath: string, nexusClient: NexusClient): Promise<void> {
    const config = vscode.workspace.getConfiguration('libmanager');
    const packagesDir = config.get('packagesDirectory', 'build/packages');
    const packagesPath = path.join(workspacePath, packagesDir);
    
    vscode.window.showInformationMessage(`📁 Installing ${library.name} to: ${packagesPath}`);
    
    // Crear directorio build/packages si no existe
    await fs.ensureDir(packagesPath);
    
    // Crear directorio específico para la librería
    const libraryPath = path.join(packagesPath, library.name);
    await fs.ensureDir(libraryPath);
    
    // Descargar archivo
    const fileName = `${library.name}-${library.version}.tar.gz`;
    const downloadPath = path.join(packagesPath, fileName);
    
    if (!library.downloadUrl) {
        throw new Error('Download URL not available');
    }
    
    console.log(`📥 Downloading ${library.name} from: ${library.downloadUrl}`);
    vscode.window.showInformationMessage(`📥 Downloading ${fileName}...`);
    
    await nexusClient.downloadLibrary({
        name: library.name,
        version: library.version,
        downloadUrl: library.downloadUrl
    }, downloadPath);
    
    console.log(`✅ Downloaded to: ${downloadPath}`);
    
    // Verificar que el archivo se descargó correctamente
    if (!await fs.pathExists(downloadPath)) {
        throw new Error(`Download failed - file not found: ${downloadPath}`);
    }
    
    const stats = await fs.stat(downloadPath);
    console.log(`📦 File size: ${Math.round(stats.size / 1024)} KB`);
    
    // Extraer archivo tar.gz
    console.log(`🔓 Extracting ${fileName} to ${libraryPath}...`);
    vscode.window.showInformationMessage(`🔓 Extracting ${library.name}...`);
    
    const tar = require('tar');
    await tar.extract({
        file: downloadPath,
        cwd: libraryPath,
        strip: 1  // Quitar el directorio raíz del tar para extraer contenido directamente
    });
    
    console.log(`✅ Extracted to: ${libraryPath}`);
    
    // Verificar que la extracción fue exitosa
    const extractedFiles = await fs.readdir(libraryPath);
    console.log(`📂 Extracted files: ${extractedFiles.join(', ')}`);
    
    // Limpiar archivo comprimido
    await fs.remove(downloadPath);
    console.log(`🗑️ Cleaned up: ${downloadPath}`);
    
    // Actualizar pubspec.yaml del proyecto principal
    const relativePath = path.relative(workspacePath, libraryPath);
    await updatePubspecDependency(workspacePath, library.name, relativePath);
    
    // Mostrar mensaje de éxito
    vscode.window.showInformationMessage(
        `✅ ${library.name} v${library.version} installed successfully!`,
        'Open Folder', 'Run pub get'
    ).then(action => {
        if (action === 'Open Folder') {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(libraryPath));
        } else if (action === 'Run pub get') {
            const terminal = vscode.window.createTerminal('Flutter Pub Get');
            terminal.sendText('flutter pub get');
            terminal.show();
        }
    });
}

async function publishCurrentLibrary(workspacePath: string, libraryName: string, version: string, nexusClient: NexusClient): Promise<void> {
    const tar = require('tar');
    const fileName = `${libraryName}-${version}.tar.gz`;
    const tempPath = path.join(workspacePath, '..', fileName);
    
    // Crear tar.gz
    await tar.create({
        gzip: true,
        file: tempPath,
        cwd: workspacePath,
        filter: (path: string) => {
            // Excluir archivos innecesarios
            const excludePatterns = ['.git', 'build', '.dart_tool', 'node_modules', '*.log'];
            return !excludePatterns.some(pattern => path.includes(pattern));
        }
    }, ['.']);
    
    // Subir a Nexus
    await nexusClient.uploadLibrary(tempPath, libraryName, version);
    
    // Limpiar archivo temporal
    await fs.remove(tempPath);
}

async function updatePubspecDependency(workspacePath: string, libraryName: string, libraryPath: string): Promise<void> {
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    const pubspecContent = await fs.readFile(pubspecPath, 'utf8');
    
    const yaml = require('yaml');
    const pubspec = yaml.parse(pubspecContent);
    
    // Agregar o actualizar dependencia
    if (!pubspec.dependencies) {
        pubspec.dependencies = {};
    }
    
    pubspec.dependencies[libraryName] = {
        path: libraryPath
    };
    
    // Escribir archivo actualizado
    const updatedContent = yaml.stringify(pubspec);
    await fs.writeFile(pubspecPath, updatedContent, 'utf8');
}

async function removeLibrary(library: Library, workspacePath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('libmanager');
    const packagesDir = config.get('packagesDirectory', 'build/packages');
    const packagesPath = path.join(workspacePath, packagesDir);
    const libraryPath = path.join(packagesPath, library.name);
    
    console.log(`🗑️ Removing library from: ${libraryPath}`);
    
    // Verificar que el directorio de la librería existe
    if (!await fs.pathExists(libraryPath)) {
        throw new Error(`Library directory not found: ${libraryPath}`);
    }
    
    // Eliminar directorio de la librería
    await fs.remove(libraryPath);
    console.log(`✅ Deleted library directory: ${libraryPath}`);
    
    // Actualizar pubspec.yaml para remover la dependencia
    await removePubspecDependency(workspacePath, library.name);
    console.log(`✅ Removed dependency from pubspec.yaml`);
    
    vscode.window.showInformationMessage(
        `🗑️ ${library.name} removed successfully!`,
        'Run pub get'
    ).then(action => {
        if (action === 'Run pub get') {
            const terminal = vscode.window.createTerminal('Flutter Pub Get');
            terminal.sendText('flutter pub get');
            terminal.show();
        }
    });
}

async function removePubspecDependency(workspacePath: string, libraryName: string): Promise<void> {
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    
    if (!await fs.pathExists(pubspecPath)) {
        throw new Error('pubspec.yaml not found');
    }
    
    const pubspecContent = await fs.readFile(pubspecPath, 'utf8');
    const yaml = require('yaml');
    const pubspec = yaml.parse(pubspecContent);
    
    // Remover la dependencia si existe
    if (pubspec.dependencies && pubspec.dependencies[libraryName]) {
        delete pubspec.dependencies[libraryName];
        console.log(`🗑️ Removed ${libraryName} from dependencies`);
    }
    
    // También verificar dev_dependencies por si acaso
    if (pubspec.dev_dependencies && pubspec.dev_dependencies[libraryName]) {
        delete pubspec.dev_dependencies[libraryName];
        console.log(`🗑️ Removed ${libraryName} from dev_dependencies`);
    }
    
    // Escribir archivo actualizado
    const updatedContent = yaml.stringify(pubspec);
    await fs.writeFile(pubspecPath, updatedContent, 'utf8');
}

export function deactivate() {
    console.log('LibManager Flutter Libraries extension deactivated');
}