import * as fs from 'fs-extra';
import * as path from 'path';

export interface CompatibilityData {
  modulePath: string;
  moduleName: string;
  version: string;
  sdk: string;
  type: 'library' | 'plugin' | 'app';
  android?: AndroidInfo;
  ios?: IosInfo;
  permissions?: PermissionsInfo;
}

export interface AndroidInfo {
  agp?: string;
  gradle?: string;
  kotlin?: string;
  minSdk?: string;
  compileSdk?: string;
  buildTools?: string;
}

export interface IosInfo {
  podspecName?: string;
  podspecVersion?: string;
  deploymentTarget?: string;
  platform?: string;
}

export interface PermissionsInfo {
  android?: string[];
  ios?: string[];
}

export async function scanModule(modulePath: string): Promise<CompatibilityData> {
  const data: CompatibilityData = {
    modulePath,
    moduleName: path.basename(modulePath),
    version: '0.0.0',
    sdk: '',
    type: 'library',
  };

  // pubspec.yaml
  const pubspecPath = path.join(modulePath, 'pubspec.yaml');
  if (await fs.pathExists(pubspecPath)) {
    try {
      const content = await fs.readFile(pubspecPath, 'utf8');
      const yaml = require('yaml');
      const p = yaml.parse(content);
      data.moduleName = p.name || data.moduleName;
      data.version = p.version || data.version;
      data.sdk = p.environment?.sdk || '';
    } catch { /* ignore */ }
  }

  // Android build.gradle
  const buildGradle = path.join(modulePath, 'android', 'build.gradle');
  if (await fs.pathExists(buildGradle)) {
    const content = await fs.readFile(buildGradle, 'utf8');
    const agpMatch = content.match(/classpath\s+['"]com\.android\.tools\.build:gradle:([\d.]+).*['"]/);
    const kotlinMatch = content.match(/kotlin\s+['"](org\.jetbrains\.kotlin:kotlin-gradle-plugin:([\d.]+))['"]/);
    const minSdkMatch = content.match(/minSdk\s+(\d+)/);
    const compileSdkMatch = content.match(/compileSdk(Version)?\s+(\d+)/);
    data.android = {
      agp: agpMatch ? agpMatch[1] : undefined,
      kotlin: kotlinMatch ? kotlinMatch[2] : undefined,
      minSdk: minSdkMatch ? minSdkMatch[1] : undefined,
      compileSdk: compileSdkMatch ? compileSdkMatch[2] : undefined,
    };
  }

  // AndroidManifest.xml (permisos)
  const manifestPath = path.join(modulePath, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (await fs.pathExists(manifestPath)) {
    const content = await fs.readFile(manifestPath, 'utf8');
    const permMatches = content.matchAll(/<uses-permission[^>]*android:name=["']([^"']+)["']/g);
    const androidPerms = Array.from(permMatches).map(m => m[1]);
    if (androidPerms.length) {
      data.permissions = data.permissions || {};
      data.permissions.android = androidPerms;
    }
  }

  // iOS podspec
  const iosDir = path.join(modulePath, 'ios');
  if (await fs.pathExists(iosDir)) {
    const entries = await fs.readdir(iosDir);
    const podspecFile = entries.find(e => e.endsWith('.podspec'));
    if (podspecFile) {
      const podspecPath = path.join(iosDir, podspecFile);
      try {
        const content = await fs.readFile(podspecPath, 'utf8');
        const nameMatch = content.match(/Pod::Spec\.new\s+['"]([^'"]+)['"]/);
        const versionMatch = content.match(/s\.version\s+=\s+['"]([^'"]+)['"]/);
        const deployMatch = content.match(/s\.platform\s+=\s+[^,]+,\s*['"]([^'"]+)['"]/);
        data.ios = {
          podspecName: nameMatch ? nameMatch[1] : undefined,
          podspecVersion: versionMatch ? versionMatch[1] : undefined,
          deploymentTarget: deployMatch ? deployMatch[1] : undefined,
          platform: deployMatch ? deployMatch[1] : undefined,
        };
      } catch { /* ignore */ }
    }
  }

  // iOS permisos básicos (Info.plist o entitlements)
  const infoPlistPaths = [
    path.join(modulePath, 'ios', 'Runner', 'Info.plist'),
    path.join(modulePath, 'ios', 'Info.plist'),
  ];
  for (const plistPath of infoPlistPaths) {
    if (await fs.pathExists(plistPath)) {
      try {
        const content = await fs.readFile(plistPath, 'utf8');
        // Buscar descripciones de uso (permisos clave como NSCameraUsageDescription)
        const descMatches = content.matchAll(/<key>(NS[\w]+UsageDescription)<\/key>\s*<string>([^<]+)<\/string>/g);
        const iosPerms = Array.from(descMatches).map(m => `${m[1]}: ${m[2].trim().substring(0, 30)}...`);
        if (iosPerms.length) {
          data.permissions = data.permissions || {};
          data.permissions.ios = iosPerms;
        }
      } catch { /* ignore */ }
    }
  }

  // Detectar tipo: app / plugin / library pura
  const hasAppAndroid = await fs.pathExists(path.join(modulePath, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'));
  const hasIosRunner = await fs.pathExists(path.join(modulePath, 'ios', 'Runner'));
  const hasPluginAndroid = await fs.pathExists(path.join(modulePath, 'android', 'build.gradle'));
  let hasPluginIos = false;
  try {
    const iosDir = path.join(modulePath, 'ios');
    if (await fs.pathExists(iosDir)) {
      const iosFiles = await fs.readdir(iosDir);
      hasPluginIos = iosFiles.some((f: string) => f.endsWith('.podspec'));
    }
  } catch { /* ignore */ }
  if (hasAppAndroid || hasIosRunner) {
    data.type = 'app';
  } else if (hasPluginAndroid || hasPluginIos) {
    data.type = 'plugin';
  } else {
    data.type = 'library';
  }

  return data;
}
