import * as vscode from 'vscode';
import { NexusClient, LibraryInfo } from './nexusClient';
import * as path from 'path';
import * as fs from 'fs-extra';

export class Library extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly version: string,
        public readonly isInstalled: boolean,
        public readonly downloadUrl?: string,
        public readonly size?: string,
        public readonly lastModified?: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(`${name} (v${version})`, collapsibleState);
        
        this.tooltip = `${name} - Version ${version}`;
        this.contextValue = isInstalled ? 'installedLibrary' : 'availableLibrary';
        
        // Iconos diferentes para instaladas vs disponibles
        this.iconPath = new vscode.ThemeIcon(
            isInstalled ? 'package-installed' : 'package',
            isInstalled ? new vscode.ThemeColor('charts.green') : undefined
        );

        // Descripción con estado
        this.description = isInstalled ? '✅ Installed' : '📦 Available';
    }
}

export class LibraryCategory extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly libraries: Library[]
    ) {
        super(label, collapsibleState);
        this.tooltip = `${label} (${libraries.length} libraries)`;
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${libraries.length} libraries`;
    }
}

export class LibraryProvider implements vscode.TreeDataProvider<Library | LibraryCategory> {
    private _onDidChangeTreeData: vscode.EventEmitter<Library | LibraryCategory | undefined | null | void> = new vscode.EventEmitter<Library | LibraryCategory | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Library | LibraryCategory | undefined | null | void> = this._onDidChangeTreeData.event;

    private availableLibraries: Library[] = [];
    private installedLibraries: Library[] = [];

    constructor(private nexusClient: NexusClient) {
        this.refresh();
    }

    refresh(): void {
        this.loadLibraries();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Library | LibraryCategory): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Library | LibraryCategory): Thenable<(Library | LibraryCategory)[]> {
        if (!element) {
            // Root level - mostrar categorías
            const categories: LibraryCategory[] = [];
            
            if (this.installedLibraries.length > 0) {
                categories.push(new LibraryCategory(
                    'Installed Libraries',
                    vscode.TreeItemCollapsibleState.Expanded,
                    this.installedLibraries
                ));
            }
            
            if (this.availableLibraries.length > 0) {
                categories.push(new LibraryCategory(
                    'Available Libraries',
                    vscode.TreeItemCollapsibleState.Expanded,
                    this.availableLibraries
                ));
            }

            if (categories.length === 0) {
                // Mostrar mensaje si no hay librerías
                return Promise.resolve([]);
            }

            return Promise.resolve(categories);
        } else if (element instanceof LibraryCategory) {
            // Devolver las librerías de la categoría
            return Promise.resolve(element.libraries);
        } else {
            // Library items no tienen hijos
            return Promise.resolve([]);
        }
    }

    private async loadLibraries(): Promise<void> {
        try {
            // Cargar librerías disponibles desde Nexus
            const availableLibraries = await this.nexusClient.getAvailableLibraries();
            console.log(`📦 Loaded ${availableLibraries.length} libraries from Nexus:`, 
                availableLibraries.map(lib => `${lib.name}@${lib.version}`));
            
            // Cargar librerías instaladas desde el proyecto local
            const installedLibraries = await this.getInstalledLibraries();
            console.log(`💻 Found ${installedLibraries.length} installed libraries:`, 
                installedLibraries.map(lib => `${lib.name}@${lib.version}`));

            // Convertir a objetos Library
            this.availableLibraries = availableLibraries
                .filter(lib => !installedLibraries.some(installed => 
                    installed.name === lib.name && installed.version === lib.version))
                .map(lib => new Library(lib.name, lib.version, false, lib.downloadUrl, lib.size, lib.lastModified));

            this.installedLibraries = installedLibraries
                .map(lib => new Library(lib.name, lib.version, true, undefined, lib.size, lib.lastModified));

            console.log(`✅ Available libraries: ${this.availableLibraries.length}, Installed: ${this.installedLibraries.length}`);

        } catch (error) {
            console.error('Error loading libraries:', error);
            vscode.window.showErrorMessage(`Failed to load libraries: ${error}`);
        }
    }

    private async getInstalledLibraries(): Promise<LibraryInfo[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        try {
            const pubspecPath = path.join(workspaceFolder.uri.fsPath, 'pubspec.yaml');
            
            if (!await fs.pathExists(pubspecPath)) {
                return [];
            }

            const pubspecContent = await fs.readFile(pubspecPath, 'utf8');
            const yaml = require('yaml');
            const pubspec = yaml.parse(pubspecContent);

            const installedLibraries: LibraryInfo[] = [];
            const config = vscode.workspace.getConfiguration('abexa');
            const packagesDir = config.get('packagesDirectory', 'packages');

            if (pubspec.dependencies) {
                for (const [name, dependency] of Object.entries(pubspec.dependencies)) {
                    if (dependency && typeof dependency === 'object' && (dependency as any).path) {
                        const dependencyPath = (dependency as any).path;
                        
                        // Verificar si es una librería ABEXA (está en el directorio packages)
                        if (dependencyPath.includes(packagesDir)) {
                            // Intentar obtener la versión del pubspec.yaml de la librería
                            const libPubspecPath = path.join(workspaceFolder.uri.fsPath, dependencyPath, 'pubspec.yaml');
                            
                            if (await fs.pathExists(libPubspecPath)) {
                                try {
                                    const libPubspecContent = await fs.readFile(libPubspecPath, 'utf8');
                                    const libPubspec = yaml.parse(libPubspecContent);
                                    
                                    installedLibraries.push({
                                        name: name,
                                        version: libPubspec.version || '0.0.0',
                                        downloadUrl: ''
                                    });
                                } catch (error) {
                                    console.error(`Error reading pubspec for ${name}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            return installedLibraries;
        } catch (error) {
            console.error('Error reading installed libraries:', error);
            return [];
        }
    }

    public getAvailableLibraries(): Library[] {
        return this.availableLibraries;
    }

    public getInstalledLibrariesList(): Library[] {
        return this.installedLibraries;
    }
}