import { describe, expect, it } from "vitest";
import type { PatchReport } from "../src/types.js";
import { formatVerificationStatus, reportVerification, verificationExecutions, verificationSummary } from "../src/verification.js";

describe("verification status", () => {
  it("summarizes plan-to-result execution states", () => {
    const report = exampleReport();

    const executions = verificationExecutions(report);
    const summary = verificationSummary(report);

    expect(executions.map((execution) => [execution.id, execution.status, formatVerificationStatus(execution)])).toEqual([
      ["unit", "passed", "passed"],
      ["integration", "not-run", "not run"],
      ["lint", "skipped-optional", "skipped optional"],
      ["smoke", "timed-out", "timed out (124)"],
      ["orphan", "failed", "unplanned failed (2)"]
    ]);
    expect(summary).toEqual({
      plannedRequired: 3,
      plannedOptional: 1,
      run: 3,
      passed: 1,
      failed: 1,
      timedOut: 1,
      missingRequired: 1,
      skippedOptional: 1,
      unplannedResults: 1
    });
    // passed + failed + timedOut must partition the runs (a timed-out command is
    // not also counted as failed).
    expect(summary.passed + summary.failed + summary.timedOut).toBe(summary.run);
  });

  it("renders report verification metadata without duplicating command output", () => {
    const verification = reportVerification(exampleReport());

    expect(verification.summary).toMatchObject({ run: 3, failed: 1, timedOut: 1, missingRequired: 1, skippedOptional: 1 });
    expect(verification.commands.find((command) => command.id === "unit")).toEqual({
      id: "unit",
      label: "Unit",
      command: "npm test",
      reason: "Unit coverage.",
      ecosystem: "node",
      required: true,
      planned: true,
      status: "passed",
      exitCode: 0,
      durationMs: 100
    });
    for (const command of verification.commands) {
      expect(command).not.toHaveProperty("result");
      expect(command).not.toHaveProperty("stdout");
      expect(command).not.toHaveProperty("stderr");
    }
  });
});

function exampleReport(): Pick<PatchReport, "commandPlan" | "commandResults"> {
  return {
    commandPlan: [
      { id: "unit", label: "Unit", command: "npm test", reason: "Unit coverage.", ecosystem: "node", required: true },
      { id: "integration", label: "Integration", command: "npm run test:integration", reason: "Integration coverage.", ecosystem: "node", required: true },
      { id: "lint", label: "Lint", command: "npm run lint", reason: "Linting.", ecosystem: "node", required: false },
      { id: "smoke", label: "Smoke", command: "npm run smoke", reason: "Smoke coverage.", ecosystem: "node", required: true }
    ],
    commandResults: [
      { id: "unit", command: "npm test", exitCode: 0, durationMs: 100, stdout: "ok", stderr: "" },
      { id: "smoke", command: "npm run smoke", exitCode: 124, durationMs: 5000, stdout: "", stderr: "timeout", timedOut: true },
      { id: "orphan", command: "npm run orphan", exitCode: 2, durationMs: 50, stdout: "", stderr: "failed" }
    ]
  };
}
