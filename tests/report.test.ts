import { describe, expect, it } from "vitest";
import { renderGitHubAnnotations, renderHtml, renderMarkdown, renderSummaryMarkdown, shouldFail } from "../src/report.js";
import type { PatchReport } from "../src/types.js";

describe("report", () => {
  it("renders Markdown and respects fail thresholds", () => {
    const report: PatchReport = {
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      summary: {
        status: "warn",
        riskScore: 40,
        confidenceScore: 60,
        changedFileCount: 1,
        additions: 5,
        deletions: 1,
        requiredCommandCount: 1,
        failedCommandCount: 0
      },
      changedFiles: [{ path: "src/auth.ts", status: "modified", additions: 5, deletions: 1, binary: false }],
      addedLines: 5,
      projectSignals: [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }],
      affectedPackages: [],
      dependencyChanges: [],
      packageScriptChanges: [
        {
          file: "package.json",
          scriptName: "test",
          changeType: "updated",
          before: "vitest run",
          after: "true"
        }
      ],
      findings: [
        {
          ruleId: "file.high-impact-area",
          severity: "high",
          title: "High-impact product area changed",
          detail: "Auth changed.",
          file: "src/auth.ts"
        }
      ],
      commandPlan: [
        {
          id: "node-test",
          label: "Node test",
          command: "npm run test",
          reason: "Tests exist.",
          ecosystem: "node",
          required: true
        }
      ],
      commandResults: []
    };

    expect(renderMarkdown(report)).toContain("PatchDrill Report");
    expect(renderMarkdown(report)).toContain("Schema version: 1");
    expect(renderMarkdown(report)).toContain("| Ecosystem | Framework | Entrypoint | Manifest | Package manager | Task runner |");
    expect(renderMarkdown(report)).toContain("| python | fastapi | app.main:app | requirements.txt |  |  |");
    expect(renderMarkdown(report)).toContain("## Package Script Changes");
    expect(renderMarkdown(report)).toContain("| package.json | `test` | updated | `vitest run` | `true` |");
    expect(renderMarkdown(report)).toContain("file.high-impact-area");
    expect(shouldFail(report, { failOn: "critical", maxRisk: 100 })).toBe(false);
    expect(shouldFail(report, { failOn: "high", maxRisk: 100 })).toBe(true);
    expect(shouldFail(report, { failOn: "critical", maxRisk: 30 })).toBe(true);
    expect(
      renderMarkdown({
        ...report,
        commandResults: [
          {
            id: "node-test",
            command: "npm run test",
            exitCode: 124,
            durationMs: 1000,
            stdout: "",
            stderr: "timed out",
            timedOut: true
          }
        ]
      })
    ).toContain("Timed out: yes");
    expect(
      shouldFail(
        {
          ...report,
          baseline: {
            path: "baseline.json",
            previousStatus: "pass",
            currentStatus: "warn",
            previousRiskScore: 10,
            currentRiskScore: 40,
            riskDelta: 30,
            newFindingCount: 1,
            resolvedFindingCount: 0,
            unchangedFindingCount: 0
          }
        },
        { failOn: "critical", maxRisk: 100, maxRiskDelta: 0 }
      )
    ).toBe(true);
  });

  it("renders a self-contained escaped HTML dashboard", () => {
    const report: PatchReport = {
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      base: "origin/main",
      summary: {
        status: "fail",
        riskScore: 80,
        confidenceScore: 45,
        changedFileCount: 1,
        additions: 7,
        deletions: 2,
        requiredCommandCount: 1,
        failedCommandCount: 1
      },
      changedFiles: [{ path: "src/<auth>.ts", status: "modified", additions: 7, deletions: 2, binary: false, owners: ["@security"] }],
      addedLines: 7,
      projectSignals: [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }],
      affectedPackages: [],
      dependencyChanges: [],
      packageScriptChanges: [
        {
          file: "package.json",
          scriptName: "postinstall",
          changeType: "added",
          after: "node scripts/install.js"
        }
      ],
      findings: [
        {
          ruleId: "example.escape",
          severity: "high",
          title: "Unsafe <script>alert(1)</script>",
          detail: "Escapes & displays risky content.",
          file: "src/<auth>.ts",
          remediation: "Review quoted \"HTML\"."
        }
      ],
      commandPlan: [
        {
          id: "node-test",
          label: "Node test",
          command: "npm test -- --grep=\"<auth>\"",
          reason: "Tests exist.",
          ecosystem: "node",
          required: true
        }
      ],
      commandResults: [
        {
          id: "node-test",
          command: "npm test -- --grep=\"<auth>\"",
          exitCode: 1,
          durationMs: 1200,
          stdout: "<ok>",
          stderr: "failed & unsafe"
        }
      ]
    };

    const html = renderHtml(report);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>PatchDrill Dashboard</title>");
    expect(html).toContain("80/100");
    expect(html).toContain("Framework");
    expect(html).toContain("Entrypoint");
    expect(html).toContain("fastapi");
    expect(html).toContain("app.main:app");
    expect(html).toContain("Package Script Changes");
    expect(html).toContain("postinstall");
    expect(html).toContain("node scripts/install.js");
    expect(html).toContain("Unsafe &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("npm test -- --grep=&quot;&lt;auth&gt;&quot;");
    expect(html).toContain("&lt;ok&gt;");
    expect(html).toContain("failed &amp; unsafe");
    expect(html).not.toContain("Unsafe <script>alert(1)</script>");
  });

  it("renders run trends for dashboard history", () => {
    const previous = htmlReport({ generatedAt: "2026-06-01T00:00:00.000Z", riskScore: 12, failedCommandCount: 0 });
    const latest = htmlReport({ generatedAt: "2026-06-02T00:00:00.000Z", riskScore: 32, failedCommandCount: 1, head: "feature" });

    const html = renderHtml(latest, { history: [previous, latest] });

    expect(html).toContain("Run Trend");
    expect(html).toContain("risk +20, failed checks +1");
    expect(html).toContain("1</td>");
    expect(html).toContain("2 latest");
    expect(html).toContain("2026-06-01T00:00:00.000Z");
    expect(html).toContain("feature");
  });

  it("renders Markdown and HTML without trailing whitespace", () => {
    const report = htmlReport({ generatedAt: "2026-06-01T00:00:00.000Z", riskScore: 12, failedCommandCount: 0 });
    const markdown = renderMarkdown(report);
    const summary = renderSummaryMarkdown(report);
    const html = renderHtml(report);

    expect(markdown).toMatch(/\n$/);
    expect(markdown).not.toMatch(/\n\n$/);
    expect(summary).toMatch(/\n$/);
    expect(summary).not.toMatch(/\n\n$/);
    expect(linesWithTrailingWhitespace(markdown)).toEqual([]);
    expect(linesWithTrailingWhitespace(summary)).toEqual([]);
    expect(linesWithTrailingWhitespace(html)).toEqual([]);
  });

  it("renders a compact Markdown summary for PR surfaces", () => {
    const report = htmlReport({ generatedAt: "2026-06-01T00:00:00.000Z", riskScore: 32, failedCommandCount: 1, head: "feature" });
    report.baseline = {
      path: "previous.json",
      previousStatus: "pass",
      currentStatus: "fail",
      previousRiskScore: 12,
      currentRiskScore: 32,
      riskDelta: 20,
      newFindingCount: 2,
      resolvedFindingCount: 0,
      unchangedFindingCount: 1
    };
    report.commandPlan[0]!.command = "npm test | tee test.log";
    report.commandResults[0]!.command = "npm test | tee test.log";

    const summary = renderSummaryMarkdown(report);

    expect(summary).toContain("# PatchDrill Summary");
    expect(summary).toContain("**FAIL** - risk 32/100, confidence 70/100");
    expect(summary).toContain("- Command results: 1 run, 1 failed");
    expect(summary).toContain("- Baseline risk delta: +20 (2 new findings)");
    expect(summary).toContain("- `src/app.ts` (modified, +4 / -1)");
    expect(summary).toContain("| medium | Example finding | Global |");
    expect(summary).toContain("| `npm test \\| tee test.log` | failed (1) |");
    expect(summary).toContain("Full Markdown, JSON, SARIF, and HTML reports remain available");
  });

  it("renders escaped GitHub Actions annotations for findings", () => {
    const report = htmlReport({ generatedAt: "2026-06-01T00:00:00.000Z", riskScore: 72, failedCommandCount: 0 });
    report.findings = [
      {
        ruleId: "escape",
        severity: "high",
        title: "Unsafe: title, 100%",
        detail: "Line one\nLine two 100%",
        file: "src/<auth>,session.ts",
        line: 7,
        remediation: "Review: owner, tests"
      },
      {
        ruleId: "info",
        severity: "info",
        title: "Global note",
        detail: "No file."
      }
    ];

    expect(renderGitHubAnnotations(report)).toBe(
      [
        "::error file=src/<auth>%2Csession.ts,line=7,title=Unsafe%3A title%2C 100%25::Line one%0ALine two 100%25 Remediation: Review: owner, tests",
        "::notice title=Global note::No file.",
        ""
      ].join("\n")
    );
  });
});

function linesWithTrailingWhitespace(value: string): string[] {
  return value.split("\n").filter((line) => /[ \t]+$/.test(line));
}

function htmlReport(overrides: { generatedAt: string; riskScore: number; failedCommandCount: number; head?: string }): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: overrides.generatedAt,
    root: "/repo",
    base: "origin/main",
    ...(overrides.head ? { head: overrides.head } : {}),
    summary: {
      status: overrides.failedCommandCount > 0 ? "fail" : "warn",
      riskScore: overrides.riskScore,
      confidenceScore: 70,
      changedFileCount: 1,
      additions: 4,
      deletions: 1,
      requiredCommandCount: 1,
      failedCommandCount: overrides.failedCommandCount
    },
    changedFiles: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1, binary: false }],
    addedLines: 4,
    projectSignals: [{ ecosystem: "node", manifestPath: "package.json", packageManager: "npm" }],
    affectedPackages: [],
    dependencyChanges: [],
    packageScriptChanges: [],
    findings: [{ ruleId: "example", severity: "medium", title: "Example finding", detail: "Example detail." }],
    commandPlan: [{ id: "test", label: "Tests", command: "npm test", reason: "Source changed.", ecosystem: "node", required: true }],
    commandResults:
      overrides.failedCommandCount > 0
        ? [{ id: "test", command: "npm test", exitCode: 1, durationMs: 1000, stdout: "", stderr: "failed" }]
        : []
  };
}
