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
    expect(report).toContain("- Verification evidence:");
    expect(report).toContain("| Required | Package | Command | Result | Reason |");
    expect(report).toContain("| yes | @acme/auth | `pnpm exec turbo run test --filter=@acme/auth` | passed |");
  });

  it("keeps the README hero demo asset wired", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("(docs/media/patchdrill-dashboard.png)");
    expect(existsSync("docs/media/patchdrill-dashboard.png")).toBe(true);
    // The VHS tape that regenerates the animated demo stays committed and reproducible.
    expect(existsSync("demo/patchdrill.tape")).toBe(true);
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

  it("keeps the public pull request checklist evidence-backed", () => {
    const template = readFileSync(".github/pull_request_template.md", "utf8");

    expect(template).toContain("node dist/cli.js scan");
    expect(template).toContain("--evidence patchdrill-evidence.json");
    expect(template).toContain("--summary-markdown patchdrill-summary.md");
    expect(template).toContain("--html patchdrill-dashboard.html");
    expect(template).toContain("node dist/cli.js verify --evidence patchdrill-evidence.json");
    expect(template).toContain("Report/schema compatibility impact");
  });

  it("keeps public Proof Pack workflow examples complete", () => {
    const readme = readFileSync("README.md", "utf8");
    const dashboardDocs = readFileSync("docs/DASHBOARD.md", "utf8");
    const sarifDocs = readFileSync("docs/SARIF.md", "utf8");
    const prCommentDocs = readFileSync("docs/PR_COMMENTS.md", "utf8");

    for (const docs of [readme, dashboardDocs, sarifDocs]) {
      expect(docs).toContain("--evidence patchdrill-evidence.json");
      expect(docs).toContain("--summary-markdown patchdrill-summary.md");
      expect(docs).toContain("--html patchdrill-dashboard.html");
      expect(docs).toContain("patchdrill verify --evidence patchdrill-evidence.json");
    }
    expect(readme).toContain("npx --yes github:seungdori/patchdrill verify --evidence patchdrill-evidence.json");
    expect(prCommentDocs).toContain("id: patchdrill");
    expect(prCommentDocs).toContain("evidence: patchdrill-evidence.json");
    expect(prCommentDocs).toContain("html: patchdrill-dashboard.html");
    expect(prCommentDocs).toContain('run: "true"');
    expect(prCommentDocs).toContain("actions/upload-artifact@v7");
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
