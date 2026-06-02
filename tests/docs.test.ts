import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDemoReport } from "../src/demo.js";
import { checkMarkdownLinks } from "../src/markdown-links.js";
import { renderHtml, renderMarkdown, renderSarif, renderSummaryMarkdown } from "../src/report.js";
import { schemaFileName, schemaNames } from "../src/schema.js";

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

  it("keeps the README focused on the proof-layer product boundary", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("deterministic proof layer between code review and CI");
    expect(readme).toContain("AI PR reviewer");
    expect(readme).toContain("Traditional CI");
    expect(readme).toContain("Proof Pack");
    expect(readme).toContain("[docs/PROOF_PACKS.md](docs/PROOF_PACKS.md)");
    expect(readme).toContain("[docs/RULE_CATALOG.md](docs/RULE_CATALOG.md)");
  });

  it("keeps the public rule catalog aligned with built-in static risk rules", () => {
    const riskSource = readFileSync("src/risk.ts", "utf8");
    const catalog = readFileSync("docs/RULE_CATALOG.md", "utf8");
    const ruleIds = [...riskSource.matchAll(/ruleId: "([^"]+)"/g)].map((match) => match[1]);
    const missing = [...new Set(ruleIds)].filter((ruleId) => !catalog.includes(`\`${ruleId}\``));

    expect(missing).toEqual([]);
  });

  it("documents every public JSON Schema file", () => {
    const readme = readFileSync("README.md", "utf8");
    const schemaDocs = readFileSync("docs/SCHEMAS.md", "utf8");

    for (const name of schemaNames) {
      expect(readme).toContain(`patchdrill schema ${name}`);
      expect(schemaDocs).toContain(`patchdrill schema ${name}`);
      expect(schemaDocs).toContain(schemaFileName(name));
    }
  });

  it("keeps public Markdown local links valid", () => {
    expect(checkMarkdownLinks(process.cwd()).failures).toEqual([]);
  });

  it("keeps committed demo artifacts synchronized with the demo renderer", () => {
    const report = createDemoReport();

    expect(readFileSync("examples/demo/patchdrill-demo-summary.md", "utf8")).toBe(renderSummaryMarkdown(report));
    expect(readFileSync("examples/demo/patchdrill-demo.md", "utf8")).toBe(renderMarkdown(report));
    expect(readFileSync("examples/demo/patchdrill-demo.json", "utf8")).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(readFileSync("examples/demo/patchdrill-demo.sarif", "utf8")).toBe(renderSarif(report));
    expect(readFileSync("examples/demo/patchdrill-demo.html", "utf8")).toBe(renderHtml(report));
  });

  it("keeps committed risky PR demo artifacts synchronized with the demo renderer", () => {
    const report = createDemoReport("risky-agent-pr");

    expect(readFileSync("examples/risky-agent-pr/patchdrill-demo-summary.md", "utf8")).toBe(renderSummaryMarkdown(report));
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
