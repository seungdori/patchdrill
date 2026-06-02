import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("composite action", () => {
  it("exposes the static HTML dashboard as an action input and output", () => {
    const action = readFileSync("action.yml", "utf8");

    expect(action).toContain("html:");
    expect(action).toContain("default: patchdrill-dashboard.html");
    expect(action).toContain("dashboard-history:");
    expect(action).toContain("PATCHDRILL_DASHBOARD_HISTORY");
    expect(action).toContain("annotations:");
    expect(action).toContain("PATCHDRILL_ANNOTATIONS");
    expect(action).toContain('--github-annotations "${PATCHDRILL_ANNOTATIONS:-false}"');
    expect(action).toContain("evidence:");
    expect(action).toContain("PATCHDRILL_EVIDENCE");
    expect(action).toContain('--evidence "$PATCHDRILL_EVIDENCE"');
    expect(action).toContain("Refresh evidence manifest");
    expect(action).toContain('args=(evidence --json "$PATCHDRILL_JSON" --evidence "$PATCHDRILL_EVIDENCE")');
    expect(action).toContain("Verify evidence manifest");
    expect(action).toContain('verify --evidence "$PATCHDRILL_EVIDENCE"');
    expect(action).toContain("report-evidence:");
    expect(action).toContain("write_output evidence");
    expect(action).toContain("summary:");
    expect(action).toContain("PATCHDRILL_SUMMARY");
    expect(action).toContain('--summary-markdown "$PATCHDRILL_SUMMARY"');
    expect(action).toContain("report-summary:");
    expect(action).toContain("write_output summary");
    expect(action).toContain("run-optional:");
    expect(action).toContain("PATCHDRILL_RUN_OPTIONAL");
    expect(action).toContain('--run "${PATCHDRILL_RUN:-false}"');
    expect(action).toContain('--run-optional "${PATCHDRILL_RUN_OPTIONAL:-false}"');
    expect(action).not.toContain('[ "$PATCHDRILL_RUN" = "true" ]');
    expect(action).toContain("report-html:");
    expect(action).toContain("PATCHDRILL_HTML");
    expect(action).toContain('--html "$PATCHDRILL_HTML"');
    expect(action).toContain("args=(dashboard)");
    expect(action).toContain('args+=(--json "$PATCHDRILL_JSON" --output "$PATCHDRILL_HTML")');
    expect(action).toContain("write_output html");
  });

  it("runs from the checked-out action source instead of the npm registry", () => {
    const action = readFileSync("action.yml", "utf8");

    expect(action).toContain("working-directory: ${{ github.action_path }}");
    expect(action).toContain("run: npm ci --ignore-scripts");
    expect(action).toContain("run: npm run build");
    expect(action).toContain('node "$GITHUB_ACTION_PATH/dist/cli.js"');
    expect(action).not.toContain("npx patchdrill");
  });

  it("keeps action metadata parseable with dashboard history support", () => {
    const action = parse(readFileSync("action.yml", "utf8")) as {
      inputs?: Record<string, { description?: string; default?: string }>;
      outputs?: Record<string, { description?: string; value?: string }>;
      runs?: { steps?: Array<{ name?: string; if?: string; run?: string; env?: Record<string, string>; with?: Record<string, string> }> };
    };

    expect(action.inputs?.["dashboard-history"]?.default).toBe("");
    expect(action.inputs?.annotations?.default).toBe("true");
    expect(action.inputs?.evidence?.default).toBe("patchdrill-evidence.json");
    expect(action.outputs?.["report-evidence"]?.value).toBe("${{ steps.paths.outputs.evidence }}");
    expect(action.inputs?.summary?.default).toBe("patchdrill-summary.md");
    expect(action.outputs?.["report-summary"]?.value).toBe("${{ steps.paths.outputs.summary }}");
    const runStep = action.runs?.steps?.find((step) => step.name === "Run PatchDrill");
    expect(runStep?.run).toContain('--run "${PATCHDRILL_RUN:-false}"');
    expect(runStep?.run).toContain('--run-optional "${PATCHDRILL_RUN_OPTIONAL:-false}"');
    expect(runStep?.run).toContain('--github-annotations "${PATCHDRILL_ANNOTATIONS:-false}"');
    const summaryStep = action.runs?.steps?.find((step) => step.name === "Write step summary");
    expect(summaryStep?.if).toBeUndefined();
    expect(summaryStep?.env?.PATCHDRILL_STEP_SUMMARY).toBe("${{ inputs.step-summary }}");
    expect(summaryStep?.run).toContain("bool_true");
    expect(summaryStep?.run).toContain("Invalid boolean input for step-summary");
    expect(summaryStep?.run).toContain('cat -- "$PATCHDRILL_SUMMARY"');
    const commentStep = action.runs?.steps?.find((step) => step.name === "Upsert PR comment");
    expect(commentStep?.if).toBe("github.event_name == 'pull_request'");
    expect(JSON.stringify(commentStep)).toContain("PATCHDRILL_SUMMARY");
    expect(commentStep?.env?.PATCHDRILL_PR_COMMENT).toBe("${{ inputs.pr-comment }}");
    expect(commentStep?.with?.script).toContain('boolTrue("PATCHDRILL_PR_COMMENT")');
    expect(commentStep?.with?.script).toContain("Invalid boolean input for pr-comment");
    expect(commentStep?.with?.script).toContain("PatchDrill PR comment skipped");
    expect(commentStep?.with?.script).toContain("try {");
    const historyStep = action.runs?.steps?.find((step) => step.name === "Render dashboard history");
    expect(historyStep?.if).toBe("inputs.dashboard-history != ''");
    expect(historyStep?.run).toContain('args+=(--json "$PATCHDRILL_JSON" --output "$PATCHDRILL_HTML")');
    const refreshStep = action.runs?.steps?.find((step) => step.name === "Refresh evidence manifest");
    expect(refreshStep?.run).toContain('args=(evidence --json "$PATCHDRILL_JSON" --evidence "$PATCHDRILL_EVIDENCE")');
    expect(refreshStep?.run).toContain('args+=(--html "$PATCHDRILL_HTML")');
    const verifyStep = action.runs?.steps?.find((step) => step.name === "Verify evidence manifest");
    expect(verifyStep?.run).toContain('verify --evidence "$PATCHDRILL_EVIDENCE"');
  });
});
