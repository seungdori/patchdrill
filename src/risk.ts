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
  workflowFiles?: Array<{ file: string; content: string }>;
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

const WORKFLOW_ADDED_LINE_RULES: Array<{
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  matches: (content: string) => boolean;
  remediation: string;
  tags: string[];
}> = [
  {
    ruleId: "workflow.pull-request-target",
    severity: "high",
    title: "pull_request_target trigger added",
    detail: "A newly added workflow line changes GitHub Actions trust boundaries.",
    matches: (content) => /^\s*pull_request_target\s*:/i.test(content),
    remediation: "Use pull_request unless the workflow is intentionally designed for untrusted fork safety.",
    tags: ["ci", "github-actions", "trust-boundary"]
  },
  {
    ruleId: "workflow.write-all",
    severity: "high",
    title: "Broad GitHub token write permissions added",
    detail: "A newly added workflow line changes GitHub token privilege.",
    matches: (content) => /^\s*permissions\s*:\s*write-all\s*$/i.test(content),
    remediation: "Use least-privilege per-scope permissions instead of write-all.",
    tags: ["ci", "github-actions", "supply-chain"]
  },
  {
    ruleId: "workflow.write-scope",
    severity: "medium",
    title: "GitHub token write scope added",
    detail: "A newly added workflow line grants GitHub token write access.",
    matches: (content) => /^\s*(actions|checks|contents|deployments|id-token|issues|packages|pull-requests|security-events)\s*:\s*write\s*$/i.test(content),
    remediation: "Confirm the workflow needs this exact write permission and cannot use read-only access.",
    tags: ["ci", "github-actions", "supply-chain"]
  },
  {
    ruleId: "workflow.inherited-secrets",
    severity: "high",
    title: "Workflow secret inheritance added",
    detail: "A newly added workflow line expands secret exposure across workflow boundaries.",
    matches: (content) => /^\s*secrets\s*:\s*inherit\s*$/i.test(content),
    remediation: "Avoid inherited secrets in reusable workflows unless trust boundaries and callers are tightly controlled.",
    tags: ["ci", "github-actions", "secrets"]
  },
  {
    ruleId: "workflow.unpinned-action",
    severity: "medium",
    title: "Unpinned GitHub Action reference added",
    detail: "A newly added workflow action uses a mutable or missing ref instead of a full commit SHA.",
    matches: workflowUsesUnpinnedAction,
    remediation: "Pin third-party and reusable actions to reviewed full-length commit SHAs, then update intentionally.",
    tags: ["ci", "github-actions", "supply-chain"]
  },
  {
    ruleId: "workflow.remote-script-pipe",
    severity: "high",
    title: "Remote script pipe added to workflow",
    detail: "A newly added workflow line pipes a remote download directly into an interpreter.",
    matches: (content) => /\b(curl|wget)\b.+\|\s*(sudo\s+)?(sh|bash|zsh|python|node)\b/i.test(content),
    remediation: "Download artifacts with checksum verification or use a pinned, reviewed action instead of piping remote code to a shell.",
    tags: ["ci", "github-actions", "supply-chain"]
  },
  {
    ruleId: "workflow.untrusted-pr-context",
    severity: "high",
    title: "Untrusted pull request context added to workflow",
    detail: "A newly added workflow line interpolates attacker-controlled pull request metadata.",
    matches: (content) => /\${{\s*github\.event\.pull_request\.(title|body|head\.ref|head\.label|head\.repo\.full_name)\s*}}/i.test(content),
    remediation: "Pass untrusted PR metadata through environment variables and quote it carefully, or avoid using it in shell commands.",
    tags: ["ci", "github-actions", "injection"]
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
  const changedSourceFiles = changedFiles.filter((file) => isSourceFile(file.path) && !isTestFile(file.path));
  const changedTestPaths = new Set(changedFiles.filter((file) => isTestFile(file.path)).map((file) => file.path));

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
    if (file.binary && isBinaryBunLockfile(file.path)) {
      risk += 14;
      findings.push({
        ruleId: "file.bun-lockb",
        severity: "medium",
        title: "Binary Bun lockfile changed",
        detail: "Legacy bun.lockb files are binary, so package-level dependency changes cannot be summarized from a normal diff.",
        file: file.path,
        remediation: "Prefer the text bun.lock format. Migrate with `bun install --save-text-lockfile --frozen-lockfile --lockfile-only`, verify the result, then remove bun.lockb.",
        tags: ["dependencies", "supply-chain", "bun"]
      });
    }
    if (isDependencyManifest(file.path)) {
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
    if (file.binary && !isBinaryBunLockfile(file.path)) {
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
      for (const workflowRule of WORKFLOW_ADDED_LINE_RULES) {
        if (!workflowRule.matches(line.content)) continue;
        risk += severityWeights[workflowRule.severity];
        findings.push({
          ruleId: workflowRule.ruleId,
          severity: workflowRule.severity,
          title: workflowRule.title,
          detail: workflowRule.detail,
          file: line.file,
          line: line.line,
          remediation: workflowRule.remediation,
          tags: workflowRule.tags
        });
      }
    }
  }

  for (const finding of workflowContextFindings(options.addedLines ?? [], options.workflowFiles ?? [])) {
    risk += severityWeights[finding.severity];
    findings.push(finding);
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

  const untestedSourceFiles = changedSourceFiles.filter((file) => !hasMatchingChangedTest(file.path, changedTestPaths));
  if (untestedSourceFiles.length > 0) {
    const examples = untestedSourceFiles.slice(0, 5).map((file) => file.path);
    risk += 16;
    findings.push({
      ruleId: "test.source-without-test-change",
      severity: "medium",
      title: "Source changed without matching test changes",
      detail: `No changed test file matched ${examples.join(", ")}${untestedSourceFiles.length > examples.length ? ", ..." : ""}. Existing suites may still cover this, but the PR should prove it.`,
      remediation: `Add or update nearby tests such as ${testCandidates(untestedSourceFiles[0]?.path ?? "").slice(0, 3).join(", ")}, or explain why existing tests cover the patch.`
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

function hasMatchingChangedTest(sourcePath: string, changedTestPaths: Set<string>): boolean {
  const candidates = testCandidates(sourcePath);
  return candidates.some((candidate) => changedTestPaths.has(candidate));
}

function testCandidates(sourcePath: string): string[] {
  const parsed = parsePath(sourcePath);
  if (!parsed) return [];
  const testNames = [
    `${parsed.name}.test${parsed.extension}`,
    `${parsed.name}.spec${parsed.extension}`,
    `test_${parsed.name}${parsed.extension}`,
    `${parsed.name}_test${parsed.extension}`,
    `${parsed.name}_spec${parsed.extension}`
  ];
  const candidates = new Set<string>();
  for (const testName of testNames) {
    candidates.add(joinPath(parsed.directory, testName));
    candidates.add(joinPath(parsed.directory, "__tests__", testName));
    candidates.add(joinPath("tests", parsed.directory, testName));
    candidates.add(joinPath("test", parsed.directory, testName));
    candidates.add(joinPath("spec", parsed.directory, testName));
    candidates.add(joinPath("tests", testName));
    candidates.add(joinPath("test", testName));
    candidates.add(joinPath("spec", testName));
    if (parsed.directory.startsWith("src/")) {
      const withoutSrc = parsed.directory.slice(4);
      candidates.add(joinPath("tests", withoutSrc, testName));
      candidates.add(joinPath("test", withoutSrc, testName));
      candidates.add(joinPath("spec", withoutSrc, testName));
    }
    if (parsed.directory.startsWith("app/")) {
      candidates.add(joinPath("tests", parsed.directory, testName));
      candidates.add(joinPath("test", parsed.directory, testName));
    }
  }
  return [...candidates];
}

function parsePath(path: string): { directory: string; name: string; extension: string } | undefined {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash) : "";
  const fileName = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return {
    directory,
    name: fileName.slice(0, dot),
    extension: fileName.slice(dot)
  };
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

function isDependencyManifest(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? path;
  return (
    /^requirements([-.].*)?\.txt$/i.test(fileName) ||
    /^.*[-.]requirements\.txt$/i.test(fileName) ||
    /\.(csproj|fsproj|vbproj)$/i.test(fileName) ||
    fileName === "Directory.Packages.props"
  );
}

function isBinaryBunLockfile(path: string): boolean {
  return path.split("/").at(-1) === "bun.lockb";
}

function workflowUsesUnpinnedAction(content: string): boolean {
  const match = content.match(/^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/i);
  if (!match?.[1]) return false;
  const action = match[1];
  if (action.startsWith("./") || action.startsWith("docker://")) return false;
  const refSeparator = action.lastIndexOf("@");
  if (refSeparator < 0) return true;
  const ref = action.slice(refSeparator + 1);
  return !/^[a-f0-9]{40}$/i.test(ref);
}

function workflowContextFindings(addedLines: AddedLine[], workflowFiles: Array<{ file: string; content: string }>): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const workflowLinesByFile = new Map<string, AddedLine[]>();
  for (const line of addedLines) {
    if (!line.file.startsWith(".github/workflows/")) continue;
    const lines = workflowLinesByFile.get(line.file) ?? [];
    lines.push(line);
    workflowLinesByFile.set(line.file, lines);
  }

  for (const [file, lines] of workflowLinesByFile) {
    const finding = workflowHeadCheckoutFinding(file, lines, "New workflow lines combine the privileged pull_request_target event with checkout of attacker-controlled pull request code.");
    if (finding) findings.push(finding);
  }

  for (const workflowFile of workflowFiles) {
    const lines = workflowFile.content.split(/\r?\n/).map((content, index) => ({ file: workflowFile.file, line: index + 1, content }));
    const finding = workflowHeadCheckoutFinding(
      workflowFile.file,
      lines,
      "The changed workflow combines the privileged pull_request_target event with checkout of attacker-controlled pull request code."
    );
    if (finding) findings.push(finding);
  }

  return dedupeFindings(findings);
}

function workflowHeadCheckoutFinding(file: string, lines: AddedLine[], detail: string): RiskFinding | undefined {
  if (!lines.some((line) => /^\s*pull_request_target\s*:/i.test(line.content))) return undefined;
  if (!lines.some((line) => workflowUsesCheckoutAction(line.content))) return undefined;
  const headCheckoutLine = lines.find((line) => workflowUsesPullRequestHeadContext(line.content));
  if (!headCheckoutLine) return undefined;
  return {
    ruleId: "workflow.pull-request-target-head-checkout",
    severity: "critical",
    title: "pull_request_target checks out pull request head",
    detail,
    file,
    line: headCheckoutLine.line,
    remediation: "Use pull_request for untrusted code, or keep pull_request_target jobs on trusted base code with least-privilege permissions.",
    tags: ["ci", "github-actions", "supply-chain", "trust-boundary"]
  };
}

function workflowUsesCheckoutAction(content: string): boolean {
  return /^\s*(?:-\s*)?uses\s*:\s*['"]?actions\/checkout@[^'"\s#]+['"]?\s*(?:#.*)?$/i.test(content);
}

function workflowUsesPullRequestHeadContext(content: string): boolean {
  return /\${{\s*(github\.event\.pull_request\.head\.(sha|ref|repo\.full_name)|github\.head_ref)\s*}}/i.test(content);
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
