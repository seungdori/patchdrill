import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseCheckStatus = "pass" | "warn" | "fail";

export interface ReleaseCheck {
  status: ReleaseCheckStatus;
  title: string;
  detail: string;
  remediation?: string;
}

export function checkReleaseReadiness(root: string): ReleaseCheck[] {
  const pkg = readPackageJson(root);
  const releaseWorkflow = readOptional(root, ".github/workflows/release.yml");
  const action = readOptional(root, "action.yml");
  const readme = readOptional(root, "README.md");
  const ci = readOptional(root, ".github/workflows/ci.yml");

  return [
    checkBoolean(Boolean(pkg), "package.json", "package.json is present.", "Add package.json before publishing."),
    checkBoolean(pkg?.name === "patchdrill", "Package name", `name is ${pkg?.name ?? "missing"}.`, "Set package.json name to patchdrill."),
    checkBoolean(isSemverLike(pkg?.version), "Package version", `version is ${pkg?.version ?? "missing"}.`, "Set a valid semver package version."),
    checkBoolean(pkg?.bin?.patchdrill === "./dist/cli.js", "CLI bin", `bin.patchdrill is ${pkg?.bin?.patchdrill ?? "missing"}.`, "Point bin.patchdrill at ./dist/cli.js."),
    checkBoolean(pkg?.scripts?.prepare === "npm run build", "Prepare script", "prepare builds the TypeScript CLI for git installs.", "Set scripts.prepare to npm run build."),
    checkBoolean(pkg?.scripts?.prepack === "npm run check", "Prepack script", "prepack runs the full local verification suite.", "Set scripts.prepack to npm run check."),
    checkBoolean(existsSync(join(root, "package-lock.json")), "npm lockfile", "package-lock.json is present for reproducible action installs.", "Commit package-lock.json."),
    checkBoolean(Boolean(action?.includes("runs:\n  using: composite")), "Composite action", "action.yml declares a composite action.", "Keep action.yml as a composite action."),
    checkBoolean(Boolean(action?.includes("node \"$GITHUB_ACTION_PATH/dist/cli.js\"")), "Action local build path", "action.yml runs the checked-out dist/cli.js.", "Run the built CLI from the checked-out action source."),
    checkBoolean(Boolean(releaseWorkflow?.includes("id-token: write")), "Release OIDC", "release.yml grants id-token: write for trusted publishing.", "Enable id-token: write in the release workflow."),
    checkBoolean(Boolean(releaseWorkflow?.includes("npm publish --access public --provenance")), "npm provenance publish", "release.yml publishes with npm provenance.", "Publish with npm publish --access public --provenance."),
    checkBoolean(Boolean(ci?.includes("npm pack --dry-run")), "Package dry-run CI", "CI verifies package contents with npm pack --dry-run.", "Add npm pack --dry-run to CI."),
    checkBoolean(Boolean(readme?.includes("npx --yes github:seungdori/patchdrill")), "GitHub install path", "README documents the pre-npm GitHub install path.", "Document npx --yes github:seungdori/patchdrill."),
    checkBoolean(Boolean(readme?.includes("npx patchdrill")), "npm install path", "README documents the future npm install path.", "Document npx patchdrill."),
    checkBoolean(existsSync(join(root, "CHANGELOG.md")), "Changelog", "CHANGELOG.md is present.", "Add CHANGELOG.md before release."),
    checkBoolean(existsSync(join(root, "LICENSE")), "License", "LICENSE is present.", "Add a license before release."),
    checkBoolean(existsSync(join(root, "SECURITY.md")), "Security policy", "SECURITY.md is present.", "Add SECURITY.md before release."),
    {
      status: "warn",
      title: "npm Trusted Publisher",
      detail: "Trusted Publisher configuration must be verified in npm account settings; PatchDrill cannot confirm that locally.",
      remediation: "Configure npm trusted publishing for .github/workflows/release.yml before creating the first release."
    }
  ];
}

export function releaseReadinessHasFailures(checks: ReleaseCheck[]): boolean {
  return checks.some((check) => check.status === "fail");
}

export function renderReleaseReadiness(checks: ReleaseCheck[]): string {
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const lines = [`PatchDrill Release Check - ${failures === 0 ? "PASS" : "FAIL"} (${failures} blocker${failures === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"})`, ""];
  for (const check of checks) {
    lines.push(`- [${check.status.toUpperCase()}] ${check.title}: ${check.detail}`);
    if (check.remediation) lines.push(`  Next: ${check.remediation}`);
  }
  return `${lines.join("\n")}\n`;
}

function checkBoolean(ok: boolean, title: string, detail: string, remediation: string): ReleaseCheck {
  return {
    status: ok ? "pass" : "fail",
    title,
    detail,
    ...(ok ? {} : { remediation })
  };
}

function readPackageJson(root: string):
  | {
      name?: string;
      version?: string;
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    }
  | undefined {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };
  } catch {
    return undefined;
  }
}

function readOptional(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

function isSemverLike(value: string | undefined): boolean {
  return Boolean(value && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value));
}
