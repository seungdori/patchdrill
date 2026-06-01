import { describe, expect, it } from "vitest";
import { renderHtml, renderMarkdown, shouldFail } from "../src/report.js";
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
      projectSignals: [{ ecosystem: "python", framework: "django", manifestPath: "manage.py" }],
      affectedPackages: [],
      dependencyChanges: [],
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
    expect(renderMarkdown(report)).toContain("| Ecosystem | Framework | Manifest | Package manager | Task runner |");
    expect(renderMarkdown(report)).toContain("| python | django | manage.py |  |  |");
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
      projectSignals: [{ ecosystem: "python", framework: "django", manifestPath: "manage.py" }],
      affectedPackages: [],
      dependencyChanges: [],
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
    expect(html).toContain("django");
    expect(html).toContain("Unsafe &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("npm test -- --grep=&quot;&lt;auth&gt;&quot;");
    expect(html).toContain("&lt;ok&gt;");
    expect(html).toContain("failed &amp; unsafe");
    expect(html).not.toContain("Unsafe <script>alert(1)</script>");
  });
});
