import { describe, expect, it } from "vitest";
import { assessRisk } from "../src/risk.js";
import type { ChangedFile } from "../src/types.js";

describe("assessRisk", () => {
  it("flags high-impact auth changes and missing tests", () => {
    const files: ChangedFile[] = [
      { path: "src/auth/session.ts", status: "modified", additions: 20, deletions: 5, binary: false }
    ];

    const assessment = assessRisk(files, []);

    expect(assessment.status).toBe("warn");
    expect(assessment.findings.map((finding) => finding.title)).toContain("High-impact product area changed");
    expect(assessment.findings.map((finding) => finding.title)).toContain("Source changed without test changes");
  });

  it("fails when a verification command failed", () => {
    const assessment = assessRisk(
      [{ path: "README.md", status: "modified", additions: 1, deletions: 1, binary: false }],
      [
        {
          id: "node-test",
          command: "npm test",
          exitCode: 1,
          durationMs: 100,
          stdout: "",
          stderr: "failed"
        }
      ]
    );

    expect(assessment.status).toBe("fail");
    expect(assessment.riskScore).toBeGreaterThanOrEqual(40);
  });

  it("does not treat security documentation as product security code", () => {
    const assessment = assessRisk(
      [{ path: "SECURITY.md", status: "modified", additions: 5, deletions: 1, binary: false }],
      []
    );

    expect(assessment.findings.map((finding) => finding.title)).not.toContain("High-impact product area changed");
  });
});
