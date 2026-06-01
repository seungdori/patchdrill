import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardCommand, parseArgs } from "../src/cli.js";
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
    expect(parseArgs(["scan", "--run", "--run-optional"])).toMatchObject({
      command: "scan",
      flags: { run: true, "run-optional": true }
    });
    expect(parseArgs(["scan", "--github-annotations"])).toMatchObject({
      command: "scan",
      flags: { "github-annotations": true }
    });
    expect(parseArgs(["demo", "--output", "patchdrill-demo"])).toEqual({
      command: "demo",
      flags: { output: "patchdrill-demo" },
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
    findings: [{ ruleId: "cli.finding", severity: "medium", title: overrides.title ?? "CLI finding", detail: "Dashboard command changed." }],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "CLI changed.", ecosystem: "node", required: true }],
    commandResults:
      failedCommandCount > 0
        ? [{ id: "test", command: "npm test", exitCode: 1, durationMs: 1000, stdout: "", stderr: "failed" }]
        : []
  };
}
