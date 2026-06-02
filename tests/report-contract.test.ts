import { describe, expect, it } from "vitest";
import { reportContractFailures } from "../src/report-contract.js";
import type { PatchReport } from "../src/types.js";

describe("report contract", () => {
  it("accepts summary counts that match report payload arrays", () => {
    expect(reportContractFailures(exampleReport())).toEqual([]);
  });

  it("rejects summary counts that drift from report payload arrays", () => {
    const report = exampleReport();
    report.summary.changedFileCount = 9;
    report.summary.additions = 99;
    report.summary.deletions = 88;
    report.summary.requiredCommandCount = 0;
    report.summary.failedCommandCount = 0;

    expect(reportContractFailures(report)).toEqual([
      "JSON report summary.changedFileCount does not match changedFiles.",
      "JSON report summary.additions does not match changedFiles.",
      "JSON report summary.deletions does not match changedFiles.",
      "JSON report summary.requiredCommandCount does not match commandPlan.",
      "JSON report summary.failedCommandCount does not match commandResults."
    ]);
  });
});

function exampleReport(): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: "2026-06-01T00:00:00.000Z",
    root: "/repo",
    summary: {
      status: "fail",
      riskScore: 80,
      confidenceScore: 20,
      changedFileCount: 1,
      additions: 4,
      deletions: 1,
      requiredCommandCount: 1,
      failedCommandCount: 1
    },
    changedFiles: [{ path: "src/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }],
    addedLines: 4,
    projectSignals: [],
    affectedPackages: [],
    dependencyChanges: [],
    packageScriptChanges: [],
    findings: [],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "Source changed.", ecosystem: "node", required: true }],
    commandResults: [{ id: "test", command: "npm test", exitCode: 1, durationMs: 1200, stdout: "", stderr: "failed" }]
  };
}
