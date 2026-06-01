import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDemoReport } from "../src/demo.js";
import { renderHtml, renderMarkdown, renderSarif } from "../src/report.js";

describe("documentation examples", () => {
  it("keeps the example report risk and confidence scores consistent", () => {
    const report = readFileSync("examples/report.md", "utf8");
    const risk = readScore(report, "Risk score");
    const confidence = readScore(report, "Confidence score");

    expect(confidence).toBe(100 - risk);
  });

  it("keeps the README terminal demo asset wired", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("![PatchDrill terminal demo](docs/assets/patchdrill-demo.svg)");
    expect(existsSync("docs/assets/patchdrill-demo.svg")).toBe(true);
  });

  it("keeps committed demo artifacts synchronized with the demo renderer", () => {
    const report = createDemoReport();

    expect(readFileSync("examples/demo/patchdrill-demo.md", "utf8")).toBe(renderMarkdown(report));
    expect(readFileSync("examples/demo/patchdrill-demo.json", "utf8")).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(readFileSync("examples/demo/patchdrill-demo.sarif", "utf8")).toBe(renderSarif(report));
    expect(readFileSync("examples/demo/patchdrill-demo.html", "utf8")).toBe(renderHtml(report));
  });

  it("keeps committed risky PR demo artifacts synchronized with the demo renderer", () => {
    const report = createDemoReport("risky-agent-pr");

    expect(readFileSync("examples/risky-agent-pr/patchdrill-demo.md", "utf8")).toBe(renderMarkdown(report));
    expect(readFileSync("examples/risky-agent-pr/patchdrill-demo.json", "utf8")).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(readFileSync("examples/risky-agent-pr/patchdrill-demo.sarif", "utf8")).toBe(renderSarif(report));
    expect(readFileSync("examples/risky-agent-pr/patchdrill-demo.html", "utf8")).toBe(renderHtml(report));
  });
});

function readScore(contents: string, label: string): number {
  const match = new RegExp(`${label}: \\*\\*(\\d+)/100\\*\\*`).exec(contents);
  if (!match?.[1]) throw new Error(`Missing score: ${label}`);
  return Number.parseInt(match[1], 10);
}
