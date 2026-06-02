import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardCommand, demoCommand, doctorCommand, evidenceCommand, parseArgs, releaseCheckCommand, renderExplainText } from "../src/cli.js";
import { verifyEvidenceManifest, type EvidenceManifest } from "../src/evidence.js";
import type { PatchReport } from "../src/types.js";

const tempDirs: string[] = [];

describe("cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses dashboard and HTML scan output flags", () => {
    expect(parseArgs(["scan", "--html", "patchdrill-dashboard.html"])).toMatchObject({
      command: "scan",
      flags: { html: "patchdrill-dashboard.html" }
    });
    expect(parseArgs(["scan", "--summary-markdown", "patchdrill-summary.md"])).toMatchObject({
      command: "scan",
      flags: { "summary-markdown": "patchdrill-summary.md" }
    });
    expect(parseArgs(["scan", "--evidence", "patchdrill-evidence.json"])).toMatchObject({
      command: "scan",
      flags: { evidence: "patchdrill-evidence.json" }
    });
    expect(parseArgs(["verify", "--evidence", "patchdrill-evidence.json"])).toMatchObject({
      command: "verify",
      flags: { evidence: "patchdrill-evidence.json" }
    });
    expect(parseArgs(["evidence", "--json", "patchdrill-report.json", "--evidence", "patchdrill-evidence.json"])).toMatchObject({
      command: "evidence",
      flags: { json: "patchdrill-report.json", evidence: "patchdrill-evidence.json" }
    });
    expect(parseArgs(["scan", "--run", "--run-optional"])).toMatchObject({
      command: "scan",
      flags: { run: true, "run-optional": true }
    });
    expect(parseArgs(["scan", "--run=false", "--run-optional", "off", "--github-annotations=0", "--quiet", "no"])).toMatchObject({
      command: "scan",
      flags: { run: false, "run-optional": false, "github-annotations": false, quiet: false }
    });
    expect(parseArgs(["scan", "--run=true", "--run=false"])).toMatchObject({
      command: "scan",
      flags: { run: ["true", "false"] }
    });
    expect(parseArgs(["scan", "--github-annotations"])).toMatchObject({
      command: "scan",
      flags: { "github-annotations": true }
    });
    expect(() => parseArgs(["scan", "--run=maybe"])).toThrow('Invalid boolean value "maybe" for --run');
    expect(parseArgs(["demo", "--output", "patchdrill-demo"])).toEqual({
      command: "demo",
      flags: { output: "patchdrill-demo" },
      positionals: []
    });
    expect(parseArgs(["demo", "--scenario", "risky-agent-pr", "--output", "patchdrill-demo"])).toEqual({
      command: "demo",
      flags: { scenario: "risky-agent-pr", output: "patchdrill-demo" },
      positionals: []
    });
    expect(parseArgs(["doctor"])).toEqual({
      command: "doctor",
      flags: {},
      positionals: []
    });
    expect(parseArgs(["doctor", "--format", "json"])).toEqual({
      command: "doctor",
      flags: { format: "json" },
      positionals: []
    });
    expect(parseArgs(["release-check"])).toEqual({
      command: "release-check",
      flags: {},
      positionals: []
    });
    expect(parseArgs(["release-check", "--format=json"])).toEqual({
      command: "release-check",
      flags: { format: "json" },
      positionals: []
    });
    expect(parseArgs(["dashboard", "--json", "previous.json", "--json", "current.json", "--output", "patchdrill-dashboard.html"])).toEqual({
      command: "dashboard",
      flags: {
        json: ["previous.json", "current.json"],
        output: "patchdrill-dashboard.html"
      },
      positionals: []
    });
  });

  it("writes a static dashboard from a saved JSON report", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-cli-"));
    tempDirs.push(root);
    const jsonPath = join(root, "report.json");
    const htmlPath = join(root, "dashboard.html");
    writeFileSync(jsonPath, JSON.stringify(exampleReport()), "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    dashboardCommand(parseArgs(["dashboard", "--json", jsonPath, "--output", htmlPath]));
    const html = readFileSync(htmlPath, "utf8");

    expect(html).toContain("<title>PatchDrill Dashboard</title>");
    expect(html).toContain("CLI finding");
    expect(html).not.toContain("Run Trend");
    expect(log).toHaveBeenCalledWith(`Wrote ${htmlPath}`);
  });

  it("writes a multi-run dashboard trend from repeated JSON reports", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-cli-"));
    tempDirs.push(root);
    const previousPath = join(root, "previous.json");
    const currentPath = join(root, "current.json");
    const htmlPath = join(root, "dashboard.html");
    writeFileSync(previousPath, JSON.stringify(exampleReport({ generatedAt: "2026-06-01T00:00:00.000Z", riskScore: 10, failedCommandCount: 0 })), "utf8");
    writeFileSync(
      currentPath,
      JSON.stringify(exampleReport({ generatedAt: "2026-06-02T00:00:00.000Z", riskScore: 35, failedCommandCount: 1, title: "Latest CLI finding" })),
      "utf8"
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    dashboardCommand(parseArgs(["dashboard", "--json", previousPath, "--json", currentPath, "--output", htmlPath]));
    const html = readFileSync(htmlPath, "utf8");

    expect(html).toContain("Run Trend");
    expect(html).toContain("risk +25, failed checks +1");
    expect(html).toContain("2 latest");
    expect(html).toContain("2026-06-01T00:00:00.000Z");
    expect(html).toContain("Latest CLI finding");
  });

  it("writes a compact summary in demo output", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-cli-"));
    tempDirs.push(root);
    const output = join(root, "demo");
    vi.spyOn(console, "log").mockImplementation(() => {});

    demoCommand(parseArgs(["demo", "--scenario", "risky-agent-pr", "--output", output]));
    const summary = readFileSync(join(output, "patchdrill-demo-summary.md"), "utf8");

    expect(summary).toContain("# PatchDrill Summary");
    expect(summary).toContain("**FAIL** - risk 94/100");
    expect(summary).toContain("Privileged workflow checks out pull request code");
  });

  it("explains the product boundary against AI PR reviewers", () => {
    const text = renderExplainText();

    expect(text).toContain("PatchDrill is the deterministic proof layer between code review and CI.");
    expect(text).toContain("PatchDrill is not an AI PR reviewer.");
    expect(text).toContain("What deterministic proof should exist before merge?");
    expect(text).toContain("Emits a Proof Pack");
    expect(text).toContain("No model call is required");
    expect(text).toContain("scan does not mutate the repository or run commands unless --run is set");
    expect(text).toContain("Proof Pack artifacts are meant for CI gates, bots, auditors, reviewers, and model-assisted review.");
    expect(text).toContain("patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo");
    expect(text).toContain("patchdrill scan --base origin/main --run");
  });

  it("prints JSON for doctor and release-check automation", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    doctorCommand(parseArgs(["doctor", "--format", "json"]));
    releaseCheckCommand(parseArgs(["release-check", "--format", "json"]));

    const doctorPayload = JSON.parse(String(log.mock.calls[0]?.[0])) as { projectSignals: unknown[]; checks: unknown[] };
    const releasePayload = JSON.parse(String(log.mock.calls[1]?.[0])) as { ok: boolean; checks: unknown[] };
    expect(doctorPayload.projectSignals.length).toBeGreaterThan(0);
    expect(doctorPayload.checks.length).toBeGreaterThan(0);
    expect(releasePayload.ok).toBe(true);
    expect(releasePayload.checks.length).toBeGreaterThan(0);
  });

  it("writes an evidence manifest from saved report artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-cli-"));
    tempDirs.push(root);
    const reportPath = join(root, "patchdrill-report.json");
    const summaryPath = join(root, "patchdrill-summary.md");
    const htmlPath = join(root, "patchdrill-dashboard.html");
    const evidencePath = join(root, "patchdrill-evidence.json");
    writeFileSync(reportPath, `${JSON.stringify(exampleReport())}\n`, "utf8");
    writeFileSync(summaryPath, "# PatchDrill Summary\n", "utf8");
    writeFileSync(htmlPath, "<!doctype html><title>PatchDrill</title>\n", "utf8");
    vi.spyOn(console, "log").mockImplementation(() => {});

    evidenceCommand(
      parseArgs([
        "evidence",
        "--json",
        reportPath,
        "--evidence",
        evidencePath,
        "--summary-markdown",
        summaryPath,
        "--html",
        htmlPath
      ])
    );

    const manifest = JSON.parse(readFileSync(evidencePath, "utf8")) as EvidenceManifest;
    expect(manifest.artifacts.map((artifact) => artifact.kind)).toEqual(["summary-markdown", "json", "html"]);
    expect(verifyEvidenceManifest(evidencePath).ok).toBe(true);
  });
});

function exampleReport(overrides: { generatedAt?: string; riskScore?: number; failedCommandCount?: number; title?: string } = {}): PatchReport {
  const riskScore = overrides.riskScore ?? 25;
  const failedCommandCount = overrides.failedCommandCount ?? 0;
  return {
    schemaVersion: "1",
    generatedAt: overrides.generatedAt ?? "2026-06-01T00:00:00.000Z",
    root: "/repo",
    summary: {
      status: failedCommandCount > 0 ? "fail" : riskScore > 0 ? "warn" : "pass",
      riskScore,
      confidenceScore: 75,
      changedFileCount: 1,
      additions: 2,
      deletions: 0,
      requiredCommandCount: 1,
      failedCommandCount
    },
    changedFiles: [{ path: "src/cli.ts", status: "modified", additions: 2, deletions: 0, binary: false }],
    addedLines: 2,
    projectSignals: [{ ecosystem: "node", manifestPath: "package.json", packageManager: "npm" }],
    affectedPackages: [],
    dependencyChanges: [],
    packageScriptChanges: [],
    findings: [{ ruleId: "cli.finding", severity: "medium", title: overrides.title ?? "CLI finding", detail: "Dashboard command changed." }],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "CLI changed.", ecosystem: "node", required: true }],
    commandResults:
      failedCommandCount > 0
        ? [{ id: "test", command: "npm test", exitCode: 1, durationMs: 1000, stdout: "", stderr: "failed" }]
        : []
  };
}
