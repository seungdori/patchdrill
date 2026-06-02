import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMarkdownLinks } from "./markdown-links.js";

export type ReleaseCheckStatus = "pass" | "warn" | "fail";

export interface ReleaseCheck {
  status: ReleaseCheckStatus;
  title: string;
  detail: string;
  remediation?: string;
}

export interface ReleaseReadinessSummary {
  status: "pass" | "fail";
  ok: boolean;
  passCount: number;
  warnCount: number;
  failCount: number;
}

export function checkReleaseReadiness(root: string): ReleaseCheck[] {
  const pkg = readPackageJson(root);
  const releaseWorkflow = readOptional(root, ".github/workflows/release.yml");
  const action = readOptional(root, "action.yml");
  const readme = readOptional(root, "README.md");
  const ci = readOptional(root, ".github/workflows/ci.yml");
  const markdownLinks = checkMarkdownLinks(root);
  const packageFiles = readStringArray(pkg?.files);
  const keywords = readStringArray(pkg?.keywords);

  return [
    checkBoolean(Boolean(pkg), "package.json", "package.json is present.", "Add package.json before publishing."),
    checkBoolean(pkg?.name === "patchdrill", "Package name", `name is ${pkg?.name ?? "missing"}.`, "Set package.json name to patchdrill."),
    checkBoolean(isSemverLike(pkg?.version), "Package version", `version is ${pkg?.version ?? "missing"}.`, "Set a valid semver package version."),
    checkBoolean(pkg?.bin?.patchdrill === "./dist/cli.js", "CLI bin", `bin.patchdrill is ${pkg?.bin?.patchdrill ?? "missing"}.`, "Point bin.patchdrill at ./dist/cli.js."),
    checkBoolean(pkg?.scripts?.prepare === "npm run build", "Prepare script", "prepare builds the TypeScript CLI for git installs.", "Set scripts.prepare to npm run build."),
    checkBoolean(pkg?.scripts?.prepack === "npm run check", "Prepack script", "prepack runs the full local verification suite.", "Set scripts.prepack to npm run check."),
    checkPackageFiles(packageFiles),
    checkKeywords(keywords),
    checkBoolean(existsSync(join(root, "package-lock.json")), "npm lockfile", "package-lock.json is present for reproducible action installs.", "Commit package-lock.json."),
    checkBoolean(Boolean(action?.includes("runs:\n  using: composite")), "Composite action", "action.yml declares a composite action.", "Keep action.yml as a composite action."),
    checkBoolean(Boolean(action?.includes("node \"$GITHUB_ACTION_PATH/dist/cli.js\"")), "Action local build path", "action.yml runs the checked-out dist/cli.js.", "Run the built CLI from the checked-out action source."),
    checkBoolean(Boolean(releaseWorkflow?.includes("id-token: write")), "Release OIDC", "release.yml grants id-token: write for trusted publishing.", "Enable id-token: write in the release workflow."),
    checkBoolean(Boolean(releaseWorkflow?.includes("npm publish --access public --provenance")), "npm provenance publish", "release.yml publishes with npm provenance.", "Publish with npm publish --access public --provenance."),
    checkBoolean(Boolean(ci?.includes("npm pack --dry-run")), "Package dry-run CI", "CI verifies package contents with npm pack --dry-run.", "Add npm pack --dry-run to CI."),
    checkBoolean(Boolean(ci?.includes("release-check --format json")), "CI readiness dogfood", "CI runs patchdrill release-check --format json.", "Run patchdrill release-check --format json in CI after npm run check."),
    checkBoolean(
      Boolean(releaseWorkflow?.includes("release-check --format json")),
      "Release readiness dogfood",
      "release.yml runs patchdrill release-check --format json before publishing.",
      "Run patchdrill release-check --format json in the release workflow before npm publish."
    ),
    checkBoolean(Boolean(readme?.includes("npx --yes github:seungdori/patchdrill")), "GitHub install path", "README documents the pre-npm GitHub install path.", "Document npx --yes github:seungdori/patchdrill."),
    checkBoolean(Boolean(readme?.includes("npx patchdrill")), "npm install path", "README documents the future npm install path.", "Document npx patchdrill."),
    checkBoolean(existsSync(join(root, "docs", "CASE_STUDIES.md")), "Case studies", "docs/CASE_STUDIES.md is present for launch evaluation.", "Add docs/CASE_STUDIES.md with representative Proof Pack cases."),
    checkBoolean(existsSync(join(root, "docs", "STACK_COVERAGE.md")), "Stack coverage matrix", "docs/STACK_COVERAGE.md is present.", "Add docs/STACK_COVERAGE.md with fixture-backed coverage claims."),
    checkBoolean(
      existsSync(join(root, "examples", "case-studies", "README.md")),
      "Case study examples",
      "examples/case-studies/README.md points readers to concrete demo artifacts.",
      "Add examples/case-studies/README.md with demo artifact links."
    ),
    checkBoolean(
      markdownLinks.summary.failureCount === 0,
      "Markdown local links",
      `Checked ${markdownLinks.summary.linkCount} local link${markdownLinks.summary.linkCount === 1 ? "" : "s"} across ${markdownLinks.summary.fileCount} Markdown file${markdownLinks.summary.fileCount === 1 ? "" : "s"}.`,
      markdownLinks.failures[0]
        ? `Fix ${markdownLinks.failures[0].file}:${markdownLinks.failures[0].line} -> ${markdownLinks.failures[0].target}: ${markdownLinks.failures[0].reason}`
        : "Fix broken local Markdown links before release."
    ),
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
  return summarizeReleaseReadiness(checks).failCount > 0;
}

export function renderReleaseReadiness(checks: ReleaseCheck[]): string {
  const summary = summarizeReleaseReadiness(checks);
  const lines = [
    `PatchDrill Release Check - ${summary.status.toUpperCase()} (${summary.failCount} blocker${summary.failCount === 1 ? "" : "s"}, ${summary.warnCount} warning${summary.warnCount === 1 ? "" : "s"}, ${summary.passCount} pass)`,
    ""
  ];
  for (const check of checks) {
    lines.push(`- [${check.status.toUpperCase()}] ${check.title}: ${check.detail}`);
    if (check.remediation) lines.push(`  Next: ${check.remediation}`);
  }
  return `${lines.join("\n")}\n`;
}

export function summarizeReleaseReadiness(checks: ReleaseCheck[]): ReleaseReadinessSummary {
  const failCount = checks.filter((check) => check.status === "fail").length;
  return {
    status: failCount > 0 ? "fail" : "pass",
    ok: failCount === 0,
    passCount: checks.filter((check) => check.status === "pass").length,
    warnCount: checks.filter((check) => check.status === "warn").length,
    failCount
  };
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
      files?: unknown;
      keywords?: unknown;
    }
  | undefined {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      files?: unknown;
      keywords?: unknown;
    };
  } catch {
    return undefined;
  }
}

function checkPackageFiles(files: string[]): ReleaseCheck {
  const required = [
    "dist",
    "schemas",
    "docs",
    "examples",
    "fixtures",
    ".patchdrill.yml",
    "README.md",
    "LICENSE",
    "action.yml",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "SECURITY.md"
  ];
  const missing = required.filter((entry) => !files.includes(entry));
  return {
    status: missing.length === 0 ? "pass" : "fail",
    title: "Package file allowlist",
    detail:
      missing.length === 0
        ? "package.json files includes the CLI build, schemas, docs, examples, fixtures, action metadata, and release docs."
        : `package.json files is missing ${missing.join(", ")}.`,
    ...(missing.length > 0 ? { remediation: `Add ${missing.join(", ")} to package.json files before release.` } : {})
  };
}

function checkKeywords(keywords: string[]): ReleaseCheck {
  const required = ["ai-coding", "code-review", "sarif", "github-actions", "supply-chain"];
  const missing = required.filter((keyword) => !keywords.includes(keyword));
  return {
    status: missing.length === 0 ? "pass" : "fail",
    title: "Package discoverability keywords",
    detail:
      missing.length === 0
        ? `package.json keywords include launch-critical discovery terms: ${required.join(", ")}.`
        : `package.json keywords is missing ${missing.join(", ")}.`,
    ...(missing.length > 0 ? { remediation: `Add ${missing.join(", ")} to package.json keywords.` } : {})
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
