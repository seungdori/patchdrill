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
    | "terraform"
    | "docker"
    | "github-actions"
    | "unknown";
  manifestPath: string;
  packageManager?: string;
  scripts?: Record<string, string>;
}

export interface CommandPlan {
  id: string;
  label: string;
  command: string;
  reason: string;
  ecosystem: ProjectSignal["ecosystem"] | "general";
  required: boolean;
}

export interface CommandResult {
  id: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
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
  generatedAt: string;
  root: string;
  base?: string;
  head?: string;
  summary: PatchSummary;
  changedFiles: ChangedFile[];
  addedLines: number;
  projectSignals: ProjectSignal[];
  policy?: {
    path: string;
    ignoredPaths: string[];
    failOn?: Severity;
    maxRisk?: number;
    ruleCount: number;
    requiredCommandCount: number;
    optionalCommandCount: number;
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
  markdownPath?: string;
  jsonPath?: string;
  sarifPath?: string;
  maxOutputChars?: number;
}
