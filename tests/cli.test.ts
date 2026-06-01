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
    expect(parseArgs(["dashboard", "--json", "patchdrill-report.json", "--output", "patchdrill-dashboard.html"])).toEqual({
      command: "dashboard",
      flags: {
        json: "patchdrill-report.json",
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
    expect(log).toHaveBeenCalledWith(`Wrote ${htmlPath}`);
  });
});

function exampleReport(): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: "2026-06-01T00:00:00.000Z",
    root: "/repo",
    summary: {
      status: "warn",
      riskScore: 25,
      confidenceScore: 75,
      changedFileCount: 1,
      additions: 2,
      deletions: 0,
      requiredCommandCount: 1,
      failedCommandCount: 0
    },
    changedFiles: [{ path: "src/cli.ts", status: "modified", additions: 2, deletions: 0, binary: false }],
    addedLines: 2,
    projectSignals: [{ ecosystem: "node", manifestPath: "package.json", packageManager: "npm" }],
    affectedPackages: [],
    dependencyChanges: [],
    findings: [{ ruleId: "cli.finding", severity: "medium", title: "CLI finding", detail: "Dashboard command changed." }],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "CLI changed.", ecosystem: "node", required: true }],
    commandResults: []
  };
}
