import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDemoReport, type DemoScenario } from "./demo.js";
import { checkMarkdownLinks } from "./markdown-links.js";
import { renderHtml, renderMarkdown, renderSarif, renderSummaryMarkdown } from "./report.js";
import { schemaFileName, schemaNames, type SchemaName } from "./schema.js";
import { renderStackCoverageMarkdown } from "./stack-coverage.js";

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

export interface ReleaseReadinessReport {
  schemaVersion: "1";
  ok: boolean;
  summary: ReleaseReadinessSummary;
  checks: ReleaseCheck[];
}

export function checkReleaseReadiness(root: string): ReleaseCheck[] {
  const pkg = readPackageJson(root);
  const releaseWorkflow = readOptional(root, ".github/workflows/release.yml");
  const action = readOptional(root, "action.yml");
  const readme = readOptional(root, "README.md");
  const ci = readOptional(root, ".github/workflows/ci.yml");
  const pullRequestTemplate = readOptional(root, ".github/pull_request_template.md");
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
    ...checkSchemaContracts(root, readme, readOptional(root, "docs/SCHEMAS.md")),
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
    checkBoolean(
      Boolean(containsInOrder(ci, ["Run PatchDrill", "--evidence patchdrill-evidence.json", "--json patchdrill-report.json", "verify --evidence patchdrill-evidence.json", "actions/upload-artifact"])),
      "CI evidence verification",
      "CI writes JSON-backed PatchDrill evidence and verifies the generated manifest before uploading Proof Pack artifacts.",
      "Run patchdrill scan with --evidence and --json, then verify --evidence patchdrill-evidence.json before artifact upload."
    ),
    checkBoolean(
      Boolean(containsInOrder(action, ['--evidence "$PATCHDRILL_EVIDENCE"', '--json "$PATCHDRILL_JSON"', "Refresh evidence manifest", 'verify --evidence "$PATCHDRILL_EVIDENCE"', "Export report paths"])),
      "Action evidence verification",
      "The composite action writes JSON-backed evidence, refreshes the manifest, and verifies it before exporting artifact paths.",
      "Pass --json with --evidence and verify the evidence manifest inside action.yml before reporting output paths."
    ),
    checkBoolean(
      Boolean(containsInOrder(releaseWorkflow, ["release-evidence.json", "--json .patchdrill/release.json", "--run", "verify --evidence .patchdrill/release-evidence.json", "npm pack --dry-run"])),
      "Release Proof Pack smoke",
      "release.yml runs required verification, generates a JSON-backed release Proof Pack smoke bundle, and verifies it before npm packaging.",
      "Generate a release Proof Pack with scan --run --evidence --json and verify it before npm pack --dry-run."
    ),
    checkPullRequestTemplate(pullRequestTemplate),
    checkReadmeProofPackQuickstart(readme),
    checkBoolean(Boolean(readme?.includes("npx --yes github:seungdori/patchdrill")), "GitHub install path", "README documents the from-source GitHub install path.", "Document npx --yes github:seungdori/patchdrill."),
    checkBoolean(Boolean(readme?.includes("npx --yes patchdrill")) && Boolean(readme?.includes("npm install -g patchdrill")), "npm install path", "README documents the published npm install path.", "Document npx --yes patchdrill and npm install -g patchdrill."),
    checkBoolean(existsSync(join(root, "docs", "CASE_STUDIES.md")), "Case studies", "docs/CASE_STUDIES.md is present for launch evaluation.", "Add docs/CASE_STUDIES.md with representative Proof Pack cases."),
    checkStackCoverageMatrix(root),
    checkStackFixtureCorpus(root),
    checkBoolean(
      existsSync(join(root, "examples", "case-studies", "README.md")),
      "Case study examples",
      "examples/case-studies/README.md points readers to concrete demo artifacts.",
      "Add examples/case-studies/README.md with demo artifact links."
    ),
    checkDemoArtifacts(root),
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

export function createReleaseReadinessReport(checks: ReleaseCheck[]): ReleaseReadinessReport {
  const summary = summarizeReleaseReadiness(checks);
  return {
    schemaVersion: "1",
    ok: summary.ok,
    summary,
    checks
  };
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

function checkSchemaContracts(root: string, readme: string | undefined, schemaDocs: string | undefined): ReleaseCheck[] {
  return schemaNames.map((name) => checkSchemaContract(root, name, readme, schemaDocs));
}

function checkPullRequestTemplate(contents: string | undefined): ReleaseCheck {
  const required = [
    "npm run check",
    "node dist/cli.js scan",
    "--evidence patchdrill-evidence.json",
    "--summary-markdown patchdrill-summary.md",
    "--markdown patchdrill-report.md",
    "--json patchdrill-report.json",
    "--sarif patchdrill.sarif",
    "--html patchdrill-dashboard.html",
    "--run",
    "node dist/cli.js verify --evidence patchdrill-evidence.json",
    "npm pack --dry-run",
    "Report/schema compatibility impact"
  ];
  const missing = required.filter((needle) => !contents?.includes(needle));
  if (!containsInOrder(contents, ["node dist/cli.js scan", "--run", "node dist/cli.js verify --evidence patchdrill-evidence.json", "npm pack --dry-run"])) {
    missing.push("verification command order");
  }
  return {
    status: missing.length === 0 ? "pass" : "fail",
    title: "Pull request Proof Pack template",
    detail:
      missing.length === 0
        ? "pull_request_template.md asks contributors to run check, generate and verify a full evidence-backed Proof Pack, package dry-run, and document compatibility risk notes."
        : `pull_request_template.md is missing ${missing.join(", ")}.`,
    ...(missing.length > 0
      ? {
          remediation:
            "Update .github/pull_request_template.md with scan --run --evidence, summary, Markdown, JSON, SARIF, HTML, verify, package dry-run, and compatibility notes."
        }
      : {})
  };
}

function checkReadmeProofPackQuickstart(contents: string | undefined): ReleaseCheck {
  const required = [
    "npx --yes patchdrill scan --base origin/main --run",
    "--evidence patchdrill-evidence.json",
    "--summary-markdown patchdrill-summary.md",
    "--markdown patchdrill-report.md",
    "--json patchdrill-report.json",
    "--sarif patchdrill.sarif",
    "--html patchdrill-dashboard.html",
    "npx --yes patchdrill verify --evidence patchdrill-evidence.json",
    "patchdrill scan --base origin/main --run",
    "patchdrill verify --evidence patchdrill-evidence.json"
  ];
  const missing = required.filter((needle) => !contents?.includes(needle));
  return {
    status: missing.length === 0 ? "pass" : "fail",
    title: "README Proof Pack quickstart",
    detail:
      missing.length === 0
        ? "README first-run and Quickstart commands generate and verify evidence-backed Proof Packs."
        : `README Proof Pack quickstart is missing ${missing.join(", ")}.`,
    ...(missing.length > 0
      ? {
          remediation:
            "Update README first-run and Quickstart examples with scan --run --evidence, summary, Markdown, JSON, SARIF, HTML, and verify commands."
        }
      : {})
  };
}

function checkStackCoverageMatrix(root: string): ReleaseCheck {
  const path = join(root, "docs", "STACK_COVERAGE.md");
  if (!existsSync(path)) {
    return {
      status: "fail",
      title: "Stack coverage matrix",
      detail: "docs/STACK_COVERAGE.md is missing.",
      remediation: "Add docs/STACK_COVERAGE.md with fixture-backed coverage claims."
    };
  }
  const actual = readFileSync(path, "utf8");
  const expected = renderStackCoverageMarkdown();
  return {
    status: actual === expected ? "pass" : "fail",
    title: "Stack coverage matrix",
    detail:
      actual === expected
        ? "docs/STACK_COVERAGE.md is synchronized with the fixture-backed stack coverage source."
        : "docs/STACK_COVERAGE.md is not synchronized with src/stack-coverage.ts.",
    ...(actual === expected ? {} : { remediation: "Regenerate docs/STACK_COVERAGE.md from renderStackCoverageMarkdown()." })
  };
}

function checkStackFixtureCorpus(root: string): ReleaseCheck {
  const fixturesRoot = join(root, "fixtures", "stacks");
  if (!existsSync(fixturesRoot)) {
    return {
      status: "fail",
      title: "Stack fixture corpus",
      detail: "fixtures/stacks is missing.",
      remediation: "Add fixture-backed repository shapes under fixtures/stacks before release."
    };
  }
  let fixturePaths: string[];
  try {
    fixturePaths = readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(fixturesRoot, entry.name, "fixture.json"))
      .filter((path) => existsSync(path))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    fixturePaths = [];
  }
  const failures: string[] = [];
  for (const path of fixturePaths) {
    const relativePath = path.slice(root.length).replace(/^\//, "");
    try {
      validateStackFixture(JSON.parse(readFileSync(path, "utf8")), relativePath, failures);
    } catch {
      failures.push(`${relativePath} valid JSON`);
    }
  }
  if (fixturePaths.length < 20) failures.push("at least 20 stack fixtures");
  return {
    status: failures.length === 0 ? "pass" : "fail",
    title: "Stack fixture corpus",
    detail:
      failures.length === 0
        ? `Validated ${fixturePaths.length} stack fixture contract${fixturePaths.length === 1 ? "" : "s"} under fixtures/stacks.`
        : `Stack fixture corpus is missing ${failures.join(", ")}.`,
    ...(failures.length > 0 ? { remediation: `Fix ${failures.join(", ")} before release.` } : {})
  };
}

function checkDemoArtifacts(root: string): ReleaseCheck {
  const failures: string[] = [];
  const scenarios: { scenario: DemoScenario; directory: string }[] = [
    { scenario: "review-ready", directory: "examples/demo" },
    { scenario: "risky-agent-pr", directory: "examples/risky-agent-pr" }
  ];

  for (const { scenario, directory } of scenarios) {
    const report = createDemoReport(scenario);
    const expected = new Map([
      [`${directory}/patchdrill-demo-summary.md`, renderSummaryMarkdown(report)],
      [`${directory}/patchdrill-demo.md`, renderMarkdown(report)],
      [`${directory}/patchdrill-demo.json`, `${JSON.stringify(report, null, 2)}\n`],
      [`${directory}/patchdrill-demo.sarif`, renderSarif(report)],
      [`${directory}/patchdrill-demo.html`, renderHtml(report)]
    ]);

    for (const [relativePath, expectedContents] of expected) {
      const absolutePath = join(root, relativePath);
      if (!existsSync(absolutePath)) {
        failures.push(`${relativePath} missing`);
        continue;
      }
      if (readFileSync(absolutePath, "utf8") !== expectedContents) {
        failures.push(`${relativePath} stale`);
      }
    }
  }

  const examples = failures.slice(0, 4);
  return {
    status: failures.length === 0 ? "pass" : "fail",
    title: "Demo artifacts",
    detail:
      failures.length === 0
        ? "Committed demo Proof Pack artifacts are synchronized with the current renderers."
        : `Committed demo artifacts are out of date: ${examples.join(", ")}${failures.length > examples.length ? ", ..." : ""}.`,
    ...(failures.length > 0 ? { remediation: "Regenerate examples/demo and examples/risky-agent-pr with patchdrill demo before release." } : {})
  };
}

function validateStackFixture(value: unknown, path: string, failures: string[]): void {
  if (!isRecord(value)) {
    failures.push(`${path} object`);
    return;
  }
  if (typeof value.name !== "string" || !value.name.trim()) failures.push(`${path} name`);
  if (!isStringArray(value.expectedEcosystems)) failures.push(`${path} expectedEcosystems`);
  if (!isStringArray(value.expectedCommands)) failures.push(`${path} expectedCommands`);
  if (!isFixtureFileArray(value.baseFiles)) failures.push(`${path} baseFiles`);
  if (!isFixtureFileArray(value.changeFiles)) failures.push(`${path} changeFiles`);
}

function isFixtureFileArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        file.path.trim().length > 0 &&
        Array.isArray(file.lines) &&
        file.lines.every((line) => typeof line === "string")
    )
  );
}

function checkSchemaContract(root: string, name: SchemaName, readme: string | undefined, schemaDocs: string | undefined): ReleaseCheck {
  const fileName = schemaFileName(name);
  const relativePath = `schemas/${fileName}`;
  const schemaPath = join(root, relativePath);
  const missing: string[] = [];
  const parsed = readSchemaJson(schemaPath, missing, relativePath);
  if (parsed) {
    if (parsed.$schema !== "https://json-schema.org/draft/2020-12/schema") missing.push(`${relativePath} draft 2020-12 marker`);
    if (parsed.$id !== `https://patchdrill.dev/schemas/${fileName}`) missing.push(`${relativePath} $id`);
    if (typeof parsed.title !== "string" || !parsed.title.trim()) missing.push(`${relativePath} title`);
    if (parsed.type !== "object") missing.push(`${relativePath} object root type`);
    if (name === "report") {
      if (!isStringArray(parsed.required) || !parsed.required.includes("verification")) missing.push(`${relativePath} required verification`);
      if (!isRecord(parsed.properties) || !isRecord(parsed.properties.verification)) missing.push(`${relativePath} verification property`);
    }
  }
  if (!readme?.includes(`patchdrill schema ${name}`)) missing.push(`README schema command ${name}`);
  if (!schemaDocs?.includes(`patchdrill schema ${name}`)) missing.push(`docs/SCHEMAS.md command ${name}`);
  if (!schemaDocs?.includes(fileName)) missing.push(`docs/SCHEMAS.md reference ${fileName}`);
  if (name === "report" && !schemaDocs?.includes("required computed `verification`")) missing.push("docs/SCHEMAS.md required verification");
  return {
    status: missing.length === 0 ? "pass" : "fail",
    title: schemaCheckTitle(name),
    detail:
      missing.length === 0
        ? `${fileName} is valid draft 2020-12 JSON, exposed by patchdrill schema ${name}, and documented for automation consumers.`
        : `${name} schema contract is missing ${missing.join(", ")}.`,
    ...(missing.length > 0 ? { remediation: `Add ${missing.join(", ")} before release.` } : {})
  };
}

function readSchemaJson(
  path: string,
  failures: string[],
  label: string
): { $schema?: unknown; $id?: unknown; title?: unknown; type?: unknown; required?: unknown; properties?: unknown } | undefined {
  if (!existsSync(path)) {
    failures.push(`${label} file`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as { $schema?: unknown; $id?: unknown; title?: unknown; type?: unknown; required?: unknown; properties?: unknown };
  } catch {
    failures.push(`${label} valid JSON`);
    return undefined;
  }
}

function schemaCheckTitle(name: SchemaName): string {
  if (name === "doctor") return "Doctor output schema";
  if (name === "release-check") return "Release-check output schema";
  return `${name[0]?.toUpperCase() ?? ""}${name.slice(1)} schema`;
}

function containsInOrder(contents: string | undefined, needles: string[]): boolean {
  if (!contents) return false;
  let cursor = 0;
  for (const needle of needles) {
    const index = contents.indexOf(needle, cursor);
    if (index < 0) return false;
    cursor = index + needle.length;
  }
  return true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
