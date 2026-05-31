import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareBaseline } from "../src/baseline.js";
import type { PatchReport } from "../src/types.js";

const tempDirs: string[] = [];

describe("compareBaseline", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("compares risk and finding fingerprints against a previous report", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-baseline-"));
    tempDirs.push(root);
    const previous: Pick<PatchReport, "summary" | "findings"> = {
      summary: {
        status: "warn",
        riskScore: 40,
        confidenceScore: 60,
        changedFileCount: 1,
        additions: 10,
        deletions: 2,
        requiredCommandCount: 1,
        failedCommandCount: 0
      },
      findings: [
        { ruleId: "risk.auth", severity: "high", title: "Auth changed", detail: "Auth changed.", file: "src/auth.ts", line: 1 },
        { ruleId: "risk.docs", severity: "low", title: "Docs changed", detail: "Docs changed.", file: "README.md" }
      ]
    };
    writeFileSync(join(root, "baseline.json"), JSON.stringify(previous), "utf8");

    const comparison = compareBaseline(root, "baseline.json", {
      summary: { status: "fail", riskScore: 55 },
      findings: [
        { ruleId: "risk.auth", severity: "high", title: "Auth changed", detail: "Auth changed.", file: "src/auth.ts", line: 1 },
        { ruleId: "risk.secret", severity: "critical", title: "Secret changed", detail: "Secret changed.", file: "src/key.ts" }
      ]
    });

    expect(comparison).toEqual({
      path: "baseline.json",
      previousStatus: "warn",
      currentStatus: "fail",
      previousRiskScore: 40,
      currentRiskScore: 55,
      riskDelta: 15,
      newFindingCount: 1,
      resolvedFindingCount: 1,
      unchangedFindingCount: 1
    });
  });
});
