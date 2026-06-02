import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkReleaseReadiness, releaseReadinessHasFailures, renderReleaseReadiness, summarizeReleaseReadiness } from "../src/release-readiness.js";

const tempDirs: string[] = [];

describe("release readiness", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the repository release path free of local blockers", () => {
    const checks = checkReleaseReadiness(process.cwd());
    const rendered = renderReleaseReadiness(checks);
    const summary = summarizeReleaseReadiness(checks);

    expect(releaseReadinessHasFailures(checks)).toBe(false);
    expect(summary).toMatchObject({ status: "pass", ok: true, failCount: 0, warnCount: 1 });
    expect(rendered).toContain("PatchDrill Release Check - PASS");
    expect(rendered).toContain("[PASS] npm provenance publish");
    expect(rendered).toContain("[PASS] Package file allowlist");
    expect(rendered).toContain("[PASS] Package discoverability keywords");
    expect(rendered).toContain("[PASS] Policy schema");
    expect(rendered).toContain("[PASS] Report schema");
    expect(rendered).toContain("[PASS] Evidence schema");
    expect(rendered).toContain("[PASS] Doctor output schema");
    expect(rendered).toContain("[PASS] Release-check output schema");
    expect(rendered).toContain("[PASS] CI readiness dogfood");
    expect(rendered).toContain("[PASS] Release readiness dogfood");
    expect(rendered).toContain("[PASS] CI evidence verification");
    expect(rendered).toContain("[PASS] Action evidence verification");
    expect(rendered).toContain("[PASS] Release Proof Pack smoke");
    expect(rendered).toContain("[PASS] Case studies");
    expect(rendered).toContain("[PASS] Stack coverage matrix");
    expect(rendered).toContain("[PASS] Markdown local links");
    expect(rendered).toContain("[WARN] npm Trusted Publisher");
  });

  it("flags missing package and workflow release requirements", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-release-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "wrong", version: "0.1.0" }, null, 2), "utf8");

    const checks = checkReleaseReadiness(root);

    expect(releaseReadinessHasFailures(checks)).toBe(true);
    expect(checks.filter((check) => check.status === "fail").map((check) => check.title)).toContain("Package name");
    expect(checks.filter((check) => check.status === "fail").map((check) => check.title)).toContain("Policy schema");
    expect(checks.filter((check) => check.status === "fail").map((check) => check.title)).toContain("npm provenance publish");
  });
});
