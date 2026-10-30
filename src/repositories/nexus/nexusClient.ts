import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { PackageRepository } from '../../core/interfaces';

export interface LibraryInfo {
    name: string;
    version: string;
    downloadUrl: string;
    size?: string;
    lastModified?: string;
    // Información adicional del endpoint de búsqueda
    checksum?: {
        sha1?: string;
        md5?: string;
    };
    uploader?: string;
    uploaderIp?: string;
    contentType?: string;
    lastDownloaded?: string;
    blobCreated?: string;
}

export class NexusClient implements PackageRepository {
    private client: AxiosInstance;
    private baseUrl: string = '';
    private username: string = '';
    private password: string = '';
    private context: vscode.ExtensionContext;

    constructor(context?: vscode.ExtensionContext) {
        this.context = context!;
        this.loadConfiguration();
        this.client = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    private async loadConfiguration() {
        const config = vscode.workspace.getConfiguration('libmanager');
        this.baseUrl = config.get('nexusUrl', '');
        this.username = config.get('username', '');
        
        if (this.context) {
            this.password = await this.context.secrets.get('libmanager.password') || '';
        }
    }

    public async isConfigured(): Promise<boolean> {
        await this.loadConfiguration();
        return !!(this.baseUrl && this.username && this.password);
    }

    public async setCredentials(username: string, password: string): Promise<void> {
        this.username = username;
        this.password = password;
        
        // Guardar username en configuración
        const config = vscode.workspace.getConfiguration('libmanager');
        await config.update('username', username, vscode.ConfigurationTarget.Global);
        
        // Guardar password en SecretStorage seguro
        if (this.context) {
            await this.context.secrets.store('libmanager.password', password);
        }
    }

    public async setRepositoryUrl(url: string): Promise<void> {
        this.baseUrl = url;
        const config = vscode.workspace.getConfiguration('libmanager');
        await config.update('nexusUrl', url, vscode.ConfigurationTarget.Global);
    }

    public async getAvailableLibraries(): Promise<LibraryInfo[]> {
        try {
            if (!this.baseUrl) {
                throw new Error('Artifactory URL not configured');
            }

            await this.loadConfiguration();

            if (!this.username || !this.password) {
                throw new Error('Credentials not configured');
            }

            // Extraer el repository name de la URL
            const repoMatch = this.baseUrl.match(/\/repository\/([^\/]+)/);
            if (!repoMatch) {
                throw new Error('Cannot extract repository name from URL');
            }
            
            const repoName = repoMatch[1];
            const baseApiUrl = this.baseUrl.split('/repository/')[0];
            const componentsUrl = `${baseApiUrl}/service/rest/v1/components?repository=${repoName}`;
            
            console.log(`Fetching libraries from: ${componentsUrl}`);
            
            const auth = this.username && this.password 
                ? { username: this.username, password: this.password }
                : undefined;

            const response = await this.client.get(componentsUrl, { auth });
            
            const libraries: LibraryInfo[] = [];
            
            if (response.data && response.data.items) {
                for (const component of response.data.items) {
                    if (component.assets && component.assets.length > 0) {
                        const asset = component.assets[0]; // Tomar el primer asset
                        
                        // Extraer nombre y versión del path
                        // Ej: "shared_library/0.0.1/shared_library-0.0.1.tar.gz"
                        const pathParts = asset.path.split('/');
                        if (pathParts.length >= 2) {
                            const libraryName = pathParts[0];
                            const version = pathParts[1];
                            
                            // Formatear tamaño
                            const sizeInKB = asset.fileSize ? Math.round(asset.fileSize / 1024) : 0;
                            const sizeStr = sizeInKB > 0 ? `${sizeInKB} KB` : 'Unknown';
                            
                            libraries.push({
                                name: libraryName,
                                version: version,
                                downloadUrl: asset.downloadUrl ? asset.downloadUrl.replace('http://', 'https://') : asset.downloadUrl,
                                size: sizeStr,
                                lastModified: asset.lastModified
                            });
                        }
                    }
                }
            }

            console.log(`Found ${libraries.length} libraries from Nexus`);
            return libraries;
        } catch (error) {
            console.error('Error fetching libraries:', error);
            
            // Fallback: retornar librerías de ejemplo si no se puede conectar
            const mockLibraries: LibraryInfo[] = [
                {
                    name: 'example_library',
                    version: '1.0.0',
                    downloadUrl: `${this.baseUrl}/example_library/1.0.0/example_library-1.0.0.tar.gz`,
                    size: 'Unknown'
                }
            ];
            
            throw new Error(`Failed to fetch libraries from Nexus: ${error}`);
        }
    }

    public async downloadLibrary(library: LibraryInfo, destinationPath: string): Promise<void> {
        try {
            const auth = this.username && this.password 
                ? { username: this.username, password: this.password }
                : undefined;

            const response = await this.client.get(library.downloadUrl, {
                auth,
                responseType: 'stream'
            });

            const fs = require('fs-extra');
            const writer = fs.createWriteStream(destinationPath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Failed to download ${library.name}: ${error}`);
        }
    }

    public async uploadLibrary(libraryPath: string, libraryName: string, version: string): Promise<void> {
        try {
            const fs = require('fs-extra');
            const fileName = `${libraryName}-${version}.tar.gz`;
            const uploadUrl = `${this.baseUrl}/${libraryName}/${version}/${fileName}`;

            const fileStream = fs.createReadStream(libraryPath);
            
            const auth = this.username && this.password 
                ? { username: this.username, password: this.password }
                : undefined;

            await this.client.put(uploadUrl, fileStream, {
                auth,
                headers: {
                    'Content-Type': 'application/gzip'
                }
            });
        } catch (error) {
            throw new Error(`Failed to upload ${libraryName}: ${error}`);
        }
    }

    public async checkLibraryExists(libraryName: string, version: string): Promise<boolean> {
        try {
            const url = `${this.baseUrl}/${libraryName}/${version}/${libraryName}-${version}.tar.gz`;
            
            const auth = this.username && this.password 
                ? { username: this.username, password: this.password }
                : undefined;

            const response = await this.client.head(url, { auth });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    public async getLibraryDetails(libraryName: string, version: string): Promise<LibraryInfo | null> {
        try {
            // Extraer el repository name de la URL
            const repoMatch = this.baseUrl.match(/\/repository\/([^\/]+)/);
            if (!repoMatch) {
                throw new Error('Cannot extract repository name from URL');
            }
            
            const repoName = repoMatch[1];
            const baseApiUrl = this.baseUrl.split('/repository/')[0];
            
            // Buscar por nombre exacto: shared_library/0.0.1/shared_library-0.0.1.tar.gz
            const exactName = `${libraryName}/${version}/${libraryName}-${version}.tar.gz`;
            const searchUrl = `${baseApiUrl}/service/rest/v1/search?repository=${repoName}&name=${exactName}`;
            
            console.log(`🔍 Searching for library details: ${searchUrl}`);
            
            await this.loadConfiguration();
            const auth = this.username && this.password 
                ? { username: this.username, password: this.password }
                : undefined;

            const response = await this.client.get(searchUrl, { auth });
            
            if (response.data && response.data.items && response.data.items.length > 0) {
                const item = response.data.items[0];
                
                // El item puede tener assets o ser directamente el asset
                let asset = item;
                if (item.assets && item.assets.length > 0) {
                    asset = item.assets[0];
                }
                
                const sizeInKB = asset.fileSize ? Math.round(asset.fileSize / 1024) : 0;
                const sizeStr = sizeInKB > 0 ? `${sizeInKB} KB` : 'Unknown';
                
                return {
                    name: libraryName,
                    version: version,
                    downloadUrl: (asset.downloadUrl ? asset.downloadUrl.replace('http://', 'https://') : `${this.baseUrl}/${exactName}`),
                    size: sizeStr,
                    lastModified: asset.lastModified,
                    // Información adicional disponible en la búsqueda
                    checksum: asset.checksum,
                    uploader: asset.uploader,
                    uploaderIp: asset.uploaderIp,
                    contentType: asset.contentType,
                    lastDownloaded: asset.lastDownloaded,
                    blobCreated: asset.blobCreated
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Error getting library details for ${libraryName}@${version}:`, error);
            return null;
        }
    }
}