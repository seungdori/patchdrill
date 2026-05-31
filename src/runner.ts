import { spawn } from "node:child_process";
import type { CommandPlan, CommandResult } from "./types.js";

export interface RunOptions {
  cwd: string;
  maxOutputChars: number;
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
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: process.env.CI ?? "1" }
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString("utf8"), options.maxOutputChars);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString("utf8"), options.maxOutputChars);
    });
    child.on("close", (exitCode) => {
      resolve({
        id,
        command,
        exitCode: exitCode ?? 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
    child.on("error", (error) => {
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
  const combined = current + next;
  if (combined.length <= maxChars) return combined;
  return combined.slice(combined.length - maxChars);
}
