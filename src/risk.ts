import { matchesPolicyRule } from "./policy.js";
import type { AddedLine, ChangedFile, CommandPlan, CommandResult, DependencyChange, PackageScriptChange, PatchPolicy, PatchStatus, RiskFinding, Severity } from "./types.js";

export interface RiskAssessment {
  riskScore: number;
  confidenceScore: number;
  status: PatchStatus;
  findings: RiskFinding[];
}

export interface RiskOptions {
  addedLines?: AddedLine[];
  commandPlan?: CommandPlan[];
  dependencyChanges?: DependencyChange[];
  workflowFiles?: { file: string; content: string }[];
  packageScriptChanges?: PackageScriptChange[];
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
  "uv.lock",
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

const ADDED_SECRET_PATTERNS: { ruleId: string; title: string; pattern: RegExp; remediation: string }[] = [
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
    // Modern OpenAI keys use a long base64url body (which can contain "-"/"_").
    // Distinguish them from kebab-case slugs/CSS classes (e.g.
    // "sk-button-primary-large-rounded") by requiring a long body that contains
    // both an uppercase letter and a digit — real keys have both, lowercase
    // hyphenated slugs do not.
    title: "OpenAI API key-looking value added",
    pattern: /\bsk-(proj-)?(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{40,}\b/,
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
  // Match any single rm flag cluster containing both recursive and force flags,
  // in either order (-rf, -fr, -Rf, -rfv, ...), targeting a dangerous root.
  /\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\s+(\/|\$HOME|~|\*)/i,
  /\b(curl|wget)\b.+\|\s*(sh|bash)\b/i,
  /\bsudo\s+(rm|chmod|chown|dd|mkfs|shutdown|reboot)\b/i,
  /\bchmod\s+777\b/i,
  /\b(delete|wipe|destroy)\s+(all\s+)?(files|database|cloud\s+resources|system)\b/i
];

const PACKAGE_LIFECYCLE_SCRIPTS = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
  "publish",
  "postpublish"
]);

const VERIFICATION_SCRIPT_NAMES = new Set([
  "test",
  "test:unit",
  "unit",
  "check",
  "typecheck",
  "check:types",
  "types",
  "lint",
  "build",
  "verify"
]);

const WORKFLOW_ADDED_LINE_RULES: {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  matches: (content: string) => boolean;
  remediation: string;
  tags: string[];
}[] = [
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
    ruleId: "workflow.mutable-docker-action",
    severity: "medium",
    title: "Mutable Docker action image added",
    detail: "A newly added workflow action uses a Docker image tag or implicit latest image instead of an immutable digest.",
    matches: workflowUsesMutableDockerAction,
    remediation: "Pin docker:// action images to a reviewed sha256 digest instead of a mutable tag.",
    tags: ["ci", "github-actions", "supply-chain", "docker"]
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

const DEPENDENCY_PROOF_RULES: {
  ecosystem: string;
  manifest: (path: string) => boolean;
  lockfile: (path: string) => boolean;
  expectedLockfiles: string;
}[] = [
  {
    ecosystem: "Node",
    manifest: (path) => baseName(path) === "package.json",
    lockfile: (path) => ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].includes(baseName(path)),
    expectedLockfiles: "package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lock"
  },
  {
    ecosystem: "Python",
    manifest: (path) => baseName(path) === "pyproject.toml" || isRequirementsFileName(baseName(path)),
    lockfile: (path) => ["poetry.lock", "uv.lock", "Pipfile.lock"].includes(baseName(path)),
    expectedLockfiles: "poetry.lock, uv.lock, or Pipfile.lock"
  },
  {
    ecosystem: "Rust",
    manifest: (path) => baseName(path) === "Cargo.toml",
    lockfile: (path) => baseName(path) === "Cargo.lock",
    expectedLockfiles: "Cargo.lock"
  },
  {
    ecosystem: "Go",
    manifest: (path) => baseName(path) === "go.mod",
    lockfile: (path) => baseName(path) === "go.sum",
    expectedLockfiles: "go.sum"
  },
  {
    ecosystem: "Ruby",
    manifest: (path) => baseName(path) === "Gemfile",
    lockfile: (path) => baseName(path) === "Gemfile.lock",
    expectedLockfiles: "Gemfile.lock"
  },
  {
    ecosystem: "PHP",
    manifest: (path) => baseName(path) === "composer.json",
    lockfile: (path) => baseName(path) === "composer.lock",
    expectedLockfiles: "composer.lock"
  }
];

const severityWeights: Record<Severity, number> = {
  info: 1,
  low: 4,
  medium: 10,
  high: 18,
  critical: 35
};

class RiskAccumulator {
  private score = 0;
  private readonly values: RiskFinding[] = [];
  private readonly seen = new Set<string>();

  // Deduplicate on add so the score only ever counts findings the report
  // actually displays — the EXPLAINABLE promise requires the score to be
  // reconstructable from the visible findings.
  add(weight: number, finding: RiskFinding): void {
    const key = findingKey(finding);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.score += weight;
    this.values.push(finding);
  }

  addWeighted(finding: RiskFinding): void {
    this.add(severityWeights[finding.severity], finding);
  }

  get risk(): number {
    return this.score;
  }

  get findings(): RiskFinding[] {
    return this.values;
  }
}

export function assessRisk(changedFiles: ChangedFile[], commandResults: CommandResult[], options: RiskOptions = {}): RiskAssessment {
  const accumulator = new RiskAccumulator();

  if (changedFiles.length > 0) {
    accumulator.add(10, {
      ruleId: "patch.changed-files",
      severity: "info",
      title: "Patch changes repository files",
      detail: `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} require review and verification evidence.`,
      remediation: "Review the changed files and run the inferred verification plan before merge.",
      tags: ["review"]
    });
  }

  const totalAdditions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const changedSourceFiles = changedFiles.filter(
    (file) => isSourceFile(file.path) && !isTestFile(file.path) && !isDeclarationFile(file.path)
  );
  const changedTestPaths = new Set(changedFiles.filter((file) => isTestFile(file.path)).map((file) => file.path));

  for (const file of changedFiles) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(file.path))) {
      accumulator.add(40, {
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
      accumulator.add(18, {
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
      accumulator.add(18, {
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
      accumulator.add(30, {
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
      accumulator.add(14, {
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
      accumulator.add(12, {
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
      accumulator.add(14, {
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
      accumulator.add(12, {
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
      accumulator.add(8, {
        ruleId: "file.deleted",
        severity: "low",
        title: "File deleted",
        detail: "Deleted files can break runtime imports, generated references, or deployment packaging.",
        file: file.path
      });
    }
    if (file.binary && !isBinaryBunLockfile(file.path)) {
      accumulator.add(10, {
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
      accumulator.add(45, {
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
      accumulator.add(agentVisible ? 24 : 12, {
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
      accumulator.add(22, {
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
        accumulator.addWeighted({
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
    accumulator.addWeighted(finding);
  }

  for (const finding of packageScriptFindings(options.packageScriptChanges ?? [])) {
    accumulator.addWeighted(finding);
  }

  for (const finding of dependencyProofFindings(changedFiles, options.dependencyChanges ?? [])) {
    accumulator.addWeighted(finding);
  }

  for (const finding of missingRequiredVerificationFindings(changedFiles, options.commandPlan ?? [], commandResults)) {
    accumulator.addWeighted(finding);
  }

  for (const rule of options.policy?.rules ?? []) {
    for (const file of changedFiles) {
      if (!matchesPolicyRule(file.path, rule)) continue;
      accumulator.add(rule.weight ?? severityWeights[rule.severity], {
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
    accumulator.add(24, {
      ruleId: "patch.large",
      severity: "high",
      title: "Large patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Large patches deserve split review or stronger test evidence.`,
      remediation: "Split unrelated changes or attach a clear verification report."
    });
  } else if (totalAdditions + totalDeletions > 500) {
    accumulator.add(12, {
      ruleId: "patch.medium",
      severity: "medium",
      title: "Medium-sized patch",
      detail: `${totalAdditions + totalDeletions} lines changed. Review should focus on changed behavior, not only file count.`
    });
  }

  const untestedSourceFiles = changedSourceFiles.filter((file) => !hasMatchingChangedTest(file.path, changedTestPaths));
  if (untestedSourceFiles.length > 0) {
    const examples = untestedSourceFiles.slice(0, 5).map((file) => file.path);
    accumulator.add(16, {
      ruleId: "test.source-without-test-change",
      severity: "medium",
      title: "Source changed without matching test changes",
      detail: `No changed test file matched ${examples.join(", ")}${untestedSourceFiles.length > examples.length ? ", ..." : ""}. Existing suites may still cover this, but the PR should prove it.`,
      remediation: `Add or update nearby tests such as ${testCandidates(untestedSourceFiles[0]?.path ?? "").slice(0, 3).join(", ")}, or explain why existing tests cover the patch.`
    });
  }

  for (const result of commandResults) {
    if (result.exitCode !== 0) {
      accumulator.add(30, {
        ruleId: "command.failed",
        severity: "critical",
        title: "Verification command failed",
        detail: `"${result.command}" exited with ${result.exitCode}.`,
        remediation: "Fix the failing command before merging."
      });
    }
  }

  const dedupedFindings = accumulator.findings;
  const riskScore = clamp(accumulator.risk, 0, 100);
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

function isDeclarationFile(path: string): boolean {
  return /\.d\.[cm]?ts$/i.test(path);
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
  const testNames = testFileNames(parsed.name, parsed.extension);
  const mirroredDirectories = testMirrorDirectories(parsed.directory);
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
    for (const directory of mirroredDirectories) {
      candidates.add(joinPath(directory, testName));
      candidates.add(joinPath("tests", directory, testName));
      candidates.add(joinPath("test", directory, testName));
      candidates.add(joinPath("spec", directory, testName));
      candidates.add(joinPath("tests", "Unit", directory, testName));
      candidates.add(joinPath("tests", "Feature", directory, testName));
    }
  }
  return [...candidates];
}

function testFileNames(name: string, extension: string): string[] {
  const names = new Set<string>();
  for (const testExtension of relatedTestExtensions(extension)) {
    names.add(`${name}.test${testExtension}`);
    names.add(`${name}.spec${testExtension}`);
    names.add(`test_${name}${testExtension}`);
    names.add(`${name}_test${testExtension}`);
    names.add(`${name}_spec${testExtension}`);
    names.add(`${name}Test${testExtension}`);
    names.add(`${name}Tests${testExtension}`);
    names.add(`${name}Spec${testExtension}`);
    names.add(`${name}Specs${testExtension}`);
  }
  return [...names];
}

function relatedTestExtensions(extension: string): string[] {
  if (extension === ".tsx") return [".tsx", ".ts", ".jsx", ".js"];
  if (extension === ".ts") return [".ts", ".tsx", ".js", ".jsx"];
  if (extension === ".jsx") return [".jsx", ".js", ".tsx", ".ts"];
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return [extension, ".js", ".jsx", ".ts", ".tsx"];
  return [extension];
}

function testMirrorDirectories(directory: string): string[] {
  const directories = new Set<string>();
  directories.add(directory);
  for (const root of ["src", "app"]) {
    if (directory.startsWith(`${root}/`)) {
      directories.add(directory.slice(root.length + 1));
    }
  }
  for (const root of ["src/main/java", "src/main/kotlin", "src/main/scala"]) {
    if (directory.startsWith(`${root}/`)) {
      directories.add(directory.replace(root, root.replace("/main/", "/test/")));
    }
  }
  return [...directories];
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
  const fileName = baseName(path);
  return (
    fileName === "pyproject.toml" ||
    fileName === "composer.json" ||
    fileName === "Gemfile" ||
    fileName === "go.mod" ||
    fileName === "Cargo.toml" ||
    fileName === "pom.xml" ||
    fileName === "build.gradle" ||
    fileName === "build.gradle.kts" ||
    fileName === "libs.versions.toml" ||
    isRequirementsFileName(fileName) ||
    /\.(csproj|fsproj|vbproj)$/i.test(fileName) ||
    fileName === "Directory.Packages.props"
  );
}

function isBinaryBunLockfile(path: string): boolean {
  return baseName(path) === "bun.lockb";
}

function workflowUsesUnpinnedAction(content: string): boolean {
  const match = /^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/i.exec(content);
  if (!match?.[1]) return false;
  const action = match[1];
  if (action.startsWith("./") || action.startsWith("docker://")) return false;
  const refSeparator = action.lastIndexOf("@");
  if (refSeparator < 0) return true;
  const ref = action.slice(refSeparator + 1);
  return !/^[a-f0-9]{40}$/i.test(ref);
}

function workflowUsesMutableDockerAction(content: string): boolean {
  const match = /^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/i.exec(content);
  if (!match?.[1]) return false;
  const action = match[1];
  if (!action.startsWith("docker://")) return false;
  const image = action.slice("docker://".length);
  return !/@sha256:[a-f0-9]{64}$/i.test(image);
}

function packageScriptFindings(scriptChanges: PackageScriptChange[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const change of scriptChanges) {
    if (change.after && packageScriptPipesRemoteCode(change.after)) {
      findings.push({
        ruleId: "package-script.remote-script-pipe",
        severity: "critical",
        title: `Package script pipes remote code to shell: ${change.scriptName}`,
        detail: `package.json script "${change.scriptName}" ${change.changeType === "added" ? "was added" : "was changed"} and downloads remote code directly into an interpreter.`,
        file: change.file,
        remediation: "Replace remote shell pipes with pinned package dependencies, checksum-verified downloads, or reviewed local scripts.",
        tags: ["dependencies", "supply-chain", "package-script"]
      });
    }

    if (change.after && isLifecyclePackageScript(change.scriptName)) {
      findings.push({
        ruleId: "package-script.lifecycle",
        severity: "high",
        title: `Package lifecycle script changed: ${change.scriptName}`,
        detail: `package.json lifecycle script "${change.scriptName}" ${change.changeType === "added" ? "was added" : "was changed"}, creating code that can run during install, prepare, pack, or publish flows.`,
        file: change.file,
        remediation: "Review the script as executable supply-chain surface. Prefer explicit CI steps or documented commands over implicit install-time behavior.",
        tags: ["dependencies", "supply-chain", "package-script"]
      });
    }

    if (change.after && isVerificationPackageScript(change.scriptName) && isDisabledVerificationCommand(change.after)) {
      findings.push({
        ruleId: "package-script.disabled-verification",
        severity: "high",
        title: `Verification script disabled: ${change.scriptName}`,
        detail: `package.json verification script "${change.scriptName}" now appears to exit successfully without running meaningful checks.`,
        file: change.file,
        remediation: "Restore the real verification command or explain why this repository no longer has that check.",
        tags: ["testing", "ci", "package-script"]
      });
    }

    if (change.changeType === "removed" && isVerificationPackageScript(change.scriptName)) {
      findings.push({
        ruleId: "package-script.removed-verification",
        severity: "medium",
        title: `Verification script removed: ${change.scriptName}`,
        detail: `package.json verification script "${change.scriptName}" was removed, reducing the commands reviewers and CI can run by convention.`,
        file: change.file,
        remediation: "Replace the removed script with an equivalent check or update PatchDrill policy with the new required command.",
        tags: ["testing", "ci", "package-script"]
      });
    }
  }
  return dedupeFindings(findings);
}

function dependencyProofFindings(changedFiles: ChangedFile[], dependencyChanges: DependencyChange[]): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const rule of DEPENDENCY_PROOF_RULES) {
    const manifestChanges = dependencyChanges.filter((change) => change.dependencyType !== "lockfile" && rule.manifest(change.file));
    const lockfileChanges = dependencyChanges.filter((change) => change.dependencyType === "lockfile" && rule.lockfile(change.file));
    const lockfileFileChanged = changedFiles.some((file) => rule.lockfile(file.path));
    if (manifestChanges.length > 0 && !lockfileFileChanged) {
      for (const [file, changes] of changesByFile(manifestChanges)) {
        findings.push({
          ruleId: "dependency.manifest-without-lockfile",
          severity: "medium",
          title: `${rule.ecosystem} dependency manifest changed without lockfile evidence`,
          detail: `${file} changed ${changes.length} direct dependenc${changes.length === 1 ? "y" : "ies"} (${dependencyChangeExamples(
            changes
          )}), but no ${rule.expectedLockfiles} change was detected in this patch.`,
          file,
          remediation: "Update the matching lockfile, or attach equivalent install/resolution evidence if this repository intentionally does not commit lockfiles.",
          tags: ["dependencies", "supply-chain", "evidence"]
        });
      }
    }

    if (lockfileChanges.length > 0 && manifestChanges.length === 0) {
      for (const [file, changes] of changesByFile(lockfileChanges)) {
        findings.push({
          ruleId: "dependency.lockfile-without-manifest",
          severity: "low",
          title: `${rule.ecosystem} lockfile changed without manifest dependency change`,
          detail: `${file} changed ${changes.length} resolved dependenc${changes.length === 1 ? "y" : "ies"} (${dependencyChangeExamples(
            changes
          )}), but no matching direct dependency manifest change was detected.`,
          file,
          remediation: "Confirm this is an intentional transitive resolution refresh and not an unreviewed supply-chain drift.",
          tags: ["dependencies", "supply-chain", "evidence"]
        });
      }
    }
  }

  return dedupeFindings(findings);
}

function changesByFile(changes: DependencyChange[]): Map<string, DependencyChange[]> {
  const grouped = new Map<string, DependencyChange[]>();
  for (const change of changes) {
    const values = grouped.get(change.file) ?? [];
    values.push(change);
    grouped.set(change.file, values);
  }
  return grouped;
}

function dependencyChangeExamples(changes: DependencyChange[]): string {
  const examples = changes.slice(0, 4).map((change) => {
    const before = change.before ? ` ${change.before}` : "";
    const after = change.after ? ` -> ${change.after}` : "";
    return `${change.packageName}${before}${after}`;
  });
  return `${examples.join(", ")}${changes.length > examples.length ? ", ..." : ""}`;
}

function missingRequiredVerificationFindings(changedFiles: ChangedFile[], commandPlan: CommandPlan[], commandResults: CommandResult[]): RiskFinding[] {
  if (changedFiles.length === 0) return [];
  const completedIds = new Set(commandResults.map((result) => result.id));
  const missing = commandPlan.filter((command) => command.required && !completedIds.has(command.id));
  if (missing.length === 0) return [];
  const examples = missing.slice(0, 3).map((command) => command.command);
  const suffix = missing.length > examples.length ? ", ..." : "";
  return [
    {
      ruleId: "verification.required-not-run",
      severity: "medium",
      title: "Required verification was planned but not run",
      detail: `${missing.length} required verification command${missing.length === 1 ? " was" : "s were"} not executed: ${examples.join(", ")}${suffix}.`,
      remediation: "Run PatchDrill with --run, or attach equivalent command evidence before merge.",
      tags: ["testing", "evidence", "verification"]
    }
  ];
}

function isLifecyclePackageScript(scriptName: string): boolean {
  return PACKAGE_LIFECYCLE_SCRIPTS.has(scriptName);
}

function isVerificationPackageScript(scriptName: string): boolean {
  return VERIFICATION_SCRIPT_NAMES.has(scriptName) || /^test[:_-]/i.test(scriptName) || /^lint[:_-]/i.test(scriptName);
}

function isDisabledVerificationCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (/^(true|:|exit 0|node -e ['"]?process\.exit\(0\)['"]?)$/.test(normalized)) return true;
  return /^echo\b.*&&\s*(true|exit 0)\s*$/i.test(normalized);
}

function packageScriptPipesRemoteCode(command: string): boolean {
  return /\b(curl|wget)\b.+\|\s*(sudo\s+)?(sh|bash|zsh|python|node)\b/i.test(command);
}

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function isRequirementsFileName(fileName: string): boolean {
  return /^requirements([-.].*)?\.txt$/i.test(fileName) || /^.*[-.]requirements\.txt$/i.test(fileName);
}

function workflowContextFindings(addedLines: AddedLine[], workflowFiles: { file: string; content: string }[]): RiskFinding[] {
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
    findings.push(...workflowReusableSecretFindings(file, lines));
    findings.push(...workflowOidcTrustBoundaryFindings(file, lines));
  }

  for (const workflowFile of workflowFiles) {
    const lines = workflowFile.content.split(/\r?\n/).map((content, index) => ({ file: workflowFile.file, line: index + 1, content }));
    const finding = workflowHeadCheckoutFinding(
      workflowFile.file,
      lines,
      "The changed workflow combines the privileged pull_request_target event with checkout of attacker-controlled pull request code."
    );
    if (finding) findings.push(finding);
    findings.push(...workflowReusableSecretFindings(workflowFile.file, lines));
    findings.push(...workflowOidcTrustBoundaryFindings(workflowFile.file, lines));
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

interface WorkflowReusableJob {
  jobId: string;
  uses: string;
  usesLine: number;
  secretsInheritLine: number;
}

function workflowReusableSecretFindings(file: string, lines: AddedLine[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const job of workflowReusableSecretJobs(lines)) {
    findings.push({
      ruleId: "workflow.reusable-inherited-secrets",
      severity: "high",
      title: "Reusable workflow inherits all caller secrets",
      detail: `Job "${job.jobId}" calls ${job.uses} with secrets: inherit, passing every caller-accessible organization, repository, and environment secret across a workflow boundary.`,
      file,
      line: job.secretsInheritLine,
      remediation: "Pass only named secrets needed by the called workflow, and review the called workflow's repository, ref, permissions, and runner trust.",
      tags: ["ci", "github-actions", "secrets", "trust-boundary"]
    });

    if (!reusableWorkflowUsesMutableRemoteRef(job.uses)) continue;
    findings.push({
      ruleId: "workflow.reusable-unpinned-secret-call",
      severity: "critical",
      title: "Mutable reusable workflow receives inherited secrets",
      detail: `Job "${job.jobId}" passes inherited secrets to the remote reusable workflow ${job.uses}, but the workflow ref is not pinned to a full commit SHA.`,
      file,
      line: job.usesLine,
      remediation: "Pin remote reusable workflows that receive secrets to a reviewed full-length commit SHA, or call a local workflow from the same commit.",
      tags: ["ci", "github-actions", "supply-chain", "secrets", "trust-boundary"]
    });
  }
  return findings;
}

function workflowOidcTrustBoundaryFindings(file: string, lines: AddedLine[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const workflowPermission = workflowPermissionState(lines, -1);
  const pullRequestTargetOidcLine = workflowHasPullRequestTarget(lines) ? firstEffectiveOidcPermissionLine(lines, workflowPermission) : undefined;

  if (pullRequestTargetOidcLine) {
    findings.push({
      ruleId: "workflow.pull-request-target-oidc",
      severity: "high",
      title: "pull_request_target workflow can mint OIDC tokens",
      detail: "The workflow combines the privileged pull_request_target event with id-token: write, allowing jobs to request cloud identity tokens from a fork-triggerable trust boundary.",
      file,
      line: pullRequestTargetOidcLine.line,
      remediation: "Move OIDC deployment to push, workflow_dispatch, or a protected environment path that never executes fork-controlled code.",
      tags: ["ci", "github-actions", "oidc", "trust-boundary"]
    });
  }

  for (const job of workflowJobBlocks(lines)) {
    const jobPermission = workflowPermissionState(job.lines, job.indent);
    const oidcPermissionLine = jobPermission.specified ? jobPermission.idTokenWriteLine : workflowPermission.idTokenWriteLine;
    if (!oidcPermissionLine) continue;

    const directChildren = workflowDirectChildLines(job.lines, job.indent);
    const environmentLine = directChildren.find((line) => readYamlScalar(line.content)?.key === "environment");
    const cloudOidcLine = workflowCloudOidcCredentialLine(job.lines);
    if (environmentLine) {
      findings.push({
        ruleId: "workflow.environment-oidc-token",
        severity: "high",
        title: "Environment job can mint OIDC tokens",
        detail: `Job "${job.jobId}" targets a GitHub environment and grants id-token: write, so environment reviewers and OIDC cloud-role conditions both become part of the deployment trust boundary.`,
        file,
        line: oidcPermissionLine.line,
        remediation: "Verify the environment protection rules, cloud OIDC subject/audience conditions, and branch restrictions before merging.",
        tags: ["ci", "github-actions", "oidc", "environment", "deployment"]
      });
    }
    if (cloudOidcLine && !environmentLine) {
      findings.push({
        ruleId: "workflow.cloud-oidc-without-environment",
        severity: "medium",
        title: "Cloud OIDC credential exchange lacks environment protection",
        detail: `Job "${job.jobId}" grants id-token: write and uses a cloud credential exchange action without a GitHub environment gate.`,
        file,
        line: cloudOidcLine.line,
        remediation: "Bind cloud OIDC roles to protected GitHub environments or verify equivalent branch, subject, and audience restrictions in the cloud identity policy.",
        tags: ["ci", "github-actions", "oidc", "cloud", "deployment"]
      });
    }

    const usesLine = directChildren.find((line) => readYamlScalar(line.content)?.key === "uses");
    const usesValue = usesLine ? readYamlScalar(usesLine.content)?.value : undefined;
    if (!usesLine || !usesValue || !isRemoteReusableWorkflowUse(usesValue)) continue;

    findings.push({
      ruleId: "workflow.reusable-oidc-token-boundary",
      severity: "high",
      title: "Remote reusable workflow can mint caller OIDC tokens",
      detail: `Job "${job.jobId}" calls ${usesValue} with id-token: write, allowing the called workflow to request OIDC tokens in the caller's trust context.`,
      file,
      line: oidcPermissionLine.line,
      remediation: "Grant id-token: write only to reviewed reusable workflows with explicit cloud role conditions and a trusted repository/ref owner.",
      tags: ["ci", "github-actions", "oidc", "reusable-workflow", "trust-boundary"]
    });

    if (!reusableWorkflowUsesMutableRemoteRef(usesValue)) continue;
    findings.push({
      ruleId: "workflow.reusable-unpinned-oidc-call",
      severity: "critical",
      title: "Mutable reusable workflow can mint caller OIDC tokens",
      detail: `Job "${job.jobId}" grants id-token: write to remote reusable workflow ${usesValue}, but the workflow ref is not pinned to a full commit SHA.`,
      file,
      line: usesLine.line,
      remediation: "Pin remote reusable workflows that receive OIDC permissions to a reviewed full-length commit SHA.",
      tags: ["ci", "github-actions", "supply-chain", "oidc", "trust-boundary"]
    });
  }

  return findings;
}

function workflowCloudOidcCredentialLine(lines: AddedLine[]): AddedLine | undefined {
  return lines.find((line) => workflowUsesCloudOidcCredentialAction(line.content));
}

function workflowUsesCloudOidcCredentialAction(content: string): boolean {
  const match = /^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/i.exec(content);
  if (!match?.[1]) return false;
  const action = match[1].split("@", 1)[0]?.toLowerCase();
  return Boolean(
    action &&
      [
        "aws-actions/configure-aws-credentials",
        "azure/login",
        "google-github-actions/auth",
        "hashicorp/vault-action"
      ].includes(action)
  );
}

function firstEffectiveOidcPermissionLine(lines: AddedLine[], workflowPermission: WorkflowPermissionState): AddedLine | undefined {
  if (workflowPermission.idTokenWriteLine) return workflowPermission.idTokenWriteLine;
  for (const job of workflowJobBlocks(lines)) {
    const jobPermission = workflowPermissionState(job.lines, job.indent);
    if (jobPermission.idTokenWriteLine) return jobPermission.idTokenWriteLine;
  }
  return undefined;
}

function workflowReusableSecretJobs(lines: AddedLine[]): WorkflowReusableJob[] {
  const jobs = workflowJobBlocks(lines);
  return jobs.flatMap((job) => {
    const directChildren = workflowDirectChildLines(job.lines, job.indent);
    const usesLine = directChildren.find((line) => readYamlScalar(line.content)?.key === "uses");
    const usesValue = usesLine ? readYamlScalar(usesLine.content)?.value : undefined;
    if (!usesLine || !usesValue || !isReusableWorkflowUse(usesValue)) return [];
    const secretsLine = directChildren.find((line) => {
      const scalar = readYamlScalar(line.content);
      return scalar?.key === "secrets" && unquoteYamlScalar(scalar.value).toLowerCase() === "inherit";
    });
    if (!secretsLine) return [];
    return [
      {
        jobId: job.jobId,
        uses: usesValue,
        usesLine: usesLine.line,
        secretsInheritLine: secretsLine.line
      }
    ];
  });
}

function workflowJobBlocks(lines: AddedLine[]): { jobId: string; indent: number; lines: AddedLine[] }[] {
  const jobsLineIndex = lines.findIndex((line) => readYamlScalar(line.content)?.key === "jobs");
  if (jobsLineIndex < 0) return [];

  const jobsLine = lines[jobsLineIndex];
  if (!jobsLine) return [];
  const jobsIndent = indentation(jobsLine.content);
  const jobIndent = lines.slice(jobsLineIndex + 1).find((line) => isYamlContentLine(line.content) && indentation(line.content) > jobsIndent);
  if (!jobIndent) return [];
  const directJobIndent = indentation(jobIndent.content);
  const blocks: { jobId: string; indent: number; lines: AddedLine[] }[] = [];
  let current: { jobId: string; indent: number; lines: AddedLine[] } | undefined;

  for (const line of lines.slice(jobsLineIndex + 1)) {
    if (!isYamlContentLine(line.content)) {
      if (current) current.lines.push(line);
      continue;
    }
    const indent = indentation(line.content);
    if (indent <= jobsIndent) break;
    const scalar = readYamlScalar(line.content);
    if (indent === directJobIndent && scalar?.value.length === 0) {
      if (current) blocks.push(current);
      current = { jobId: scalar.key, indent, lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (current) blocks.push(current);
  return blocks;
}

function workflowDirectChildLines(lines: AddedLine[], parentIndent: number): AddedLine[] {
  const childIndent = lines.find((line) => isYamlContentLine(line.content) && indentation(line.content) > parentIndent);
  if (!childIndent) return [];
  const directChildIndent = indentation(childIndent.content);
  return lines.filter((line) => isYamlContentLine(line.content) && indentation(line.content) === directChildIndent);
}

function isReusableWorkflowUse(value: string): boolean {
  const normalized = unquoteYamlScalar(value);
  return normalized.startsWith("./.github/workflows/") || /^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+(?:@[^@\s]+)?$/.test(normalized);
}

function isRemoteReusableWorkflowUse(value: string): boolean {
  const normalized = unquoteYamlScalar(value);
  return /^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+(?:@[^@\s]+)?$/.test(normalized);
}

function reusableWorkflowUsesMutableRemoteRef(value: string): boolean {
  const normalized = unquoteYamlScalar(value);
  if (normalized.startsWith("./")) return false;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex < 0) return true;
  const ref = normalized.slice(atIndex + 1);
  return !/^[a-f0-9]{40}$/i.test(ref);
}

interface WorkflowPermissionState {
  specified: boolean;
  idTokenWriteLine?: AddedLine;
}

function workflowPermissionState(lines: AddedLine[], parentIndent: number): WorkflowPermissionState {
  const directChildren = parentIndent < 0 ? workflowRootChildLines(lines) : workflowDirectChildLines(lines, parentIndent);
  const permissionsLine = directChildren.find((line) => readYamlScalar(line.content)?.key === "permissions");
  if (!permissionsLine) return { specified: false };

  const value = unquoteYamlScalar(readYamlScalar(permissionsLine.content)?.value ?? "").toLowerCase();
  if (value === "write-all" || /\bid-token\s*:\s*write\b/i.test(value)) {
    return { specified: true, idTokenWriteLine: permissionsLine };
  }
  if (value.length > 0) return { specified: true };

  const idTokenLine = workflowBlockDirectChildLines(lines, permissionsLine).find((line) => {
    const scalar = readYamlScalar(line.content);
    return scalar?.key === "id-token" && unquoteYamlScalar(scalar.value).toLowerCase() === "write";
  });
  return {
    specified: true,
    ...(idTokenLine ? { idTokenWriteLine: idTokenLine } : {})
  };
}

function workflowRootChildLines(lines: AddedLine[]): AddedLine[] {
  return lines.filter((line) => isYamlContentLine(line.content) && indentation(line.content) === 0);
}

function workflowBlockDirectChildLines(lines: AddedLine[], parentLine: AddedLine): AddedLine[] {
  const parentIndex = lines.indexOf(parentLine);
  if (parentIndex < 0) return [];
  const parentIndent = indentation(parentLine.content);
  let childIndent: number | undefined;
  const children: AddedLine[] = [];

  for (const line of lines.slice(parentIndex + 1)) {
    if (!isYamlContentLine(line.content)) continue;
    const indent = indentation(line.content);
    if (indent <= parentIndent) break;
    childIndent ??= indent;
    if (indent === childIndent) children.push(line);
  }

  return children;
}

function workflowHasPullRequestTarget(lines: AddedLine[]): boolean {
  return lines.some((line) => /^\s*pull_request_target\s*:/i.test(line.content));
}

function readYamlScalar(content: string): { key: string; value: string } | undefined {
  const withoutComment = stripYamlComment(content);
  const match = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(withoutComment);
  if (!match?.[1]) return undefined;
  return { key: match[1], value: match[2] ?? "" };
}

function stripYamlComment(content: string): string {
  const hashIndex = content.indexOf("#");
  return hashIndex >= 0 ? content.slice(0, hashIndex) : content;
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isYamlContentLine(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
}

function indentation(content: string): number {
  return /^\s*/.exec(content)?.[0].length ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findingKey(finding: RiskFinding): string {
  return `${finding.severity}:${finding.title}:${finding.file ?? ""}:${finding.line ?? ""}`;
}

function dedupeFindings(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = findingKey(finding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
