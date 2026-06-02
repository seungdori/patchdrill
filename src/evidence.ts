import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runGit } from "./git.js";
import { reportContractFailures } from "./report-contract.js";
import type { CommandResult, PatchReport, PatchSummary } from "./types.js";

export type EvidenceArtifactKind = "summary-markdown" | "markdown" | "json" | "sarif" | "html";

export interface RenderedEvidenceArtifact {
  kind: EvidenceArtifactKind;
  path: string;
  contents: string;
}

export interface EvidenceManifest {
  schemaVersion: "1";
  generatedAt: string;
  tool: {
    name: "patchdrill";
    reportSchemaVersion: PatchReport["schemaVersion"];
    version?: string;
  };
  root: string;
  base?: string;
  head?: string;
  git: {
    branch?: string;
    headSha?: string;
    baseSha?: string;
  };
  summary: PatchSummary;
  report: {
    sha256: string;
    bytes: number;
    findingCount: number;
    commandPlanCount: number;
    commandResultCount: number;
  };
  artifacts: Array<{
    kind: EvidenceArtifactKind;
    path: string;
    sha256: string;
    bytes: number;
  }>;
  commands: EvidenceCommand[];
}

export interface EvidenceCommand {
  id: string;
  command: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
  stdout: EvidenceDigest;
  stderr: EvidenceDigest;
}

export interface EvidenceDigest {
  sha256: string;
  bytes: number;
}

export interface EvidenceVerificationResult {
  manifestPath: string;
  ok: boolean;
  checkedArtifactCount: number;
  checkedReportArtifact: boolean;
  checkedReportContract: boolean;
  failures: string[];
  warnings: string[];
}

export function renderEvidenceManifest(report: PatchReport, artifacts: RenderedEvidenceArtifact[], root: string, reportJson: string): string {
  const manifest: EvidenceManifest = {
    schemaVersion: "1",
    generatedAt: report.generatedAt,
    tool: {
      name: "patchdrill",
      reportSchemaVersion: report.schemaVersion,
      ...toolVersionField()
    },
    root: report.root,
    ...(report.base ? { base: report.base } : {}),
    ...(report.head ? { head: report.head } : {}),
    git: gitEvidence(root, report),
    summary: report.summary,
    report: {
      ...digest(reportJson),
      findingCount: report.findings.length,
      commandPlanCount: report.commandPlan.length,
      commandResultCount: report.commandResults.length
    },
    artifacts: artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: artifact.path,
      ...digest(artifact.contents)
    })),
    commands: report.commandResults.map(commandEvidence)
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function verifyEvidenceManifest(path: string, cwd = process.cwd()): EvidenceVerificationResult {
  const manifestPath = resolve(cwd, path);
  const manifestDir = dirname(manifestPath);
  const failures: string[] = [];
  const warnings: string[] = [];
  let checkedArtifactCount = 0;
  let checkedReportArtifact = false;
  let checkedReportContract = false;
  const manifest = readManifest(manifestPath, failures);

  if (!manifest) {
    return { manifestPath, ok: false, checkedArtifactCount, checkedReportArtifact, checkedReportContract, failures, warnings };
  }

  if (manifest.schemaVersion !== "1") failures.push("Manifest schemaVersion must be 1.");
  if (manifest.tool?.name !== "patchdrill") failures.push("Manifest tool.name must be patchdrill.");
  if (!Array.isArray(manifest.artifacts)) {
    failures.push("Manifest artifacts must be an array.");
    return { manifestPath, ok: false, checkedArtifactCount, checkedReportArtifact, checkedReportContract, failures, warnings };
  }

  const artifactDigests = new Map<EvidenceArtifactKind, EvidenceDigest>();
  const artifactKindCounts = new Map<EvidenceArtifactKind, number>();
  const jsonReports: Array<{ path: string; report: Partial<PatchReport> }> = [];
  for (const artifact of manifest.artifacts) {
    if (!isEvidenceArtifact(artifact)) {
      failures.push("Manifest contains an invalid artifact entry.");
      continue;
    }
    artifactKindCounts.set(artifact.kind, (artifactKindCounts.get(artifact.kind) ?? 0) + 1);
    const file = readArtifact(artifact.path, cwd, manifestDir);
    if (!file) {
      failures.push(`Artifact not found: ${artifact.path}`);
      continue;
    }
    checkedArtifactCount += 1;
    const actual = digestBuffer(file.data);
    artifactDigests.set(artifact.kind, actual);
    if (actual.sha256 !== artifact.sha256) {
      failures.push(`Artifact sha256 mismatch: ${artifact.path}`);
    }
    if (actual.bytes !== artifact.bytes) {
      failures.push(`Artifact byte length mismatch: ${artifact.path}`);
    }
    if (artifact.kind === "json") {
      const report = parseReportArtifact(artifact.path, file.data, failures);
      if (report) jsonReports.push({ path: artifact.path, report });
    }
  }

  for (const [kind, count] of artifactKindCounts) {
    if (count > 1) failures.push(`Manifest records duplicate ${kind} artifacts.`);
  }

  const jsonDigest = artifactDigests.get("json");
  if (!jsonDigest) {
    warnings.push("No JSON report artifact recorded; report digest could not be cross-checked against a file.");
  } else if (!isDigestLike(manifest.report)) {
    failures.push("Manifest report digest is invalid.");
  } else if (jsonDigest.sha256 !== manifest.report.sha256 || jsonDigest.bytes !== manifest.report.bytes) {
    failures.push("Report digest does not match the JSON report artifact.");
  } else {
    checkedReportArtifact = true;
  }
  if (jsonReports.length === 1) {
    checkedReportContract = verifyReportContract(manifest, jsonReports[0]!, failures);
  } else if (jsonReports.length > 1) {
    failures.push("Manifest report contract could not be checked because multiple JSON report artifacts were recorded.");
  }

  return {
    manifestPath,
    ok: failures.length === 0,
    checkedArtifactCount,
    checkedReportArtifact,
    checkedReportContract,
    failures,
    warnings
  };
}

export function formatEvidenceVerification(result: EvidenceVerificationResult): string {
  const lines = [
    `PatchDrill Evidence ${result.ok ? "PASS" : "FAIL"} - verified ${result.checkedArtifactCount} artifact${result.checkedArtifactCount === 1 ? "" : "s"}`
  ];
  lines.push(`Manifest: ${result.manifestPath}`);
  lines.push(`Report JSON digest: ${result.checkedReportArtifact ? "matched" : "not matched"}`);
  lines.push(`Report JSON contract: ${result.checkedReportContract ? "matched" : "not matched"}`);
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  for (const failure of result.failures) lines.push(`Failure: ${failure}`);
  return lines.join("\n");
}

function commandEvidence(result: CommandResult): EvidenceCommand {
  return {
    id: result.id,
    command: result.command,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    ...(result.timedOut !== undefined ? { timedOut: result.timedOut } : {}),
    stdout: digest(result.stdout),
    stderr: digest(result.stderr)
  };
}

function toolVersionField(): { version: string } | Record<string, never> {
  const version = readToolVersion();
  return version ? { version } : {};
}

function readToolVersion(): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function gitEvidence(root: string, report: PatchReport): EvidenceManifest["git"] {
  const branch = safeGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headSha = safeGit(root, ["rev-parse", "--verify", report.head ?? "HEAD"]);
  const baseSha = report.base ? safeGit(root, ["rev-parse", "--verify", report.base]) : undefined;
  return {
    ...(branch && branch !== "HEAD" ? { branch } : {}),
    ...(headSha ? { headSha } : {}),
    ...(baseSha ? { baseSha } : {})
  };
}

function safeGit(root: string, args: string[]): string | undefined {
  try {
    const output = runGit(root, args).trim();
    return output.length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

function digest(value: string): EvidenceDigest {
  return digestBuffer(Buffer.from(value, "utf8"));
}

function digestBuffer(value: Buffer): EvidenceDigest {
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    bytes: value.byteLength
  };
}

function readManifest(path: string, failures: string[]): Partial<EvidenceManifest> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<EvidenceManifest>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Failed to read evidence manifest: ${message}`);
    return undefined;
  }
}

function parseReportArtifact(path: string, data: Buffer, failures: string[]): Partial<PatchReport> | undefined {
  try {
    const value = JSON.parse(data.toString("utf8")) as unknown;
    if (!isRecord(value)) {
      failures.push(`JSON report artifact is not an object: ${path}`);
      return undefined;
    }
    return value as Partial<PatchReport>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Failed to parse JSON report artifact ${path}: ${message}`);
    return undefined;
  }
}

function verifyReportContract(manifest: Partial<EvidenceManifest>, artifact: { path: string; report: Partial<PatchReport> }, failures: string[]): boolean {
  const before = failures.length;
  const report = artifact.report;
  if (manifest.generatedAt !== report.generatedAt) failures.push("Manifest generatedAt does not match the JSON report.");
  if (manifest.root !== report.root) failures.push("Manifest root does not match the JSON report.");
  if (manifest.base !== report.base) failures.push("Manifest base does not match the JSON report.");
  if (manifest.head !== report.head) failures.push("Manifest head does not match the JSON report.");
  if (manifest.tool?.reportSchemaVersion !== report.schemaVersion) failures.push("Manifest tool.reportSchemaVersion does not match the JSON report.");
  if (!samePatchSummary(manifest.summary, report.summary)) failures.push("Manifest summary does not match the JSON report summary.");
  failures.push(...reportContractFailures(report));
  if (!isReportDigest(manifest.report)) {
    failures.push("Manifest report metadata is invalid.");
    return false;
  }
  if (!Array.isArray(report.findings)) {
    failures.push(`JSON report artifact has invalid findings: ${artifact.path}`);
  } else if (manifest.report.findingCount !== report.findings.length) {
    failures.push("Manifest finding count does not match the JSON report.");
  }
  if (!Array.isArray(report.commandPlan)) {
    failures.push(`JSON report artifact has invalid commandPlan: ${artifact.path}`);
  } else if (manifest.report.commandPlanCount !== report.commandPlan.length) {
    failures.push("Manifest command plan count does not match the JSON report.");
  }
  if (!Array.isArray(report.commandResults)) {
    failures.push(`JSON report artifact has invalid commandResults: ${artifact.path}`);
  } else if (manifest.report.commandResultCount !== report.commandResults.length) {
    failures.push("Manifest command result count does not match the JSON report.");
  } else {
    verifyCommandContracts(manifest.commands, report.commandResults, failures);
  }
  return failures.length === before;
}

function verifyCommandContracts(manifestCommands: unknown, reportCommands: CommandResult[], failures: string[]): void {
  if (!Array.isArray(manifestCommands)) {
    failures.push("Manifest commands must be an array.");
    return;
  }
  if (manifestCommands.length !== reportCommands.length) {
    failures.push("Manifest command list does not match the JSON report command results.");
    return;
  }
  for (const [index, reportCommand] of reportCommands.entries()) {
    const manifestCommand = manifestCommands[index];
    if (!isEvidenceCommand(manifestCommand)) {
      failures.push(`Manifest command entry is invalid at index ${index}.`);
      continue;
    }
    const label = reportCommand.id || String(index);
    if (manifestCommand.id !== reportCommand.id) failures.push(`Manifest command id does not match the JSON report for ${label}.`);
    if (manifestCommand.command !== reportCommand.command) failures.push(`Manifest command text does not match the JSON report for ${label}.`);
    if (manifestCommand.exitCode !== reportCommand.exitCode) failures.push(`Manifest command exit code does not match the JSON report for ${label}.`);
    if (manifestCommand.durationMs !== reportCommand.durationMs) failures.push(`Manifest command duration does not match the JSON report for ${label}.`);
    if ((manifestCommand.timedOut ?? undefined) !== (reportCommand.timedOut ?? undefined)) {
      failures.push(`Manifest command timeout state does not match the JSON report for ${label}.`);
    }
    if (!sameDigest(manifestCommand.stdout, digest(reportCommand.stdout))) failures.push(`Manifest stdout digest does not match the JSON report for ${label}.`);
    if (!sameDigest(manifestCommand.stderr, digest(reportCommand.stderr))) failures.push(`Manifest stderr digest does not match the JSON report for ${label}.`);
  }
}

function readArtifact(path: string, cwd: string, manifestDir: string): { path: string; data: Buffer } | undefined {
  const candidates = uniqueStrings([resolve(cwd, path), resolve(manifestDir, path)]);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return { path: candidate, data: readFileSync(candidate) };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isEvidenceArtifact(value: unknown): value is EvidenceManifest["artifacts"][number] {
  if (!isRecord(value)) return false;
  return isEvidenceArtifactKind(value.kind) && typeof value.path === "string" && isDigestLike(value);
}

function isEvidenceArtifactKind(value: unknown): value is EvidenceArtifactKind {
  return value === "summary-markdown" || value === "markdown" || value === "json" || value === "sarif" || value === "html";
}

function isEvidenceCommand(value: unknown): value is EvidenceCommand {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.command === "string" &&
    typeof value.exitCode === "number" &&
    typeof value.durationMs === "number" &&
    (value.timedOut === undefined || typeof value.timedOut === "boolean") &&
    isDigestLike(value.stdout) &&
    isDigestLike(value.stderr)
  );
}

function isReportDigest(value: unknown): value is EvidenceManifest["report"] {
  return (
    isDigestLike(value) &&
    isRecord(value) &&
    typeof value.findingCount === "number" &&
    typeof value.commandPlanCount === "number" &&
    typeof value.commandResultCount === "number"
  );
}

function isDigestLike(value: unknown): value is EvidenceDigest {
  return isRecord(value) && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256) && typeof value.bytes === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function samePatchSummary(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  return (
    left.status === right.status &&
    left.riskScore === right.riskScore &&
    left.confidenceScore === right.confidenceScore &&
    left.changedFileCount === right.changedFileCount &&
    left.additions === right.additions &&
    left.deletions === right.deletions &&
    left.requiredCommandCount === right.requiredCommandCount &&
    left.failedCommandCount === right.failedCommandCount
  );
}

function sameDigest(left: EvidenceDigest, right: EvidenceDigest): boolean {
  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
