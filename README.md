# notinglm for VS Code

本地优先的块笔记（类 Logseq / Tana），在 VS Code 的**独立编辑器标签页**中运行。

English summary: notinglm opens as a single editor tab Webview, starts a local Rust sidecar (`mynote-server.exe`) on `127.0.0.1` with a random port and token, and reuses the same SQLite knowledge base as the MyNote desktop app (shared data directory).

## 工作原理 / 本地服务声明

- 执行命令 **「notinglm: 打开」** 时，扩展会启动随 VSIX 分发的本地进程 `mynote-server.exe`。
- 服务**仅监听** `127.0.0.1` 的随机端口，每次启动生成随机 Bearer Token；Webview 通过本机 HTTP 访问 API。
- **未打开** notinglm 标签页时，扩展不会启动任何后端进程。
- **关闭** notinglm 标签页后默认停止服务（设置 `mynote.server.stopWhenTabClosed`，默认 `true`）。
- 扩展 `extensionKind` 为 `ui`：在 Remote SSH / WSL / 容器场景下仍运行在**本机**。

## 数据位置与保留

- SQLite 数据库默认位于：`%APPDATA%\com.chaizhaobing.mynote`（与 MyNote 桌面版共享同一份笔记；sidecar 仍为 `mynote-server.exe`）。
- 可通过机器级设置 `mynote.dataDir` 覆盖。
- 数据长期保留，无自动过期删除。
- **卸载本扩展不会删除笔记数据**。
- 手动清理：删除上述数据目录（若同时使用桌面版请勿删除）。

## 隐私边界

- 不读取 VS Code 工作区文件，不读取当前打开的代码，不注册文件监听。
- 无遥测。
- **云同步默认关闭**（`mynote.features.sync` 默认 `false`）。
- AI 功能默认开启，但仅在用户已于 notinglm / MyNote 配置中保存 API Key 后才会产生对外网络请求；请求由本地服务发往用户配置的 AI 服务商。API Key 不会注入扩展设置或文档展示。

## 管理员配置（machine 级）

以下设置均为 **machine** 作用域（不随 Settings Sync 漫游，工作区不可覆盖），并由 **mynote-server 强制执行**：

| 设置 | 默认 | 说明 |
|------|------|------|
| `mynote.features.ai` | `true` | 启用 AI |
| `mynote.features.sync` | `false` | 启用云同步 |
| `mynote.features.fileImport` | `true` | 启用文件导入 |

修改后需关闭并重新打开 notinglm 标签页生效。管理员可通过机器级 `settings.json` 或组策略统一禁用。

## 完整性验证

- **当前版本未进行 Windows Authenticode 代码签名**（若后续发布签名构建，将在此更新签名主体）。
- 发布产物附带 `SHA256SUMS.txt`；扩展启动 sidecar 前会校验 `mynote-server.exe` 与同目录 `.sha256` 文件是否一致。
- SBOM（CycloneDX）位于发布包的 `sbom/` 目录。

## 系统要求

- Windows x64
- VS Code ≥ 1.90
- 无需安装 Rust / Node.js（运行时）

## 开发构建

在仓库根目录：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-vscode-extension.ps1
```

产物：`dist-vsix/*.vsix`
