import * as vscode from "vscode";
import { ServerManager } from "./ServerManager";
import { buildWebviewHtml } from "./webviewHtml";

export class MyNotePanel {
  private static current: MyNotePanel | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly serverManager: ServerManager,
  ) {}

  static async open(
    context: vscode.ExtensionContext,
    serverManager: ServerManager,
  ): Promise<void> {
    if (MyNotePanel.current) {
      MyNotePanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const server = await serverManager.ensureStarted();
    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, "media");

    const panel = vscode.window.createWebviewPanel(
      "mynote.app",
      "notinglm",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot],
      },
    );

    const instance = new MyNotePanel(panel, serverManager);
    MyNotePanel.current = instance;

    panel.webview.html = buildWebviewHtml(panel.webview, mediaRoot, server);

    panel.onDidDispose(
      () => {
        MyNotePanel.current = undefined;
        void serverManager.onPanelClosed();
      },
      undefined,
      context.subscriptions,
    );
  }

  static async disposeCurrent(): Promise<void> {
    MyNotePanel.current?.panel.dispose();
    MyNotePanel.current = undefined;
  }
}
