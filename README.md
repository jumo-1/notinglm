# notinglm

Local-first block notes (Logseq / Tana style) inside a **VS Code editor tab**.

Extension id: `chaizhaobing.notinglm`  
Command palette: **notinglm: 打开**  
Sidecar binary (inside VSIX): `mynote-server.exe`  
Default data directory: `%APPDATA%\com.chaizhaobing.mynote` (shared with the MyNote desktop app)

## Install (recommended)

Download the VSIX from the [GitHub Releases](https://github.com/jumo-1/notinglm/releases) page, then:

```powershell
code --install-extension notinglm-win32-x64-0.1.1.vsix
```

Or install from a local path after downloading:

```powershell
code --install-extension path\to\notinglm-win32-x64-0.1.1.vsix
```

Requirements: Windows x64, VS Code ≥ 1.90.

## Why binaries are not in git

`bin/` (`mynote-server.exe`) and `media/` (webview assets) are large build artifacts and ship inside the Release VSIX. Clone this repo for extension TypeScript source only; use Releases to install.

## Privacy / local server

- Opens as a single editor-tab Webview.
- Starts a local Rust sidecar on `127.0.0.1` with a random port and Bearer token.
- Does not read your VS Code workspace files.
- Cloud sync defaults to off; AI only talks to providers you configure.

## Develop from source

This repository contains the VS Code extension sources. Building a full VSIX normally requires the MyNote monorepo build that produces `mynote-server.exe` and web `media/`. Prefer installing the prebuilt VSIX from Releases.

If you only need to compile the extension host JS:

```powershell
npm ci
npm run check
npm run compile
```

## Configuration

| Setting | Default | Notes |
|---------|---------|--------|
| `mynote.dataDir` | empty → `%APPDATA%\com.chaizhaobing.mynote` | Machine scope |
| `mynote.server.stopWhenTabClosed` | `true` | Stop sidecar when tab closes |
| `mynote.features.ai` | `true` | Enforced by server |
| `mynote.features.sync` | `false` | Enforced by server |
| `mynote.features.fileImport` | `true` | Enforced by server |

Uninstalling the extension does **not** delete your notes database.

## License / publisher

VS Code Marketplace publisher id in `package.json` is `chaizhaobing`. GitHub org/user for this source repo is `jumo-1`.
