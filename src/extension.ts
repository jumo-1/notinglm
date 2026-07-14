import * as vscode from "vscode";
import { MyNotePanel } from "./MyNotePanel";
import { ServerManager } from "./ServerManager";

let serverManager: ServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("notinglm");
  serverManager = new ServerManager(context, output);
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("mynote.open", async () => {
      try {
        await MyNotePanel.open(context, serverManager!);
      } catch (err) {
        output.appendLine(String(err));
        void vscode.window.showErrorMessage(
          `notinglm 启动失败：${err instanceof Error ? err.message : String(err)}（详见输出面板 "notinglm"）`,
        );
      }
    }),
  );
}

export async function deactivate(): Promise<void> {
  await serverManager?.dispose();
}
