import { Ajv2020 } from "ajv/dist/2020.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoCommand, parseArgs } from "../src/cli.js";
import { createDemoReport, demoScenarioNames } from "../src/demo.js";
import { readSchema } from "../src/schema.js";

const tempDirs: string[] = [];

describe("demo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces a schema-valid representative report", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(JSON.parse(readSchema("report")));

    for (const scenario of demoScenarioNames) {
      const report = createDemoReport(scenario);
      expect(validate(report), scenario).toBe(true);
      expect(report.commandPlan.some((command) => !command.required)).toBe(true);
    }

    expect(createDemoReport("review-ready").summary.failedCommandCount).toBe(0);
    expect(createDemoReport("risky-agent-pr").summary.status).toBe("fail");
    expect(createDemoReport("risky-agent-pr").findings.some((finding) => finding.severity === "critical")).toBe(true);
  });

  it("writes summary, Markdown, JSON, SARIF, and HTML artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-demo-"));
    tempDirs.push(root);
    const output = join(root, "artifacts");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    demoCommand(parseArgs(["demo", "--output", output]));

    const summary = join(output, "patchdrill-demo-summary.md");
    const markdown = join(output, "patchdrill-demo.md");
    const json = join(output, "patchdrill-demo.json");
    const sarif = join(output, "patchdrill-demo.sarif");
    const html = join(output, "patchdrill-demo.html");
    expect([summary, markdown, json, sarif, html].every((path) => existsSync(path))).toBe(true);
    expect(readFileSync(summary, "utf8")).toContain("PatchDrill Summary");
    expect(readFileSync(markdown, "utf8")).toContain("PatchDrill Report");
    expect(JSON.parse(readFileSync(json, "utf8"))).toMatchObject({ schemaVersion: "1" });
    expect(JSON.parse(readFileSync(sarif, "utf8"))).toMatchObject({ version: "2.1.0" });
    expect(readFileSync(html, "utf8")).toContain("Verification Dashboard");
    expect(log).toHaveBeenCalledWith(`Wrote demo artifacts to ${output}`);
  });

  it("writes risky-agent-pr demo artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-demo-"));
    tempDirs.push(root);
    const output = join(root, "artifacts");
    vi.spyOn(console, "log").mockImplementation(() => {});

    demoCommand(parseArgs(["demo", "--scenario", "risky-agent-pr", "--output", output]));

    const markdown = readFileSync(join(output, "patchdrill-demo.md"), "utf8");
    const summary = readFileSync(join(output, "patchdrill-demo-summary.md"), "utf8");
    const report = JSON.parse(readFileSync(join(output, "patchdrill-demo.json"), "utf8")) as ReturnType<typeof createDemoReport>;
    expect(markdown).toContain("Privileged workflow checks out pull request code");
    expect(summary).toContain("**FAIL** - risk 94/100");
    expect(summary).toContain("Privileged workflow checks out pull request code");
    expect(report.summary.status).toBe("fail");
    expect(report.summary.failedCommandCount).toBe(1);
    expect(report.changedFiles.map((file) => file.path)).toContain("package.json");
    expect(report.packageScriptChanges).toContainEqual(
      expect.objectContaining({
        scriptName: "test",
        changeType: "updated",
        before: "vitest run",
        after: "true"
      })
    );
    expect(markdown).toContain("## Package Script Changes");
    expect(markdown).toContain("Verification script disabled: test");
  });
});
