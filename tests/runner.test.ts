import { describe, expect, it } from "vitest";
import { runCommandPlan } from "../src/runner.js";

describe("runCommandPlan", () => {
  it("marks truncated command output and keeps the tail", async () => {
    const results = await runCommandPlan(
      [
        {
          id: "large-output",
          label: "Large output",
          command: "node -e \"process.stdout.write('x'.repeat(160) + 'TAIL')\"",
          reason: "Exercise bounded output capture.",
          ecosystem: "general",
          required: true
        }
      ],
      { cwd: process.cwd(), maxOutputChars: 90 }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.exitCode).toBe(0);
    expect(results[0]?.stdout.length).toBeLessThanOrEqual(90);
    expect(results[0]?.stdout).toContain("PatchDrill truncated output");
    expect(results[0]?.stdout.endsWith("TAIL")).toBe(true);
  });

  it("marks timed-out commands as failed", async () => {
    const results = await runCommandPlan(
      [
        {
          id: "slow-command",
          label: "Slow command",
          command: "node -e \"setTimeout(() => process.exit(0), 300)\"",
          reason: "Exercise command timeout handling.",
          ecosystem: "general",
          required: true
        }
      ],
      { cwd: process.cwd(), maxOutputChars: 200, commandTimeoutMs: 50 }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.exitCode).toBe(124);
    expect(results[0]?.timedOut).toBe(true);
    expect(results[0]?.stderr).toContain("PatchDrill command timed out");
  });

  it("force kills commands that ignore termination", async () => {
    const startedAt = Date.now();
    const results = await runCommandPlan(
      [
        {
          id: "stubborn-command",
          label: "Stubborn command",
          command: "node -e \"process.on('SIGTERM', () => {}); setTimeout(() => {}, 10000)\"",
          reason: "Exercise forced timeout cleanup.",
          ecosystem: "general",
          required: true
        }
      ],
      { cwd: process.cwd(), maxOutputChars: 200, commandTimeoutMs: 50 }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.exitCode).toBe(124);
    expect(results[0]?.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });
});
