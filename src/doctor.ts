import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadCodeOwners } from "./codeowners.js";
import { loadPolicy } from "./policy.js";
import { discoverProjectSignals } from "./project.js";
import type { ProjectSignal } from "./types.js";

export type DoctorStatus = "pass" | "warn" | "info";

export interface DoctorCheck {
  status: DoctorStatus;
  title: string;
  detail: string;
  remediation?: string;
}

export interface DoctorReport {
  root: string;
  projectSignals: ProjectSignal[];
  checks: DoctorCheck[];
  suggestedCommands: string[];
}

export function inspectDoctor(root: string): DoctorReport {
  const projectSignals = discoverProjectSignals(root);
  const loadedPolicy = loadPolicy(root);
  const codeOwners = loadCodeOwners(root);
  const checks: DoctorCheck[] = [];

  checks.push(
    projectSignals.length > 0
      ? {
          status: "pass",
          title: "Project detection",
          detail: `${projectSignals.length} project signal${projectSignals.length === 1 ? "" : "s"} detected.`
        }
      : {
          status: "warn",
          title: "Project detection",
          detail: "No supported project manifests were detected.",
          remediation: "Run from the repository root or add a supported manifest such as package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, or build.gradle."
        }
  );

  checks.push(
    loadedPolicy.path
      ? {
          status: "pass",
          title: "Policy file",
          detail: `Using ${relativeDisplay(root, loadedPolicy.path)} with ${loadedPolicy.policy.rules.length} custom rule${loadedPolicy.policy.rules.length === 1 ? "" : "s"}.`
        }
      : {
          status: "warn",
          title: "Policy file",
          detail: "No .patchdrill.yml/json policy file was found.",
          remediation: "Run patchdrill init --policy to create a reviewable starter policy."
        }
  );

  checks.push(
    codeOwners
      ? {
          status: "pass",
          title: "CODEOWNERS",
          detail: `${codeOwners.path} has ${codeOwners.rules.length} owner rule${codeOwners.rules.length === 1 ? "" : "s"}.`
        }
      : {
          status: "info",
          title: "CODEOWNERS",
          detail: "No CODEOWNERS file was found.",
          remediation: "Add CODEOWNERS if PatchDrill reports should show owner hints for sensitive files."
        }
  );

  checks.push(
    existsSync(join(root, ".github", "workflows"))
      ? {
          status: "pass",
          title: "GitHub workflows",
          detail: ".github/workflows is present, so PatchDrill can inspect workflow trust-boundary changes."
        }
      : {
          status: "info",
          title: "GitHub workflows",
          detail: "No .github/workflows directory was found.",
          remediation: "Run patchdrill init to add a PatchDrill workflow when the repository is ready for CI integration."
        }
  );

  checks.push(...nodeScriptChecks(projectSignals));

  return {
    root,
    projectSignals,
    checks,
    suggestedCommands: suggestedCommands(projectSignals, Boolean(loadedPolicy.path))
  };
}

export function renderDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("PatchDrill Doctor");
  lines.push(`Root: ${report.root}`);
  lines.push("");
  lines.push("Project signals:");
  if (report.projectSignals.length === 0) {
    lines.push("- none");
  } else {
    for (const signal of report.projectSignals) {
      lines.push(`- ${renderProjectSignal(signal)}`);
    }
  }
  lines.push("");
  lines.push("Readiness checks:");
  for (const check of report.checks) {
    lines.push(`- [${check.status.toUpperCase()}] ${check.title}: ${check.detail}`);
    if (check.remediation) lines.push(`  Next: ${check.remediation}`);
  }
  lines.push("");
  lines.push("Suggested next commands:");
  for (const command of report.suggestedCommands) {
    lines.push(`- ${command}`);
  }
  return `${lines.join("\n")}\n`;
}

function nodeScriptChecks(signals: ProjectSignal[]): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const nodeSignals = signals.filter((signal) => signal.ecosystem === "node");
  for (const signal of nodeSignals) {
    const scripts = signal.scripts ?? {};
    const scriptNames = Object.keys(scripts);
    if (scriptNames.length === 0) {
      checks.push({
        status: "warn",
        title: `Node scripts in ${signal.manifestPath}`,
        detail: "No package scripts were found, so PatchDrill cannot infer npm/pnpm/yarn/bun verification commands from script names.",
        remediation: "Add at least a test, build, lint, or typecheck script."
      });
      continue;
    }
    const testScript = firstMatchingScript(scriptNames, [/^test$/, /^test:/, /unit/]);
    checks.push(
      testScript
        ? {
            status: "pass",
            title: `Node test script in ${signal.manifestPath}`,
            detail: `Found ${testScript}.`
          }
        : {
            status: "warn",
            title: `Node test script in ${signal.manifestPath}`,
            detail: "No obvious test script was found.",
            remediation: "Add a test or test:unit script so PatchDrill can plan required verification for source changes."
          }
    );

    const staticScript = firstMatchingScript(scriptNames, [/typecheck/, /check:types/, /^lint$/, /^build$/]);
    checks.push(
      staticScript
        ? {
            status: "pass",
            title: `Node static/build script in ${signal.manifestPath}`,
            detail: `Found ${staticScript}.`
          }
        : {
            status: "info",
            title: `Node static/build script in ${signal.manifestPath}`,
            detail: "No lint, typecheck, or build script was found.",
            remediation: "Add one if static verification should appear in PatchDrill command plans."
          }
    );
  }
  return checks;
}

function firstMatchingScript(scriptNames: string[], patterns: RegExp[]): string | undefined {
  return scriptNames.find((script) => patterns.some((pattern) => pattern.test(script)));
}

function suggestedCommands(signals: ProjectSignal[], hasPolicy: boolean): string[] {
  const commands = ["patchdrill scan --base origin/main"];
  if (!hasPolicy) commands.push("patchdrill init --policy");
  commands.push(
    "patchdrill scan --base origin/main --run --evidence patchdrill-evidence.json --summary-markdown patchdrill-summary.md --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html"
  );
  if (signals.some((signal) => signal.ecosystem === "node")) commands.push("patchdrill release-check");
  return commands;
}

function renderProjectSignal(signal: ProjectSignal): string {
  const parts = [signal.ecosystem, signal.framework, signal.manifestPath, signal.packageManager, signal.taskRunner].filter(Boolean);
  return parts.join(" / ");
}

function relativeDisplay(root: string, path: string): string {
  const normalizedRoot = root.replaceAll("\\", "/");
  const normalizedPath = path.replaceAll("\\", "/");
  return normalizedPath.startsWith(`${normalizedRoot}/`) ? normalizedPath.slice(normalizedRoot.length + 1) : path;
}
