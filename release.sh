#!/bin/zsh
# Script de build + artefacto + guía para publicar en VS Code Marketplace
# Uso: bash release.sh

set -euo pipefail

echo "=== 1. Compilar TypeScript ==="
npm run compile

echo ""
echo "=== 2. Generar artefacto (.vsix) ==="
npm run package

echo ""
echo "=== 3. Verificar artefacto ==="
vsix_file=$(ls -t *.vsix 2>/dev/null | head -n 1)
if [ -z "$vsix_file" ]; then
    echo "ERROR: No se encontró archivo .vsix"
    exit 1
fi
echo "Artefacto generado: $vsix_file"

echo ""
echo "========================================"
echo "PASOS PARA SUBIR A VS CODE MARKETPLACE"
echo "========================================"
echo ""
echo "Antes de publicar con 'npm run deploy' / 'vsce publish':"
echo ""
echo "- [ ] package.json: 'version' actualizado y 'publisher' correcto"
echo "- [ ] package.json: 'engines.vscode' compatible con versiones soportadas"
echo "- [ ] package.json: 'categories', 'keywords', 'icon' definidos"
echo "- [ ] package.json: comandos registrados en 'contributes.commands' con títulos [LibManager]"
echo "- [ ] README.md: descripción completa, instrucciones de instalación y uso"
echo "- [ ] CHANGELOG.md: cambios recientes documentados"
echo "- [ ] LICENSE: archivo MIT (o según corresponda) presente"
echo "- [ ] Assets: icono 128x128 y screenshots opcionales en 'images/' o URLs"
echo "- [ ] Extension no tiene errores de compilación ni warnings críticos"
echo "- [ ] Prueba manual con 'F5' pasó sin errores"
echo "- [ ] Artefacto '.vsix' verificado y contenido revisado (unzip -l $vsix_file | head)"
echo ""
echo "Para publicar (requiere token de Azure DevOps/Azure Publisher):"
echo "  npm run deploy"
echo "  # o directamente: vsce publish -p <token>"
echo ""
echo "NOTA: Si no deseas publicar, usa el .vsix para instalación manual:"
echo "  code --install-extension $vsix_file"
