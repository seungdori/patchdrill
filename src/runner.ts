import { spawn, spawnSync } from "node:child_process";
import type { CommandPlan, CommandResult } from "./types.js";

export interface RunOptions {
  cwd: string;
  maxOutputChars: number;
  commandTimeoutMs?: number;
}

export async function runCommandPlan(plans: CommandPlan[], options: RunOptions): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const plan of plans) {
    if (!plan.required) continue;
    results.push(await runShellCommand(plan.id, plan.command, options));
  }
  return results;
}

function runShellCommand(id: string, command: string, options: RunOptions): Promise<CommandResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: process.env.CI ?? "1" }
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timeout = options.commandTimeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stderr = appendBounded(stderr, `\n[PatchDrill command timed out after ${options.commandTimeoutMs}ms]\n`, options.maxOutputChars);
          killChild(child.pid, "SIGTERM");
          setTimeout(() => {
            if (!settled) killChild(child.pid, "SIGKILL");
          }, 1000).unref();
        }, options.commandTimeoutMs)
      : undefined;
    timeout?.unref();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString("utf8"), options.maxOutputChars);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString("utf8"), options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        id,
        command,
        exitCode: timedOut ? 124 : (exitCode ?? 1),
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        ...(timedOut ? { timedOut: true } : {})
      });
    });
    child.on("error", (error) => {
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        id,
        command,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: appendBounded(stderr, error.message, options.maxOutputChars)
      });
    });
  });
}

function appendBounded(current: string, next: string, maxChars: number): string {
  const limit = Math.max(0, maxChars);
  const combined = current + next;
  if (combined.length <= limit) return combined;
  const marker = `[PatchDrill truncated output to last ${limit} characters]\n`;
  if (limit <= marker.length) return marker.slice(0, limit);
  return `${marker}${combined.slice(-(limit - marker.length))}`;
}

function killChild(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      const args = ["/pid", String(pid), "/t"];
      if (signal === "SIGKILL") args.push("/f");
      spawnSync("taskkill", args, { stdio: "ignore" });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // Process may already have exited between timeout scheduling and signal delivery.
  }
}
