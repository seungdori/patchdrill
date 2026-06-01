import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
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
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    bytes: Buffer.byteLength(value, "utf8")
  };
}
