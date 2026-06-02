import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareBaseline, type BaselineComparisonInput } from "../src/baseline.js";
import { loadPolicy } from "../src/policy.js";

const tempDirs: string[] = [];

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `patchdrill-${prefix}-`));
  tempDirs.push(root);
  return root;
}

function writePolicy(root: string, fileName: string, contents: string): void {
  writeFileSync(join(root, fileName), contents);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("regression: policy weight validation (config-2)", () => {
  it("rejects a negative rule weight", () => {
    const root = makeRoot("regression-weight-negative");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: secrets-review
    title: Secrets review required
    severity: high
    weight: -50
`
    );

    expect(() => loadPolicy(root)).toThrow(/non-negative/);
  });

  it("accepts a positive rule weight", () => {
    const root = makeRoot("regression-weight-positive");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: secrets-review
    title: Secrets review required
    severity: high
    weight: 50
`
    );

    const loaded = loadPolicy(root);
    expect(loaded.policy.rules[0]!.weight).toBe(50);
  });
});

describe("regression: policy path validation (config-3)", () => {
  it("rejects an explicitly empty path array", () => {
    const root = makeRoot("regression-empty-path");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: review
    title: Review required
    severity: high
    path: []
`
    );

    expect(() => loadPolicy(root)).toThrow(/non-empty pattern/);
  });

  it("rejects an explicitly empty paths array", () => {
    const root = makeRoot("regression-empty-paths");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: review
    title: Review required
    severity: high
    paths: []
`
    );

    expect(() => loadPolicy(root)).toThrow(/non-empty pattern/);
  });

  it("accepts a rule with a real path pattern", () => {
    const root = makeRoot("regression-real-path");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: review
    title: Review required
    severity: high
    path: src/schema/**
`
    );

    const loaded = loadPolicy(root);
    expect(loaded.policy.rules[0]!.path).toBe("src/schema/**");
  });
});

describe("regression: policy field validation (tests-5)", () => {
  it("rejects maxRisk above 100", () => {
    const root = makeRoot("regression-maxrisk-high");
    writePolicy(root, ".patchdrill.yml", "maxRisk: 150\n");
    expect(() => loadPolicy(root)).toThrow(/integer from 0 to 100/);
  });

  it("rejects a non-integer maxRisk", () => {
    const root = makeRoot("regression-maxrisk-float");
    writePolicy(root, ".patchdrill.yml", "maxRisk: 50.5\n");
    expect(() => loadPolicy(root)).toThrow(/integer from 0 to 100/);
  });

  it("rejects a non-numeric rule weight", () => {
    const root = makeRoot("regression-weight-string");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: review
    title: Review required
    severity: high
    weight: "x"
`
    );

    expect(() => loadPolicy(root)).toThrow(/non-negative number/);
  });

  it("rejects an unknown top-level field", () => {
    const root = makeRoot("regression-unknown-top");
    writePolicy(root, ".patchdrill.yml", "failOnnn: high\n");
    expect(() => loadPolicy(root)).toThrow(/unknown field/);
  });

  it("rejects an unknown rule field", () => {
    const root = makeRoot("regression-unknown-rule");
    writePolicy(
      root,
      ".patchdrill.yml",
      `
rules:
  - id: review
    title: Review required
    severity: high
    bogus: nope
`
    );

    expect(() => loadPolicy(root)).toThrow(/unknown field/);
  });

  it("loads a JSON (not YAML) config and preserves a rule weight", () => {
    const root = makeRoot("regression-json-config");
    writePolicy(
      root,
      ".patchdrill.json",
      JSON.stringify({
        rules: [
          {
            id: "secrets-review",
            title: "Secrets review required",
            severity: "high",
            weight: 42
          }
        ]
      })
    );

    const loaded = loadPolicy(root);
    expect(loaded.path?.endsWith(".patchdrill.json")).toBe(true);
    expect(loaded.policy.rules[0]!.weight).toBe(42);
  });
});

describe("regression: baseline comparison (tests-4)", () => {
  const current: BaselineComparisonInput = {
    summary: { status: "warn", riskScore: 60 },
    findings: []
  };

  it("throws when the baseline path does not exist", () => {
    const root = makeRoot("regression-baseline-missing");
    expect(() => compareBaseline(root, "missing-baseline.json", current)).toThrow(
      /baseline report not found/
    );
  });

  it("throws when the baseline JSON is invalid", () => {
    const root = makeRoot("regression-baseline-invalid");
    writeFileSync(join(root, "baseline.json"), "{ not valid json");
    expect(() => compareBaseline(root, "baseline.json", current)).toThrow(
      /Failed to read PatchDrill baseline report/
    );
  });

  it("treats a baseline lacking summary as a zero-risk previous report", () => {
    const root = makeRoot("regression-baseline-no-summary");
    writeFileSync(join(root, "baseline.json"), JSON.stringify({ findings: [] }));

    const result = compareBaseline(root, "baseline.json", current);

    expect(result.riskDelta).toBe(current.summary.riskScore);
    expect(result.previousStatus).toBeUndefined();
    expect(result.previousRiskScore).toBeUndefined();
  });
});
