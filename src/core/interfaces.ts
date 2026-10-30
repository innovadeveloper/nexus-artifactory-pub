export interface LibraryInfo {
    name: string;
    version: string;
    downloadUrl?: string;
    size?: string;
    lastModified?: string;
}

export interface PackageRepository {
    isConfigured(): Promise<boolean>;
    setCredentials(username: string, password: string): Promise<void>;
    setRepositoryUrl(url: string): Promise<void>;
    getAvailableLibraries(): Promise<LibraryInfo[]>;
    downloadLibrary(library: LibraryInfo, destinationPath: string): Promise<void>;
    uploadLibrary(libraryPath: string, libraryName: string, version: string): Promise<void>;
    checkLibraryExists(libraryName: string, version: string): Promise<boolean>;
    getLibraryDetails(libraryName: string, version: string): Promise<LibraryInfo | null>;
}
