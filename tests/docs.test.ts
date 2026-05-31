import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("documentation examples", () => {
  it("keeps the example report risk and confidence scores consistent", () => {
    const report = readFileSync("examples/report.md", "utf8");
    const risk = readScore(report, "Risk score");
    const confidence = readScore(report, "Confidence score");

    expect(confidence).toBe(100 - risk);
  });
});

function readScore(contents: string, label: string): number {
  const match = new RegExp(`${label}: \\*\\*(\\d+)/100\\*\\*`).exec(contents);
  if (!match?.[1]) throw new Error(`Missing score: ${label}`);
  return Number.parseInt(match[1], 10);
}
