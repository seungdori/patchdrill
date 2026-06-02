import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { PatchReport, PatchStatus, RiskFinding } from "./types.js";

export interface BaselineComparisonInput {
  summary: {
    status: PatchStatus;
    riskScore: number;
  };
  findings: RiskFinding[];
}

export function compareBaseline(root: string, baselinePath: string, current: BaselineComparisonInput): NonNullable<PatchReport["baseline"]> {
  const resolved = isAbsolute(baselinePath) ? baselinePath : resolve(root, baselinePath);
  if (!existsSync(resolved)) throw new Error(`PatchDrill baseline report not found: ${resolved}`);
  const baseline = readBaselineReport(resolved);
  const previousFindings = new Set((baseline.findings ?? []).map(findingFingerprint));
  const currentFindings = new Set(current.findings.map(findingFingerprint));
  const newFindingCount = [...currentFindings].filter((fingerprint) => !previousFindings.has(fingerprint)).length;
  const resolvedFindingCount = [...previousFindings].filter((fingerprint) => !currentFindings.has(fingerprint)).length;
  const unchangedFindingCount = [...currentFindings].filter((fingerprint) => previousFindings.has(fingerprint)).length;

  return {
    path: relative(root, resolved),
    ...(baseline.summary?.status !== undefined ? { previousStatus: baseline.summary.status } : {}),
    currentStatus: current.summary.status,
    ...(baseline.summary?.riskScore !== undefined ? { previousRiskScore: baseline.summary.riskScore } : {}),
    currentRiskScore: current.summary.riskScore,
    riskDelta: current.summary.riskScore - (baseline.summary?.riskScore ?? 0),
    newFindingCount,
    resolvedFindingCount,
    unchangedFindingCount
  };
}

// A saved baseline report is untrusted JSON; type it loosely so the missing-field
// guards above are honest rather than relying on an unsound `as PatchReport` cast.
interface BaselineReport {
  summary?: { status?: PatchStatus; riskScore?: number };
  findings?: RiskFinding[];
}

function readBaselineReport(path: string): BaselineReport {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BaselineReport;
  } catch (error) {
    throw new Error(`Failed to read PatchDrill baseline report ${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    });
  }
}

function findingFingerprint(finding: RiskFinding): string {
  return [finding.ruleId ?? "", finding.severity, finding.title, finding.file ?? "", finding.line ?? ""].join("\0");
}
