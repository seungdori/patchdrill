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
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  remediation?: string;
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
  projectSignals: ProjectSignal[];
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
  markdownPath?: string;
  jsonPath?: string;
  maxOutputChars?: number;
}
