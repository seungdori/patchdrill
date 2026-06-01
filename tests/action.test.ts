import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("composite action", () => {
  it("exposes the static HTML dashboard as an action input and output", () => {
    const action = readFileSync("action.yml", "utf8");

    expect(action).toContain("html:");
    expect(action).toContain("default: patchdrill-dashboard.html");
    expect(action).toContain("report-html:");
    expect(action).toContain("PATCHDRILL_HTML");
    expect(action).toContain('--html "$PATCHDRILL_HTML"');
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
});
