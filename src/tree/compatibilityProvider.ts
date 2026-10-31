import * as vscode from 'vscode';
import * as path from 'path';
import { scanModule, CompatibilityData } from '../repositories/compatibility/compatibilityScanner';

export class CompatibilityProvider implements vscode.TreeDataProvider<CompatibilityNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<CompatibilityNode | undefined | void> = new vscode.EventEmitter<CompatibilityNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<CompatibilityNode | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CompatibilityNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CompatibilityNode): Thenable<CompatibilityNode[]> {
    if (!element) {
      // Nivel raíz: buscar módulos/subcarpetas con pubspec.yaml
      return this.findModules();
    }
    return Promise.resolve([]);
  }

  private async findModules(): Promise<CompatibilityNode[]> {
    const root = this.workspaceRoot;
    const nodes: CompatibilityNode[] = [];

    const rootPubspec = path.join(root, 'pubspec.yaml');
    if (await this.exists(rootPubspec)) {
      nodes.push(this.makeNode(root, 'workspace root'));
    }

    const fs = require('fs-extra');
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !['.git','build','.dart_tool','node_modules','.vscode'].includes(entry.name)) {
          const subPub = path.join(root, entry.name, 'pubspec.yaml');
          if (await this.exists(subPub)) {
            nodes.push(this.makeNode(path.join(root, entry.name), entry.name));
          }
        }
      }
    } catch { /* ignore */ }
    return nodes;
  }

  private makeNode(dir: string, label: string): CompatibilityNode {
    return new CompatibilityNode(label, dir, vscode.TreeItemCollapsibleState.Collapsed);
  }

  private async exists(p: string): Promise<boolean> {
    const fs = require('fs-extra');
    return fs.pathExists(p);
  }

  async getScanData(node: CompatibilityNode): Promise<CompatibilityData> {
    return scanModule(node.path);
  }
}

export class CompatibilityNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly path: string,
    public readonly collapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `Scan module: ${label}`;
    this.contextValue = 'compatibilityNode';
    this.iconPath = new vscode.ThemeIcon('plug');
  }
}
