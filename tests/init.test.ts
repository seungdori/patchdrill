import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { policyPackNames, policyTemplate, workflowTemplate, writeGitHubWorkflow, writePolicyFile } from "../src/init.js";
import { loadPolicy } from "../src/policy.js";

const tempDirs: string[] = [];

describe("init", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates a PR-ready workflow with comments, SARIF, and artifacts", () => {
    const workflow = workflowTemplate();

    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("security-events: write");
    expect(workflow).toContain("patchdrill/patchdrill@v0");
    expect(workflow).toContain('pr-comment: "true"');
    expect(workflow).toContain("steps.patchdrill.outputs.report-sarif");
    expect(workflow).toContain("steps.patchdrill.outputs.report-html");
    expect(workflow).toContain("html: patchdrill-dashboard.html");
    expect(workflow).toContain("github/codeql-action/upload-sarif@v3");
    expect(workflow).toContain("actions/upload-artifact@v4");
  });

  it("writes the workflow to the standard GitHub Actions path", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-init-"));
    tempDirs.push(root);

    const workflowPath = writeGitHubWorkflow(root);

    expect(workflowPath).toBe(join(root, ".github", "workflows", "patchdrill.yml"));
    expect(readFileSync(workflowPath, "utf8")).toBe(workflowTemplate());
  });

  it("writes a default policy file", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-init-"));
    tempDirs.push(root);

    const policyPath = writePolicyFile(root);

    expect(policyPath).toBe(join(root, ".patchdrill.yml"));
    expect(readFileSync(policyPath, "utf8")).toBe(policyTemplate());
    expect(policyTemplate()).toContain("agent-policy-review");
  });

  it("generates loadable built-in policy packs", () => {
    for (const pack of policyPackNames) {
      const root = mkdtempSync(join(tmpdir(), `patchdrill-init-${pack}-`));
      tempDirs.push(root);

      writePolicyFile(root, false, pack);
      const loaded = loadPolicy(root);

      expect(readFileSync(join(root, ".patchdrill.yml"), "utf8")).toBe(policyTemplate(pack));
      expect(loaded.policy.rules.length).toBeGreaterThan(0);
    }
    expect(policyTemplate("regulated")).toContain("payments-owner-review");
    expect(policyTemplate("agentic")).toContain("mcp-tool-review");
  });
});
