import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoCommand, parseArgs } from "../src/cli.js";
import { createDemoReport } from "../src/demo.js";
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
    const report = createDemoReport();

    expect(validate(report)).toBe(true);
    expect(report.commandPlan.some((command) => !command.required)).toBe(true);
    expect(report.summary.failedCommandCount).toBe(0);
  });

  it("writes Markdown, JSON, SARIF, and HTML artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-demo-"));
    tempDirs.push(root);
    const output = join(root, "artifacts");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    demoCommand(parseArgs(["demo", "--output", output]));

    const markdown = join(output, "patchdrill-demo.md");
    const json = join(output, "patchdrill-demo.json");
    const sarif = join(output, "patchdrill-demo.sarif");
    const html = join(output, "patchdrill-demo.html");
    expect([markdown, json, sarif, html].every((path) => existsSync(path))).toBe(true);
    expect(readFileSync(markdown, "utf8")).toContain("PatchDrill Report");
    expect(JSON.parse(readFileSync(json, "utf8"))).toMatchObject({ schemaVersion: "1" });
    expect(JSON.parse(readFileSync(sarif, "utf8"))).toMatchObject({ version: "2.1.0" });
    expect(readFileSync(html, "utf8")).toContain("Verification Dashboard");
    expect(log).toHaveBeenCalledWith(`Wrote demo artifacts to ${output}`);
  });
});
