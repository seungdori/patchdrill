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
});
