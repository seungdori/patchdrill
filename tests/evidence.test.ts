import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatEvidenceVerification, renderEvidenceManifest, verifyEvidenceManifest } from "../src/evidence.js";
import type { PatchReport } from "../src/types.js";

const tempDirs: string[] = [];

describe("evidence manifest", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders artifact and command digests without embedding command output", () => {
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    const manifest = JSON.parse(
      renderEvidenceManifest(
        report,
        [{ kind: "markdown", path: "patchdrill-report.md", contents: "# Report\n" }],
        "/not-a-git-repo",
        reportJson
      )
    ) as {
      schemaVersion: string;
      tool: { version?: string };
      report: { sha256: string; bytes: number; commandResultCount: number };
      artifacts: Array<{ kind: string; path: string; sha256: string; bytes: number }>;
      commands: Array<{ stdout: { sha256: string; bytes: number }; stderr: { sha256: string; bytes: number } }>;
    };

    expect(manifest.schemaVersion).toBe("1");
    expect(manifest.tool.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.report.sha256).toBe(sha256(reportJson));
    expect(manifest.report.bytes).toBe(Buffer.byteLength(reportJson, "utf8"));
    expect(manifest.report.commandResultCount).toBe(1);
    expect(manifest.artifacts).toEqual([
      {
        kind: "markdown",
        path: "patchdrill-report.md",
        sha256: sha256("# Report\n"),
        bytes: Buffer.byteLength("# Report\n", "utf8")
      }
    ]);
    expect(manifest.commands[0]?.stdout).toEqual({ sha256: sha256("ok\n"), bytes: 3 });
    expect(manifest.commands[0]?.stderr).toEqual({ sha256: sha256(""), bytes: 0 });
    expect(JSON.stringify(manifest)).not.toContain("ok\\n");
  });

  it("verifies recorded artifact and report digests", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-evidence-"));
    tempDirs.push(root);
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = "# Report\n";
    writeFileSync(join(root, "patchdrill-report.json"), reportJson, "utf8");
    writeFileSync(join(root, "patchdrill-report.md"), markdown, "utf8");
    writeFileSync(
      join(root, "patchdrill-evidence.json"),
      renderEvidenceManifest(
        report,
        [
          { kind: "json", path: "patchdrill-report.json", contents: reportJson },
          { kind: "markdown", path: "patchdrill-report.md", contents: markdown }
        ],
        root,
        reportJson
      ),
      "utf8"
    );

    const result = verifyEvidenceManifest("patchdrill-evidence.json", root);

    expect(result.ok).toBe(true);
    expect(result.checkedArtifactCount).toBe(2);
    expect(result.checkedReportArtifact).toBe(true);
    expect(result.checkedReportContract).toBe(true);
    expect(formatEvidenceVerification(result)).toContain("PatchDrill Evidence PASS - verified 2 artifacts");
    expect(formatEvidenceVerification(result)).toContain("Report JSON contract: matched");
  });

  it("fails verification when an artifact changes", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-evidence-"));
    tempDirs.push(root);
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(join(root, "patchdrill-report.json"), reportJson, "utf8");
    writeFileSync(
      join(root, "patchdrill-evidence.json"),
      renderEvidenceManifest(report, [{ kind: "json", path: "patchdrill-report.json", contents: reportJson }], root, reportJson),
      "utf8"
    );
    writeFileSync(join(root, "patchdrill-report.json"), `${reportJson}\nchanged\n`, "utf8");

    const result = verifyEvidenceManifest("patchdrill-evidence.json", root);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Artifact sha256 mismatch: patchdrill-report.json");
    expect(result.failures).toContain("Artifact byte length mismatch: patchdrill-report.json");
    expect(result.failures).toContain("Report digest does not match the JSON report artifact.");
  });

  it("fails verification when manifest report metadata drifts from the JSON report", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-evidence-"));
    tempDirs.push(root);
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    const manifest = JSON.parse(
      renderEvidenceManifest(report, [{ kind: "json", path: "patchdrill-report.json", contents: reportJson }], root, reportJson)
    ) as {
      summary: { riskScore: number };
      report: { findingCount: number; commandPlanCount: number; commandResultCount: number };
    };
    manifest.summary.riskScore = 99;
    manifest.report.commandResultCount = 0;
    writeFileSync(join(root, "patchdrill-report.json"), reportJson, "utf8");
    writeFileSync(join(root, "patchdrill-evidence.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = verifyEvidenceManifest("patchdrill-evidence.json", root);

    expect(result.ok).toBe(false);
    expect(result.checkedReportArtifact).toBe(true);
    expect(result.checkedReportContract).toBe(false);
    expect(result.failures).toContain("Manifest summary does not match the JSON report summary.");
    expect(result.failures).toContain("Manifest command result count does not match the JSON report.");
  });

  it("fails verification when manifest command digests drift from the JSON report", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-evidence-"));
    tempDirs.push(root);
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    const manifest = JSON.parse(
      renderEvidenceManifest(report, [{ kind: "json", path: "patchdrill-report.json", contents: reportJson }], root, reportJson)
    ) as {
      commands: Array<{ stdout: { sha256: string; bytes: number }; exitCode: number }>;
    };
    manifest.commands[0]!.stdout.bytes = 999;
    manifest.commands[0]!.exitCode = 1;
    writeFileSync(join(root, "patchdrill-report.json"), reportJson, "utf8");
    writeFileSync(join(root, "patchdrill-evidence.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = verifyEvidenceManifest("patchdrill-evidence.json", root);

    expect(result.ok).toBe(false);
    expect(result.checkedReportArtifact).toBe(true);
    expect(result.checkedReportContract).toBe(false);
    expect(result.failures).toContain("Manifest command exit code does not match the JSON report for test.");
    expect(result.failures).toContain("Manifest stdout digest does not match the JSON report for test.");
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exampleReport(): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: "2026-06-01T00:00:00.000Z",
    root: "/repo",
    base: "origin/main",
    summary: {
      status: "pass",
      riskScore: 10,
      confidenceScore: 90,
      changedFileCount: 1,
      additions: 2,
      deletions: 0,
      requiredCommandCount: 1,
      failedCommandCount: 0
    },
    changedFiles: [{ path: "src/index.ts", status: "modified", additions: 2, deletions: 0, binary: false }],
    addedLines: 2,
    projectSignals: [{ ecosystem: "node", manifestPath: "package.json" }],
    affectedPackages: [],
    dependencyChanges: [],
    packageScriptChanges: [],
    findings: [],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "Source changed.", ecosystem: "node", required: true }],
    commandResults: [{ id: "test", command: "npm test", exitCode: 0, durationMs: 1200, stdout: "ok\n", stderr: "" }]
  };
}
