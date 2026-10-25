# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Release Windows (desktop)

El bundle para Windows se genera con GitHub Actions (`.github/workflows/windows-release.yml`):

1. Automatico: al hacer push de un tag (`git tag v0.5.0 && git push --tags v0.5.0`), o
2. Manual: Actions -> `Release Windows` -> `Run workflow`.

Salidas (artefacto `tuorden-windows-<version>-x64` y, si hay tag, Github Release):

- `TuOrden_*_x64-setup.exe` (NSIS) — instalador recomendado (usuario o por maquina, idioma ES/EN)
- `TuOrden_*_x64_en-US.msi` (WiX) — para despliegue corporativo (GPO/Intune)

Compatibilidad: Windows 10/11 x64, WebView2 Runtime embebido en el instalador, HiDPI por DPI de Windows, ventanas redimensionables con minimo 1024x680.

### Firma de codigo (opcional)

Sin certificado, Windows SmartScreen mostrara una advertencia al ejecutar el instalador. Para firmar automaticamente, agrega estos secrets en el repo:

- `WINDOWS_CERTIFICATE_BASE64` — certificado .pfx en base64 (`base64 certificado.pfx`)
- `WINDOWS_CERTIFICATE_PASSWORD` — contraseña del .pfx

### Notas

- La version debe quedar sincronizada en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
- Si la compilacion falla por WebView2 restante de cache, repetir el run en Actions.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
