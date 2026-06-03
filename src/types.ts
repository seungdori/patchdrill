import type { Locale } from "./i18n.js";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type PatchStatus = "pass" | "warn" | "fail";

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  owners?: string[];
}

export interface AddedLine {
  file: string;
  line: number;
  content: string;
}

export interface ProjectSignal {
  ecosystem:
    | "node"
    | "python"
    | "rust"
    | "go"
    | "java"
    | "android"
    | "ruby"
    | "php"
    | "dotnet"
    | "swift"
    | "xcode"
    | "terraform"
    | "docker"
    | "kubernetes"
    | "bazel"
    | "buck"
    | "pants"
    | "github-actions"
    | "unknown";
  manifestPath: string;
  framework?: "django" | "fastapi" | "spring-boot" | "rails" | "laravel" | "aspnet-core";
  entrypoint?: string;
  packageManager?: string;
  taskRunner?: "turbo" | "nx";
  scripts?: Record<string, string>;
  workspacePackages?: WorkspacePackage[];
}

export interface WorkspacePackage {
  name: string;
  projectName?: string;
  path: string;
  scripts: Record<string, string>;
  targets?: string[];
  dependencies?: string[];
}

export type DependencyChangeType = "added" | "removed" | "updated";

export interface DependencyChange {
  file: string;
  packageName: string;
  dependencyType: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies" | "lockfile";
  changeType: DependencyChangeType;
  packagePath?: string;
  before?: string;
  after?: string;
}

export type PackageScriptChangeType = "added" | "removed" | "updated";

export interface PackageScriptChange {
  file: string;
  scriptName: string;
  changeType: PackageScriptChangeType;
  before?: string;
  after?: string;
}

export interface CommandPlan {
  id: string;
  label: string;
  command: string;
  reason: string;
  ecosystem: ProjectSignal["ecosystem"] | "general";
  required: boolean;
  packageName?: string;
  packagePath?: string;
}

export interface CommandResult {
  id: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export type VerificationStatus = "passed" | "failed" | "timed-out" | "not-run" | "skipped-optional";

export interface VerificationSummary {
  plannedRequired: number;
  plannedOptional: number;
  run: number;
  passed: number;
  failed: number;
  timedOut: number;
  missingRequired: number;
  skippedOptional: number;
  unplannedResults: number;
}

export interface VerificationCommand {
  id: string;
  label: string;
  command: string;
  reason: string;
  ecosystem: CommandPlan["ecosystem"];
  required: boolean;
  planned: boolean;
  status: VerificationStatus;
  packageName?: string;
  packagePath?: string;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
}

export interface PatchVerification {
  summary: VerificationSummary;
  commands: VerificationCommand[];
}

export interface RiskFinding {
  ruleId?: string;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  remediation?: string;
  tags?: string[];
}

export interface PolicyRule {
  id: string;
  title: string;
  severity: Severity;
  path?: string | string[];
  detail?: string;
  remediation?: string;
  weight?: number;
  tags?: string[];
}

export interface PatchPolicy {
  ignoredPaths: string[];
  failOn?: Severity;
  maxRisk?: number;
  rules: PolicyRule[];
  requiredCommands: CommandPlan[];
  optionalCommands: CommandPlan[];
}

export interface PatchSummary {
  status: PatchStatus;
  riskScore: number;
  confidenceScore: number;
  changedFileCount: number;
  additions: number;
  deletions: number;
  requiredCommandCount: number;
  failedCommandCount: number;
}

export interface PatchReport {
  schemaVersion: "1";
  generatedAt: string;
  root: string;
  base?: string;
  head?: string;
  summary: PatchSummary;
  changedFiles: ChangedFile[];
  addedLines: number;
  projectSignals: ProjectSignal[];
  affectedPackages: WorkspacePackage[];
  dependencyChanges: DependencyChange[];
  packageScriptChanges: PackageScriptChange[];
  policy?: {
    path: string;
    ignoredPaths: string[];
    failOn?: Severity;
    maxRisk?: number;
    ruleCount: number;
    requiredCommandCount: number;
    optionalCommandCount: number;
  };
  codeOwners?: {
    path: string;
    ruleCount: number;
  };
  baseline?: {
    path: string;
    previousStatus?: PatchStatus;
    currentStatus: PatchStatus;
    previousRiskScore?: number;
    currentRiskScore: number;
    riskDelta: number;
    newFindingCount: number;
    resolvedFindingCount: number;
    unchangedFindingCount: number;
  };
  findings: RiskFinding[];
  commandPlan: CommandPlan[];
  commandResults: CommandResult[];
  verification: PatchVerification;
}

export interface ScanOptions {
  cwd: string;
  base?: string;
  head?: string;
  run?: boolean;
  runOptional?: boolean;
  failOn?: Severity;
  configPath?: string;
  baselinePath?: string;
  evidencePath?: string;
  summaryMarkdownPath?: string;
  markdownPath?: string;
  jsonPath?: string;
  sarifPath?: string;
  htmlPath?: string;
  maxOutputChars?: number;
  commandTimeoutMs?: number;
  /** Override the report timestamp for reproducible output; falls back to SOURCE_DATE_EPOCH then wall clock. */
  generatedAt?: string;
  /** Output locale for human-facing artifacts (markdown/summary/html). Default English. */
  locale?: Locale;
}
