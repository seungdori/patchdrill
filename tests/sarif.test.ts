import { describe, expect, it } from "vitest";
import { renderSarif } from "../src/report.js";
import type { PatchReport } from "../src/types.js";

describe("renderSarif", () => {
  it("renders SARIF results for file findings", () => {
    const report: PatchReport = {
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      summary: {
        status: "warn",
        riskScore: 50,
        confidenceScore: 50,
        changedFileCount: 1,
        additions: 1,
        deletions: 0,
        requiredCommandCount: 0,
        failedCommandCount: 0
      },
      changedFiles: [{ path: "src/auth.ts", status: "modified", additions: 1, deletions: 0, binary: false }],
      addedLines: 1,
      projectSignals: [],
      affectedPackages: [],
      dependencyChanges: [],
      packageScriptChanges: [],
      findings: [
        {
          ruleId: "agent.prompt-injection",
          severity: "high",
          title: "Prompt-injection instruction added",
          detail: "Untrusted instruction.",
          file: "README.md",
          line: 12,
          tags: ["ai-safety"]
        }
      ],
      commandPlan: [],
      commandResults: []
    };

    const sarif = JSON.parse(renderSarif(report)) as {
      runs: Array<{
        results: Array<{
          ruleId: string;
          level: string;
          partialFingerprints: Record<string, string>;
          locations: Array<{ physicalLocation: { region: { startLine: number } } }>;
        }>;
      }>;
    };

    expect(sarif.runs[0]?.results[0]?.ruleId).toBe("agent.prompt-injection");
    expect(sarif.runs[0]?.results[0]?.level).toBe("error");
    expect(sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.region.startLine).toBe(12);
    expect(sarif.runs[0]?.results[0]?.partialFingerprints.patchdrillFinding).toMatch(/^[a-f0-9]{64}$/);
  });
});
