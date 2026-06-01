import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runGit } from "./git.js";
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
  failures: string[];
  warnings: string[];
}

export function renderEvidenceManifest(report: PatchReport, artifacts: RenderedEvidenceArtifact[], root: string, reportJson: string): string {
  const manifest: EvidenceManifest = {
    schemaVersion: "1",
    generatedAt: report.generatedAt,
    tool: {
      name: "patchdrill",
      reportSchemaVersion: report.schemaVersion
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
  const manifest = readManifest(manifestPath, failures);

  if (!manifest) {
    return { manifestPath, ok: false, checkedArtifactCount, checkedReportArtifact, failures, warnings };
  }

  if (manifest.schemaVersion !== "1") failures.push("Manifest schemaVersion must be 1.");
  if (manifest.tool?.name !== "patchdrill") failures.push("Manifest tool.name must be patchdrill.");
  if (!Array.isArray(manifest.artifacts)) {
    failures.push("Manifest artifacts must be an array.");
    return { manifestPath, ok: false, checkedArtifactCount, checkedReportArtifact, failures, warnings };
  }

  const artifactDigests = new Map<EvidenceArtifactKind, EvidenceDigest>();
  for (const artifact of manifest.artifacts) {
    if (!isEvidenceArtifact(artifact)) {
      failures.push("Manifest contains an invalid artifact entry.");
      continue;
    }
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

  return {
    manifestPath,
    ok: failures.length === 0,
    checkedArtifactCount,
    checkedReportArtifact,
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

function isDigestLike(value: unknown): value is EvidenceDigest {
  return isRecord(value) && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256) && typeof value.bytes === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
