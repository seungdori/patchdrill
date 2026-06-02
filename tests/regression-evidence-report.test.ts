import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodeOwners, ownersForPath } from "../src/codeowners.js";
import { renderEvidenceManifest, verifyEvidenceManifest } from "../src/evidence.js";
import { renderMarkdown } from "../src/report.js";
import { reportContractFailures } from "../src/report-contract.js";
import type { PatchReport } from "../src/types.js";
import { withVerification } from "../src/verification.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function exampleReport(): PatchReport {
  return withVerification({
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
  });
}

describe("regression: evidence manifest JSON artifact requirement", () => {
  // evidence-0 (HIGH security): a manifest that records NO json artifact entry must
  // FAIL verification even when every other artifact still verifies, otherwise a
  // tampered report verifies as ok simply by dropping the json artifact entry.
  it("fails when the manifest records no JSON report artifact even though other artifacts verify", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-evidence-"));
    tempDirs.push(root);
    const report = exampleReport();
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = "# Report\n";
    writeFileSync(join(root, "patchdrill-report.json"), reportJson, "utf8");
    writeFileSync(join(root, "patchdrill-report.md"), markdown, "utf8");

    const manifest = JSON.parse(
      renderEvidenceManifest(
        report,
        [
          { kind: "json", path: "patchdrill-report.json", contents: reportJson },
          { kind: "markdown", path: "patchdrill-report.md", contents: markdown }
        ],
        root,
        reportJson
      )
    ) as {
      summary: { riskScore: number };
      artifacts: { kind: string }[];
    };

    // Drop the JSON artifact entry (the markdown artifact still verifies) and tamper
    // a summary field. Without the JSON artifact, the report digest and contract
    // cannot be proven, so verification must fail.
    manifest.artifacts = manifest.artifacts.filter((artifact) => artifact.kind !== "json");
    manifest.summary.riskScore = 99;
    writeFileSync(join(root, "patchdrill-evidence.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = verifyEvidenceManifest("patchdrill-evidence.json", root);

    expect(result.ok).toBe(false);
    expect(result.checkedReportArtifact).toBe(false);
    expect(result.checkedReportContract).toBe(false);
    // The markdown artifact still verifies, proving the failure is not from a digest mismatch.
    expect(result.checkedArtifactCount).toBe(1);
    expect(result.failures.some((failure) => failure.includes("no JSON report artifact"))).toBe(true);
  });
});

describe("regression: report contract findings validation", () => {
  // evidence-2: findings is the explanation of the risk score and is required; a
  // report with findings missing or set to a non-array must be reported as invalid.
  it("flags a report whose findings is missing", () => {
    const report = exampleReport();
    const partial: Partial<PatchReport> = { ...report };
    delete partial.findings;

    const failures = reportContractFailures(partial);

    expect(failures.some((failure) => failure.includes("findings is invalid"))).toBe(true);
  });

  it("flags a report whose findings is a non-array value", () => {
    const report = exampleReport();
    const partial = { ...report, findings: "not-an-array" } as unknown as Partial<PatchReport>;

    const failures = reportContractFailures(partial);

    expect(failures.some((failure) => failure.includes("findings is invalid"))).toBe(true);
  });
});

describe("regression: markdown command-output fencing is dynamic", () => {
  // reports-0 (HIGH security): untrusted command output may itself contain ``` fences
  // and a "```text" line; the rendered fence must be sized longer than the longest
  // backtick run so the payload stays inside the fence and cannot escape it.
  it("encloses command output containing triple-backtick fences inside a longer fence", () => {
    const report = exampleReport();
    const payload = ["```", "```text", "## Injected heading", "still inside"].join("\n");
    report.commandResults = [
      { id: "test", command: "npm test", exitCode: 0, durationMs: 1200, stdout: payload, stderr: "" }
    ];

    const markdown = renderMarkdown(report);

    // The fence sizing logic uses one backtick more than the longest run (>= 3 minimum),
    // so a fence of at least four backticks must appear to wrap the injected ``` run.
    expect(markdown).toContain("````text");
    expect(markdown).toContain(payload);
    // The injected heading must not escape the fence as a real Markdown heading.
    expect(markdown.split("\n").some((line) => line === "## Injected heading")).toBe(true);
    expect(markdown.split("\n").filter((line) => line === "## Command Results")).toHaveLength(1);
  });
});

describe("regression: finding free text is HTML-neutralized in Markdown", () => {
  // reports-2: untrusted finding free text rendered as Markdown can carry inline HTML
  // (e.g. <img src=x>) that renderers permit; "<" must be escaped to "&lt;".
  it("escapes inline HTML in finding detail and remediation", () => {
    const report = exampleReport();
    report.findings = [
      {
        ruleId: "example.escape",
        severity: "high",
        title: "Title",
        detail: "Detail <img src=x>",
        file: "src/index.ts",
        remediation: "Fix <img src=x>"
      }
    ];

    const markdown = renderMarkdown(report);

    expect(markdown).toContain("Detail &lt;img src=x>");
    expect(markdown).toContain("Fix &lt;img src=x>");
    expect(markdown).not.toContain("<img src=x>");
  });
});

describe("regression: codeowners path matching", () => {
  // support-1/support-2: a plain path component owns everything under it, an
  // unanchored name matches at any depth, a directory pattern matches deeper paths,
  // and a "*.md" glob matches files only (not "foo.md/bar").
  it("treats a leading-slash plain path as owning everything under it", () => {
    expect(ownersForPath("scripts/deploy.sh", parseCodeOwners("/scripts @ops"))).toEqual(["@ops"]);
  });

  it("matches an unanchored name at the repository root depth", () => {
    expect(ownersForPath("apps/web/x.ts", parseCodeOwners("apps @team"))).toEqual(["@team"]);
  });

  it("matches a directory pattern at any depth", () => {
    expect(ownersForPath("packages/apps/web/x.ts", parseCodeOwners("apps/ @team"))).toEqual(["@team"]);
  });

  it("does not let a file glob match a directory segment", () => {
    expect(ownersForPath("foo.md/bar", parseCodeOwners("*.md @docs"))).toBeUndefined();
  });
});
