import * as vscode from "vscode";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ChildProcess, spawn, spawnSync } from "child_process";

export interface RunningServer {
  baseUrl: string;
  token: string | null;
  disabledFeatures: string[];
}

interface HealthPayload {
  ok?: boolean;
  authRequired?: boolean;
  dataDir?: string;
  disabledFeatures?: string[];
}

export class ServerManager {
  private child: ChildProcess | undefined;
  private port: number | undefined;
  private token: string | undefined;
  private external = false;
  private disabledFeatures: string[] = [];
  private starting: Promise<RunningServer> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  async ensureStarted(): Promise<RunningServer> {
    if (this.port) {
      return {
        baseUrl: `http://127.0.0.1:${this.port}`,
        token: this.token ?? null,
        disabledFeatures: this.disabledFeatures,
      };
    }
    if (!this.starting) {
      this.starting = this.startInternal().finally(() => {
        this.starting = undefined;
      });
    }
    return this.starting;
  }

  private async startInternal(): Promise<RunningServer> {
    const dataDir = this.resolveDataDir();
    const reused = await this.tryReuseExternal(dataDir);
    if (reused) {
      return reused;
    }

    const exePath = this.context.asAbsolutePath(
      path.join("bin", "win32-x64", "mynote-server.exe"),
    );
    if (!fs.existsSync(exePath)) {
      throw new Error(
        `未找到 mynote-server.exe：${exePath}。请先运行 scripts/build-vscode-extension.ps1`,
      );
    }
    this.verifyExeHash(exePath);

    const token = crypto.randomBytes(32).toString("hex");
    const disabled = this.resolveDisabledFeatures();
    const args = [
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--app-data-dir",
      dataDir,
    ];
    if (disabled.length > 0) {
      args.push("--disabled-features", disabled.join(","));
    }

    this.output.appendLine(`Starting mynote-server: ${exePath}`);
    this.output.appendLine(`Data dir: ${dataDir}`);
    this.output.appendLine(`Disabled features: ${disabled.join(",") || "(none)"}`);

    const child = spawn(exePath, args, {
      windowsHide: true,
      env: { ...process.env, MYNOTE_SERVER_TOKEN: token },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.token = token;
    this.external = false;
    this.disabledFeatures = disabled;

    let stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrTail = (stderrTail + text).slice(-4000);
      this.output.append(text);
    });

    const ready = await this.waitForReady(child, 15_000, () => stderrTail);
    this.port = ready.port;

    const baseUrl = `http://127.0.0.1:${this.port}`;
    await this.waitForHealth(baseUrl, token, 10_000);

    child.on("exit", (code, signal) => {
      this.output.appendLine(
        `mynote-server exited code=${code} signal=${signal ?? ""}`,
      );
      if (this.child === child) {
        this.child = undefined;
        this.port = undefined;
        this.token = undefined;
      }
    });

    return {
      baseUrl,
      token,
      disabledFeatures: disabled,
    };
  }

  private async tryReuseExternal(dataDir: string): Promise<RunningServer | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch("http://127.0.0.1:1428/health", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        return null;
      }
      const health = (await response.json()) as HealthPayload;
      if (health.authRequired) {
        return null;
      }
      const healthDir = (health.dataDir ?? "").replace(/[\\/]+$/, "");
      const expected = dataDir.replace(/[\\/]+$/, "");
      if (
        healthDir.toLowerCase() !== expected.toLowerCase() &&
        path.resolve(healthDir).toLowerCase() !== path.resolve(expected).toLowerCase()
      ) {
        this.output.appendLine(
          `Existing server dataDir mismatch (${healthDir} vs ${expected}); starting own instance.`,
        );
        return null;
      }
      this.external = true;
      this.port = 1428;
      this.token = undefined;
      // Always apply extension settings on top of health payload, so Sync UI
      // stays hidden in the plugin even when reusing a desktop/web server.
      this.disabledFeatures = Array.from(
        new Set([...(health.disabledFeatures ?? []), ...this.resolveDisabledFeatures()]),
      );
      this.output.appendLine("Reusing existing mynote-server on :1428");
      return {
        baseUrl: "http://127.0.0.1:1428",
        token: null,
        disabledFeatures: this.disabledFeatures,
      };
    } catch {
      return null;
    }
  }

  private resolveDataDir(): string {
    const configured = vscode.workspace
      .getConfiguration("mynote")
      .get<string>("dataDir", "")
      .trim();
    if (configured) {
      return configured;
    }
    const appdata = process.env.APPDATA;
    if (!appdata) {
      throw new Error("APPDATA is not set; cannot resolve notinglm data directory");
    }
    return path.join(appdata, "com.chaizhaobing.mynote");
  }

  private resolveDisabledFeatures(): string[] {
    const cfg = vscode.workspace.getConfiguration("mynote");
    const disabled: string[] = [];
    if (!cfg.get<boolean>("features.ai", true)) disabled.push("ai");
    if (!cfg.get<boolean>("features.sync", false)) disabled.push("sync");
    if (!cfg.get<boolean>("features.fileImport", true)) disabled.push("import");
    return disabled;
  }

  private verifyExeHash(exePath: string): void {
    const hashPath = `${exePath}.sha256`;
    if (!fs.existsSync(hashPath)) {
      this.output.appendLine(
        `Warning: missing ${path.basename(hashPath)}; skipping integrity check.`,
      );
      return;
    }
    const expected = fs.readFileSync(hashPath, "utf8").trim().toLowerCase();
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(exePath))
      .digest("hex")
      .toLowerCase();
    if (expected !== actual) {
      throw new Error(
        `mynote-server.exe integrity check failed (expected ${expected}, got ${actual})`,
      );
    }
  }

  private waitForReady(
    child: ChildProcess,
    timeoutMs: number,
    getStderr: () => string,
  ): Promise<{ port: number; pid: number; protocolVersion: number }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = "";
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `mynote-server did not become ready within ${timeoutMs}ms\n${getStderr()}`,
          ),
        );
      }, timeoutMs);

      const onExit = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `mynote-server exited before ready (code=${code})\n${getStderr()}`,
          ),
        );
      };
      child.once("exit", onExit);

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        this.output.append(text);
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) continue;
          try {
            const payload = JSON.parse(trimmed) as {
              type?: string;
              port?: number;
              pid?: number;
              protocolVersion?: number;
            };
            if (payload.type === "ready" && typeof payload.port === "number") {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              child.off("exit", onExit);
              resolve({
                port: payload.port,
                pid: payload.pid ?? child.pid ?? 0,
                protocolVersion: payload.protocolVersion ?? 1,
              });
            }
          } catch {
            /* ignore non-JSON lines */
          }
        }
      });
    });
  }

  private async waitForHealth(
    baseUrl: string,
    token: string,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const health = (await response.json()) as HealthPayload;
          if (Array.isArray(health.disabledFeatures)) {
            this.disabledFeatures = health.disabledFeatures;
          }
          return;
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = String(error);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Health check failed for ${baseUrl}: ${lastError}`);
  }

  async onPanelClosed(): Promise<void> {
    const stop = vscode.workspace
      .getConfiguration("mynote")
      .get<boolean>("server.stopWhenTabClosed", true);
    if (stop && !this.external) {
      await this.stop();
    }
  }

  async stop(): Promise<void> {
    if (this.external) {
      this.port = undefined;
      this.token = undefined;
      this.external = false;
      return;
    }
    const child = this.child;
    if (!child || child.killed) {
      this.child = undefined;
      this.port = undefined;
      this.token = undefined;
      return;
    }
    const pid = child.pid;
    this.output.appendLine(`Stopping mynote-server pid=${pid}`);
    try {
      child.kill();
    } catch (error) {
      this.output.appendLine(`kill failed: ${String(error)}`);
    }

    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    if (!exited && pid) {
      this.output.appendLine(`Force killing mynote-server pid=${pid}`);
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    }

    this.child = undefined;
    this.port = undefined;
    this.token = undefined;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
