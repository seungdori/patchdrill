import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectDoctor, renderDoctor } from "../src/doctor.js";
import { writePolicyFile } from "../src/init.js";

const tempDirs: string[] = [];

describe("doctor", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports repository readiness without running commands", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-doctor-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node --test", build: "tsc -p tsconfig.json" } }, null, 2),
      "utf8"
    );
    writePolicyFile(root);

    const report = inspectDoctor(root);
    const rendered = renderDoctor(report);

    expect(report.projectSignals.map((signal) => signal.ecosystem)).toEqual(["node"]);
    expect(rendered).toContain("PatchDrill Doctor");
    expect(rendered).toContain("[PASS] Project detection");
    expect(rendered).toContain("[PASS] Policy file");
    expect(rendered).toContain("Found test.");
    expect(rendered).toContain("Found build.");
    expect(rendered).toContain("patchdrill scan --base origin/main --run");
  });

  it("explains weak first-run setup", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-doctor-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

    const rendered = renderDoctor(inspectDoctor(root));

    expect(rendered).toContain("[WARN] Policy file");
    expect(rendered).toContain("No package scripts were found");
    expect(rendered).toContain("patchdrill init --policy");
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"scripts": {}');
  });
});
