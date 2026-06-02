import { describe, expect, it } from "vitest";
import { parseArgs, scanCommand } from "../src/cli.js";

describe("regression: cli arg parsing", () => {
  it("cli-1: rejects an unknown (typo'd) flag but accepts the correct known flag", () => {
    expect(() => parseArgs(["scan", "--max-rsik", "10"])).toThrow(/Unknown flag/);
    expect(parseArgs(["scan", "--max-risk", "10"])).toMatchObject({
      command: "scan",
      flags: { "max-risk": "10" }
    });
  });

  it("cli-0: value-taking flag with a missing value throws", () => {
    expect(() => parseArgs(["scan", "--base"])).toThrow(/requires a value/);
  });

  it("cli-0: value-taking flag followed by another flag throws", () => {
    expect(() => parseArgs(["scan", "--base", "--json", "r.json"])).toThrow(/requires a value/);
  });

  it("cli-2: bare --markdown requires a value instead of silently becoming a boolean", () => {
    expect(() => parseArgs(["scan", "--markdown"])).toThrow(/requires a value/);
  });

  it("cli-3: scanCommand requires --baseline when --max-risk-delta is set", async () => {
    await expect(scanCommand(parseArgs(["scan", "--max-risk-delta", "5"]))).rejects.toThrow(
      /max-risk-delta requires --baseline/
    );
  });

  it("accepts explicit boolean flag values", () => {
    expect(parseArgs(["scan", "--run=false"])).toMatchObject({
      command: "scan",
      flags: { run: false }
    });
    expect(parseArgs(["scan", "--run=true"])).toMatchObject({
      command: "scan",
      flags: { run: true }
    });
  });

  it("accepts a representative set of known flags with values", () => {
    expect(parseArgs(["scan", "--base", "origin/main", "--json", "report.json"])).toMatchObject({
      command: "scan",
      flags: { base: "origin/main", json: "report.json" }
    });
    expect(parseArgs(["scan", "--max-risk-delta", "5", "--baseline", "prev.json"])).toMatchObject({
      command: "scan",
      flags: { "max-risk-delta": "5", baseline: "prev.json" }
    });
  });
});
