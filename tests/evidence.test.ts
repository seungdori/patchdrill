import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderEvidenceManifest } from "../src/evidence.js";
import type { PatchReport } from "../src/types.js";

describe("evidence manifest", () => {
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
      report: { sha256: string; bytes: number; commandResultCount: number };
      artifacts: Array<{ kind: string; path: string; sha256: string; bytes: number }>;
      commands: Array<{ stdout: { sha256: string; bytes: number }; stderr: { sha256: string; bytes: number } }>;
    };

    expect(manifest.schemaVersion).toBe("1");
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
    findings: [],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "Source changed.", ecosystem: "node", required: true }],
    commandResults: [{ id: "test", command: "npm test", exitCode: 0, durationMs: 1200, stdout: "ok\n", stderr: "" }]
  };
}
