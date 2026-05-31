import { describe, expect, it } from "vitest";
import { renderMarkdown, shouldFail } from "../src/report.js";
import type { PatchReport } from "../src/types.js";

describe("report", () => {
  it("renders Markdown and respects fail thresholds", () => {
    const report: PatchReport = {
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      summary: {
        status: "warn",
        riskScore: 40,
        confidenceScore: 60,
        changedFileCount: 1,
        additions: 5,
        deletions: 1,
        requiredCommandCount: 1,
        failedCommandCount: 0
      },
      changedFiles: [{ path: "src/auth.ts", status: "modified", additions: 5, deletions: 1, binary: false }],
      addedLines: 5,
      projectSignals: [{ ecosystem: "node", manifestPath: "package.json", packageManager: "npm" }],
      affectedPackages: [],
      dependencyChanges: [],
      findings: [
        {
          ruleId: "file.high-impact-area",
          severity: "high",
          title: "High-impact product area changed",
          detail: "Auth changed.",
          file: "src/auth.ts"
        }
      ],
      commandPlan: [
        {
          id: "node-test",
          label: "Node test",
          command: "npm run test",
          reason: "Tests exist.",
          ecosystem: "node",
          required: true
        }
      ],
      commandResults: []
    };

    expect(renderMarkdown(report)).toContain("PatchDrill Report");
    expect(renderMarkdown(report)).toContain("file.high-impact-area");
    expect(shouldFail(report, { failOn: "critical", maxRisk: 100 })).toBe(false);
    expect(shouldFail(report, { failOn: "high", maxRisk: 100 })).toBe(true);
    expect(shouldFail(report, { failOn: "critical", maxRisk: 30 })).toBe(true);
    expect(
      shouldFail(
        {
          ...report,
          baseline: {
            path: "baseline.json",
            previousStatus: "pass",
            currentStatus: "warn",
            previousRiskScore: 10,
            currentRiskScore: 40,
            riskDelta: 30,
            newFindingCount: 1,
            resolvedFindingCount: 0,
            unchangedFindingCount: 0
          }
        },
        { failOn: "critical", maxRisk: 100, maxRiskDelta: 0 }
      )
    ).toBe(true);
  });
});
