# Guía: Compilar, empaquetar e instalar la extensión manualmente

Proyecto: **ABEXA Flutter Libraries** (extensión VS Code para gestionar librerías privadas de Flutter desde Nexus).

---

## 1. Requisitos previos

- [Node.js](https://nodejs.org/) y `npm`
- [Visual Studio Code](https://code.visualstudio.com/)
- Opcional: `vsce` (tool para empaquetar extensiones de VS Code)

Instalar `vsce` si no está disponible:

```bash
npm install -g @vscode/vsce
```

---

## 2. Compilar / generar artefacto

### Opción A: Solo compilar (transpilación TypeScript)

```bash
npm run compile
```

Esto ejecuta `tsc -p ./` y genera los archivos `.js` correspondientes en `out/` (según `tsconfig.json`).

### Opción B: Empaquetar en `.vsix` (artefacto instalable)

```bash
npm run package
```

Esto ejecuta `vsce package` y genera un archivo como:

```
abexa-flutter-libraries-0.0.1.vsix
```

> También puedes usar `npm run vscode:prepublish` (ejecuta `compile` antes de empaquetar si vas a publicar, aunque no es necesario para instalación manual).

---

## 3. Instalar manualmente sin publicar en Marketplace

No se requiere publicar en el marketplace para usar la extensión localmente o distribuirla manualmente.

### Pasos en VS Code:

1. Abre VS Code.
2. Ve al panel de **Extensiones** (icono de bloque / `Ctrl+Shift+X`).
3. Haz clic en los **tres puntos** (`⋯`) en la parte superior derecha → **Install from VSIX...**.
4. Selecciona el archivo `.vsix` generado (`abexa-flutter-libraries-0.0.1.vsix`).
5. Confirma la instalación; VS Code lo cargará inmediatamente.

> También puedes instalarlo por línea de comandos si abres VS Code con el archivo:
> ```bash
> code --install-extension abexa-flutter-libraries-0.0.1.vsix
> ```

---

## 4. Desinstalar / actualizar manualmente

- **Desinstalar:** Panel de Extensiones → buscar "ABEXA Flutter Libraries" → click derecho → **Uninstall**.
- **Actualizar:** Repite el paso 2 para generar un nuevo `.vsix` (con nueva versión en `package.json`) y luego "Install from VSIX..."; VS Code reemplazará la anterior.

---

## 5. Comandos útiles de desarrollo

| Comando | Descripción |
|---|---|
| `npm run compile` | Compilar TypeScript |
| `npm run watch` | Compilar en modo observador (desarrollo) |
| `npm run lint` | Revisar código con ESLint |
| `npm run package` | Generar `.vsix` para instalación manual |
| `npm run deploy` | Publicar en marketplace (`vsce publish`) — **no usar si no quieres publicar** |

---

## 6. Resumen rápido (copiar y pegar)

```bash
# 1. Compilar / empaquetar
npm install
npm run package

# 2. Instalar en VS Code (desde la UI o CLI)
code --install-extension abexa-flutter-libraries-0.0.1.vsix
```

---

*Guía generada para instalación local/manual sin publicar en VS Code Marketplace.*
