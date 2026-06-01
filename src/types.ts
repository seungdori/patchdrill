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
    | "ruby"
    | "php"
    | "dotnet"
    | "swift"
    | "terraform"
    | "docker"
    | "kubernetes"
    | "bazel"
    | "buck"
    | "pants"
    | "github-actions"
    | "unknown";
  manifestPath: string;
  framework?: "django" | "fastapi";
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
}

export interface ScanOptions {
  cwd: string;
  base?: string;
  head?: string;
  run?: boolean;
  failOn?: Severity;
  configPath?: string;
  baselinePath?: string;
  markdownPath?: string;
  jsonPath?: string;
  sarifPath?: string;
  htmlPath?: string;
  maxOutputChars?: number;
  commandTimeoutMs?: number;
}
