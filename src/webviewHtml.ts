import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { RunningServer } from "./ServerManager";

export function buildWebviewHtml(
  webview: vscode.Webview,
  mediaRoot: vscode.Uri,
  server: RunningServer,
): string {
  const indexPath = path.join(mediaRoot.fsPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Missing webview media at ${indexPath}. Run npm run build:vscode-ui first.`,
    );
  }

  let html = fs.readFileSync(indexPath, "utf8");
  const nonce = crypto.randomBytes(16).toString("base64");
  const cspSource = webview.cspSource;
  const port = new URL(server.baseUrl).port || "80";

  html = html.replace(
    /<(script|link|img)\b([^>]*?)\b(src|href)=["']\.\/([^"']+)["']([^>]*)>/gi,
    (_match, tag: string, pre: string, attr: string, rel: string, post: string) => {
      const uri = webview
        .asWebviewUri(vscode.Uri.joinPath(mediaRoot, ...rel.split("/")))
        .toString();
      const nonceAttr =
        tag.toLowerCase() === "script" && !/\bnonce=/.test(pre + post)
          ? ` nonce="${nonce}"`
          : "";
      return `<${tag}${pre}${attr}="${uri}"${post}${nonceAttr}>`;
    },
  );

  html = html.replace(/<link\b[^>]*rel=["']manifest["'][^>]*>/gi, "");
  html = html.replace(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*>/gi, "");

  const bootstrap = `
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob: https:; media-src ${cspSource} data: blob:; font-src ${cspSource} data: https://fonts.gstatic.com; style-src ${cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' ${cspSource}; worker-src ${cspSource} blob:; frame-src blob:; connect-src http://127.0.0.1:${port} https:;">
<script nonce="${nonce}">
  window.__MYNOTE_VSCODE__ = true;
  window.__MYNOTE_API_BASE_URL__ = ${JSON.stringify(server.baseUrl)};
  ${
    server.token
      ? `window.__MYNOTE_API_TOKEN__ = ${JSON.stringify(server.token)};`
      : ""
  }
  window.__MYNOTE_DISABLED_FEATURES__ = ${JSON.stringify(server.disabledFeatures)};
</script>`;

  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${bootstrap}\n`);
  } else {
    html = bootstrap + html;
  }

  return html;
}
