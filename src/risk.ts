import type { ChangedFile, CommandResult, PatchStatus, RiskFinding } from "./types.js";

export interface RiskAssessment {
  riskScore: number;
  confidenceScore: number;
  status: PatchStatus;
  findings: RiskFinding[];
}

const SECRET_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)(id_rsa|id_dsa|id_ed25519)(\.pub)?$/,
  /(^|\/).*secret.*\.(json|ya?ml|txt)$/i,
  /(^|\/).*credential.*\.(json|ya?ml|txt)$/i
];

const HIGH_IMPACT_PATTERNS = [
  /(^|\/)(auth|authentication|authorization|session|oauth|jwt)(\/|\.|$)/i,
  /(^|\/)(payment|billing|invoice|checkout|stripe)(\/|\.|$)/i,
  /(^|\/)(migration|migrations|schema|prisma)(\/|\.|$)/i,
  /(^|\/)(security|crypto|permission|policy)(\/|\.|$)/i
];

const INFRA_PATTERNS = [
  /(^|\/)\.github\/workflows\//,
  /(^|\/)(Dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/,
  /\.(tf|tfvars)$/,
  /(^|\/)(k8s|kubernetes|helm|charts)\//
];

const LOCKFILES = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "composer.lock"
];

export function assessRisk(changedFiles: ChangedFile[], commandResults: CommandResult[]): RiskAssessment {
  const findings: RiskFinding[] = [];
  let risk = changedFiles.length === 0 ? 0 : 10;

  const totalAdditions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const changedSource = changedFiles.some((file) => isSourceFile(file.path));
  const changedTests = changedFiles.some((file) => isTestFile(file.path));

  for (const file of changedFiles) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(file.path))) {
      risk += 40;
      findings.push({
        severity: "critical",
        title: "Possible secret-bearing file changed",
        detail: "Files that commonly hold credentials should not be committed without explicit review.",
        file: file.path,
        remediation: "Move secrets to a secret manager and keep only templates or documented variable names in git."
      });
    }
    if (!isDocumentationFile(file.path) && HIGH_IMPACT_PATTERNS.some((pattern) => pattern.test(file.path))) {
      risk += 18;
      findings.push({
        severity: "high",
        title: "High-impact product area changed",
        detail: "Authentication, billing, migrations, or security changes need stronger regression proof.",
        file: file.path,
        remediation: "Add targeted tests and include manual verification notes in the PR."
      });
    }
    if (INFRA_PATTERNS.some((pattern) => pattern.test(file.path))) {
      risk += 14;
      findings.push({
        severity: "medium",
        title: "Infrastructure or CI behavior changed",
        detail: "Build, deployment, or workflow changes can alter release safety outside application tests.",
        file: file.path,
        remediation: "Review permissions, environment access, rollback behavior, and deployment triggers."
      });
    }
    if (LOCKFILES.some((lockfile) => file.path.endsWith(lockfile))) {
      risk += 12;
      findings.push({
        severity: "medium",
        title: "Dependency lockfile changed",
        detail: "Dependency graph changes can introduce supply-chain, licensing, or runtime regressions.",
        file: file.path,
        remediation: "Review direct and transitive dependency changes before merge."
      });
    }
    if (file.status === "deleted") {
      risk += 8;
      findings.push({
        severity: "low",
        title: "File deleted",
        detail: "Deleted files can break runtime imports, generated references, or deployment packaging.",
        file: file.path
      });
    }
    if (file.binary) {
      risk += 10;
      findings.push({
        severity: "medium",
        title: "Binary file changed",
        detail: "Binary changes are difficult to review from a normal code diff.",
        file: file.path,
        remediation: "Verify provenance and expected runtime use of the binary artifact."
      });
    }
  }

  if (totalAdditions + totalDeletions > 2000) {
    risk += 24;
    findings.push({
      severity: "high",
      title: "Large patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Large patches deserve split review or stronger test evidence.`,
      remediation: "Split unrelated changes or attach a clear verification report."
    });
  } else if (totalAdditions + totalDeletions > 500) {
    risk += 12;
    findings.push({
      severity: "medium",
      title: "Medium-sized patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Review should focus on changed behavior, not only file count.`
    });
  }

  if (changedSource && !changedTests) {
    risk += 16;
    findings.push({
      severity: "medium",
      title: "Source changed without test changes",
      detail: "No changed file looked like a test. Existing test suites may still cover this, but the PR should prove it.",
      remediation: "Add or update tests, or explain why existing tests cover the patch."
    });
  }

  for (const result of commandResults) {
    if (result.exitCode !== 0) {
      risk += 30;
      findings.push({
        severity: "critical",
        title: "Verification command failed",
        detail: `"${result.command}" exited with ${result.exitCode}.`,
        remediation: "Fix the failing command before merging."
      });
    }
  }

  const dedupedFindings = dedupeFindings(findings);
  const riskScore = clamp(risk, 0, 100);
  const confidenceScore = 100 - riskScore;
  const status: PatchStatus = commandResults.some((result) => result.exitCode !== 0)
    ? "fail"
    : riskScore >= 70
      ? "fail"
      : riskScore >= 35
        ? "warn"
        : "pass";

  return { riskScore, confidenceScore, status, findings: dedupedFindings };
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|cs|fs|swift|scala)$/.test(path);
}

function isDocumentationFile(path: string): boolean {
  return path.startsWith("docs/") || /\.(md|mdx|rst|adoc|txt)$/i.test(path);
}

function isTestFile(path: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(path) || /\.(test|spec)\.[a-z0-9]+$/i.test(path);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeFindings(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.title}:${finding.file ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
