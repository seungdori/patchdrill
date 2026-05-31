import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workflowTemplate, writeGitHubWorkflow } from "../src/init.js";

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
    expect(workflow).toContain("actions/github-script@v9");
    expect(workflow).toContain("PATCHDRILL_MARKER");
    expect(workflow).toContain("github.rest.issues.updateComment");
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
});
