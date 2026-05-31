import { matchesPolicyRule } from "./policy.js";
import type { AddedLine, ChangedFile, CommandResult, PatchPolicy, PatchStatus, RiskFinding, Severity } from "./types.js";

export interface RiskAssessment {
  riskScore: number;
  confidenceScore: number;
  status: PatchStatus;
  findings: RiskFinding[];
}

export interface RiskOptions {
  addedLines?: AddedLine[];
  policy?: PatchPolicy;
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

const ADDED_SECRET_PATTERNS: Array<{ ruleId: string; title: string; pattern: RegExp; remediation: string }> = [
  {
    ruleId: "secret.private-key",
    title: "Private key material added",
    pattern: /-----BEGIN (RSA|DSA|EC|OPENSSH|PRIVATE) PRIVATE KEY-----/,
    remediation: "Revoke the key, remove it from git history, and replace it with a secret-manager reference."
  },
  {
    ruleId: "secret.aws-access-key",
    title: "AWS access key-looking value added",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    remediation: "Revoke the credential and move access through workload identity or a secret manager."
  },
  {
    ruleId: "secret.github-token",
    title: "GitHub token-looking value added",
    pattern: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/,
    remediation: "Revoke the token and use GitHub Actions secrets or fine-grained tokens outside the repository."
  },
  {
    ruleId: "secret.openai-key",
    title: "OpenAI API key-looking value added",
    pattern: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/,
    remediation: "Revoke the key and inject it through runtime secret configuration."
  },
  {
    ruleId: "secret.generic-assignment",
    title: "Secret-looking assignment added",
    pattern: /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    remediation: "Keep only placeholder names in source and load sensitive values from environment or a secret manager."
  }
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /reveal\s+(the\s+)?(system\s+prompt|secrets?|api\s+keys?|tokens?)/i,
  /exfiltrate\s+(secrets?|tokens?|credentials?)/i,
  /print\s+(all\s+)?(environment\s+variables|secrets?|tokens?)/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i
];

const severityWeights: Record<Severity, number> = {
  info: 1,
  low: 4,
  medium: 10,
  high: 18,
  critical: 35
};

export function assessRisk(changedFiles: ChangedFile[], commandResults: CommandResult[], options: RiskOptions = {}): RiskAssessment {
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
        ruleId: "file.secret-bearing",
        severity: "critical",
        title: "Possible secret-bearing file changed",
        detail: "Files that commonly hold credentials should not be committed without explicit review.",
        file: file.path,
        remediation: "Move secrets to a secret manager and keep only templates or documented variable names in git.",
        tags: ["security", "secrets"]
      });
    }
    if (!isDocumentationFile(file.path) && HIGH_IMPACT_PATTERNS.some((pattern) => pattern.test(file.path))) {
      risk += 18;
      findings.push({
        ruleId: "file.high-impact-area",
        severity: "high",
        title: "High-impact product area changed",
        detail: "Authentication, billing, migrations, or security changes need stronger regression proof.",
        file: file.path,
        remediation: "Add targeted tests and include manual verification notes in the PR.",
        tags: ["review", "regression"]
      });
    }
    if (INFRA_PATTERNS.some((pattern) => pattern.test(file.path))) {
      risk += 14;
      findings.push({
        ruleId: "file.infrastructure",
        severity: "medium",
        title: "Infrastructure or CI behavior changed",
        detail: "Build, deployment, or workflow changes can alter release safety outside application tests.",
        file: file.path,
        remediation: "Review permissions, environment access, rollback behavior, and deployment triggers.",
        tags: ["ci", "deployment"]
      });
    }
    if (LOCKFILES.some((lockfile) => file.path.endsWith(lockfile))) {
      risk += 12;
      findings.push({
        ruleId: "file.lockfile",
        severity: "medium",
        title: "Dependency lockfile changed",
        detail: "Dependency graph changes can introduce supply-chain, licensing, or runtime regressions.",
        file: file.path,
        remediation: "Review direct and transitive dependency changes before merge.",
        tags: ["dependencies", "supply-chain"]
      });
    }
    if (file.status === "deleted") {
      risk += 8;
      findings.push({
        ruleId: "file.deleted",
        severity: "low",
        title: "File deleted",
        detail: "Deleted files can break runtime imports, generated references, or deployment packaging.",
        file: file.path
      });
    }
    if (file.binary) {
      risk += 10;
      findings.push({
        ruleId: "file.binary",
        severity: "medium",
        title: "Binary file changed",
        detail: "Binary changes are difficult to review from a normal code diff.",
        file: file.path,
        remediation: "Verify provenance and expected runtime use of the binary artifact.",
        tags: ["review"]
      });
    }
  }

  for (const line of options.addedLines ?? []) {
    for (const secretPattern of ADDED_SECRET_PATTERNS) {
      if (!secretPattern.pattern.test(line.content)) continue;
      risk += 45;
      findings.push({
        ruleId: secretPattern.ruleId,
        severity: "critical",
        title: secretPattern.title,
        detail: "A newly added line matches a high-confidence credential pattern. The secret value is intentionally omitted from this report.",
        file: line.file,
        line: line.line,
        remediation: secretPattern.remediation,
        tags: ["security", "secrets"]
      });
      break;
    }

    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line.content))) {
      const agentVisible = isAgentVisibleFile(line.file);
      risk += agentVisible ? 24 : 12;
      findings.push({
        ruleId: "agent.prompt-injection",
        severity: agentVisible ? "high" : "medium",
        title: "Prompt-injection instruction added",
        detail: agentVisible
          ? "A newly added agent-visible line appears to instruct AI tools to ignore policy or reveal sensitive information."
          : "A newly added line looks like a prompt-injection payload. Review before feeding this diff to an AI agent.",
        file: line.file,
        line: line.line,
        remediation: "Keep untrusted prompt-like content out of agent instruction files and avoid passing it to privileged AI review contexts.",
        tags: ["ai-safety", "prompt-injection"]
      });
    }
  }

  for (const rule of options.policy?.rules ?? []) {
    for (const file of changedFiles) {
      if (!matchesPolicyRule(file.path, rule)) continue;
      risk += rule.weight ?? severityWeights[rule.severity];
      findings.push({
        ruleId: `policy.${rule.id}`,
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail ?? `Policy rule "${rule.id}" matched this path.`,
        file: file.path,
        ...(rule.remediation ? { remediation: rule.remediation } : {}),
        ...(rule.tags ? { tags: rule.tags } : {})
      });
    }
  }

  if (totalAdditions + totalDeletions > 2000) {
    risk += 24;
    findings.push({
      ruleId: "patch.large",
      severity: "high",
      title: "Large patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Large patches deserve split review or stronger test evidence.`,
      remediation: "Split unrelated changes or attach a clear verification report."
    });
  } else if (totalAdditions + totalDeletions > 500) {
    risk += 12;
    findings.push({
      ruleId: "patch.medium",
      severity: "medium",
      title: "Medium-sized patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Review should focus on changed behavior, not only file count.`
    });
  }

  if (changedSource && !changedTests) {
    risk += 16;
    findings.push({
      ruleId: "test.source-without-test-change",
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
        ruleId: "command.failed",
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

function isAgentVisibleFile(path: string): boolean {
  return (
    /(^|\/)(AGENTS|CLAUDE|GEMINI|CURSOR|README|CONTRIBUTING)\.md$/i.test(path) ||
    path.startsWith(".github/ISSUE_TEMPLATE/") ||
    path.startsWith(".github/PULL_REQUEST_TEMPLATE") ||
    /\.(md|mdx|txt)$/i.test(path)
  );
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
    const key = `${finding.severity}:${finding.title}:${finding.file ?? ""}:${finding.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
