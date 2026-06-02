import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoReport, demoScenarioNames } from "../src/demo.js";
import { inspectDoctor } from "../src/doctor.js";
import { scan } from "../src/scan.js";
import type { DoctorCheck } from "../src/doctor.js";

const tempDirs: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function makeNodeRepo(scripts: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-"));
  tempDirs.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts }, null, 2), "utf8");
  return root;
}

function findCheck(checks: DoctorCheck[], titlePrefix: string): DoctorCheck {
  const check = checks.find((entry) => entry.title.startsWith(titlePrefix));
  if (!check) throw new Error(`Missing doctor check: ${titlePrefix}`);
  return check;
}

describe("regression: doctor + scan + demo fixes", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // config-0: doctor mirrors the planner's typecheck aliases exactly, so a
  // package.json whose only script is a typecheck alias ("tsc" or "types")
  // reports the static/build check as PASS, not info.
  it("treats a sole tsc script as a PASS static/build check", () => {
    const root = makeNodeRepo({ tsc: "tsc -p tsconfig.json" });

    const report = inspectDoctor(root);
    const staticCheck = findCheck(report.checks, "Node static/build script");

    expect(staticCheck.status).toBe("pass");
    expect(staticCheck.detail).toBe("Found tsc.");
  });

  it("treats a sole types script as a PASS static/build check", () => {
    const root = makeNodeRepo({ types: "tsc --noEmit" });

    const report = inspectDoctor(root);
    const staticCheck = findCheck(report.checks, "Node static/build script");

    expect(staticCheck.status).toBe("pass");
    expect(staticCheck.detail).toBe("Found types.");
  });

  // config-1: doctor exact-matches the planner's test aliases (test, test:unit,
  // unit) so a script that merely *contains* "unit" as a substring ("reunite",
  // "community-build") does NOT satisfy the test-script check; it reports WARN.
  it("does not let a substring-only 'reunite' script satisfy the test check", () => {
    const root = makeNodeRepo({ reunite: "node ./reunite.js" });

    const report = inspectDoctor(root);
    const testCheck = findCheck(report.checks, "Node test script");

    expect(testCheck.status).toBe("warn");
    expect(testCheck.status).not.toBe("pass");
    expect(testCheck.detail).toBe("No obvious test script was found.");
  });

  it("does not let a substring-only 'community-build' script satisfy the test check", () => {
    const root = makeNodeRepo({ "community-build": "node ./community-build.js" });

    const report = inspectDoctor(root);
    const testCheck = findCheck(report.checks, "Node test script");

    expect(testCheck.status).toBe("warn");
    expect(testCheck.status).not.toBe("pass");
  });

  // tests-1 + cli-4: scanning the same repo twice yields deep-equal reports
  // once the intentionally non-deterministic generatedAt field is normalized.
  it("produces deep-equal reports for two scans of the same repo (ignoring generatedAt)", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", build: "tsc -p tsconfig.json" } }, null, 2));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(join(root, "src", "index.ts"), "export const ok = false;\n");

    const first = await scan({ cwd: root });
    const second = await scan({ cwd: root });

    // generatedAt is the one intentionally non-deterministic field.
    const normalizedFirst = { ...first, generatedAt: "NORMALIZED" };
    const normalizedSecond = { ...second, generatedAt: "NORMALIZED" };

    expect(normalizedSecond).toEqual(normalizedFirst);
    expect(JSON.stringify(normalizedSecond)).toBe(JSON.stringify(normalizedFirst));
  });

  it("makes generatedAt reproducible when SOURCE_DATE_EPOCH is set", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    writeFileSync(join(root, "README.md"), "# Reproducible\n");

    const previousEpoch = process.env.SOURCE_DATE_EPOCH;
    try {
      process.env.SOURCE_DATE_EPOCH = "1717200000";
      const first = await scan({ cwd: root });
      const second = await scan({ cwd: root });

      expect(first.generatedAt).toBe(second.generatedAt);
      // 1717200000 seconds since the epoch is 2024-06-01T00:00:00.000Z.
      expect(first.generatedAt).toBe(new Date(1717200000 * 1000).toISOString());
      expect(first.generatedAt).toBe("2024-06-01T00:00:00.000Z");
    } finally {
      if (previousEpoch === undefined) {
        delete process.env.SOURCE_DATE_EPOCH;
      } else {
        process.env.SOURCE_DATE_EPOCH = previousEpoch;
      }
    }
  });

  // docs-2: every demo finding's ruleId is a real engine rule id. The engine's
  // rule ids are the ruleId literals declared in src/risk.ts (the same source
  // docs.test.ts treats as the authoritative built-in rule set).
  it("uses only real engine rule ids in every demo scenario", () => {
    const riskSource = readFileSync("src/risk.ts", "utf8");
    const engineRuleIds = new Set([...riskSource.matchAll(/ruleId: "([^"]+)"/g)].map((match) => match[1]));

    expect(engineRuleIds.size).toBeGreaterThan(0);

    for (const scenario of demoScenarioNames) {
      const report = createDemoReport(scenario);
      expect(report.findings.length).toBeGreaterThan(0);
      for (const finding of report.findings) {
        expect(engineRuleIds.has(finding.ruleId)).toBe(true);
      }
    }
  });
});
