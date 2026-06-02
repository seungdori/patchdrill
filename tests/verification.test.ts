import { describe, expect, it } from "vitest";
import type { PatchReport } from "../src/types.js";
import { formatVerificationStatus, verificationExecutions, verificationSummary } from "../src/verification.js";

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
      failed: 2,
      timedOut: 1,
      missingRequired: 1,
      skippedOptional: 1,
      unplannedResults: 1
    });
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
