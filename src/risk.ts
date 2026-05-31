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

const AGENT_CONTROL_FILE_PATTERNS = [
  /(^|\/)(AGENTS|CLAUDE|GEMINI|CURSOR)\.md$/i,
  /(^|\/)\.github\/copilot-instructions\.md$/i,
  /(^|\/)\.cursor\/rules\//i,
  /(^|\/)\.windsurfrules$/i,
  /(^|\/)\.claude\/(commands|settings)\//i
];

const MCP_CONFIG_PATTERNS = [
  /(^|\/)\.mcp\.json$/i,
  /(^|\/)mcp\.json$/i,
  /(^|\/)\.cursor\/mcp\.json$/i,
  /(^|\/)claude_desktop_config\.json$/i
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

const AGENT_TOOL_ABUSE_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+(\/|\$HOME|~|\*)/i,
  /\b(curl|wget)\b.+\|\s*(sh|bash)\b/i,
  /\bsudo\s+(rm|chmod|chown|dd|mkfs|shutdown|reboot)\b/i,
  /\bchmod\s+777\b/i,
  /\b(delete|wipe|destroy)\s+(all\s+)?(files|database|cloud\s+resources|system)\b/i
];

const WORKFLOW_PRIVILEGE_PATTERNS: Array<{ ruleId: string; severity: Severity; title: string; pattern: RegExp; remediation: string }> = [
  {
    ruleId: "workflow.pull-request-target",
    severity: "high",
    title: "pull_request_target trigger added",
    pattern: /^\s*pull_request_target\s*:/i,
    remediation: "Use pull_request unless the workflow is intentionally designed for untrusted fork safety."
  },
  {
    ruleId: "workflow.write-all",
    severity: "high",
    title: "Broad GitHub token write permissions added",
    pattern: /^\s*permissions\s*:\s*write-all\s*$/i,
    remediation: "Use least-privilege per-scope permissions instead of write-all."
  },
  {
    ruleId: "workflow.write-scope",
    severity: "medium",
    title: "GitHub token write scope added",
    pattern: /^\s*(actions|checks|contents|deployments|id-token|issues|packages|pull-requests|security-events)\s*:\s*write\s*$/i,
    remediation: "Confirm the workflow needs this exact write permission and cannot use read-only access."
  },
  {
    ruleId: "workflow.inherited-secrets",
    severity: "high",
    title: "Workflow secret inheritance added",
    pattern: /^\s*secrets\s*:\s*inherit\s*$/i,
    remediation: "Avoid inherited secrets in reusable workflows unless trust boundaries and callers are tightly controlled."
  }
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
    if (!isDocumentationFile(file.path) && !isTestFile(file.path) && HIGH_IMPACT_PATTERNS.some((pattern) => pattern.test(file.path))) {
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
    if (isAgentControlFile(file.path)) {
      risk += 18;
      findings.push({
        ruleId: "agent.control-file",
        severity: "high",
        title: "Agent instruction surface changed",
        detail: "Files consumed by AI coding agents can alter goals, tool choices, review behavior, or memory-like context.",
        file: file.path,
        remediation: "Review this file as executable agent policy. Keep untrusted examples and external content out of agent instruction surfaces.",
        tags: ["ai-safety", "agentic-ai", "owasp:ASI01", "owasp:ASI09"]
      });
    }
    if (isMcpConfigFile(file.path)) {
      risk += 30;
      findings.push({
        ruleId: "agent.mcp-config",
        severity: "critical",
        title: "MCP or agent tool configuration changed",
        detail: "MCP and agent tool configs can grant local tools, credentials, or network access to autonomous agents.",
        file: file.path,
        remediation: "Require owner review for tool allowlists, command arguments, environment variables, and credential sources.",
        tags: ["ai-safety", "mcp", "owasp:ASI02", "owasp:ASI03", "owasp:ASI04"]
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
    if (isRequirementsFile(file.path)) {
      risk += 12;
      findings.push({
        ruleId: "file.dependency-manifest",
        severity: "medium",
        title: "Dependency manifest changed",
        detail: "Dependency manifest changes can introduce supply-chain, licensing, or runtime regressions.",
        file: file.path,
        remediation: "Review direct dependency intent and ensure the lockfile or environment was updated consistently.",
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
        tags: ["ai-safety", "prompt-injection", "owasp:ASI01"]
      });
    }

    if ((isAgentVisibleFile(line.file) || isAgentControlFile(line.file)) && AGENT_TOOL_ABUSE_PATTERNS.some((pattern) => pattern.test(line.content))) {
      risk += 22;
      findings.push({
        ruleId: "agent.tool-abuse-instruction",
        severity: "high",
        title: "Agent tool-abuse instruction added",
        detail: "An agent-visible line appears to encourage destructive local commands, privilege changes, or remote shell execution.",
        file: line.file,
        line: line.line,
        remediation: "Move destructive examples behind explicit human-only documentation and keep them out of privileged agent instruction context.",
        tags: ["ai-safety", "tool-misuse", "owasp:ASI02", "owasp:ASI05"]
      });
    }

    if (line.file.startsWith(".github/workflows/")) {
      for (const workflowPattern of WORKFLOW_PRIVILEGE_PATTERNS) {
        if (!workflowPattern.pattern.test(line.content)) continue;
        risk += severityWeights[workflowPattern.severity];
        findings.push({
          ruleId: workflowPattern.ruleId,
          severity: workflowPattern.severity,
          title: workflowPattern.title,
          detail: "A newly added workflow line changes GitHub Actions trust or token privilege.",
          file: line.file,
          line: line.line,
          remediation: workflowPattern.remediation,
          tags: ["ci", "github-actions", "supply-chain"]
        });
        break;
      }
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

function isAgentControlFile(path: string): boolean {
  return AGENT_CONTROL_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

function isMcpConfigFile(path: string): boolean {
  return MCP_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

function isTestFile(path: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(path) || /\.(test|spec)\.[a-z0-9]+$/i.test(path);
}

function isRequirementsFile(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? path;
  return /^requirements([-.].*)?\.txt$/i.test(fileName) || /^.*[-.]requirements\.txt$/i.test(fileName);
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
