import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, CommandPlan, ProjectSignal, WorkspacePackage } from "./types.js";

export function planCommands(root: string, changedFiles: ChangedFile[], signals: ProjectSignal[]): CommandPlan[] {
  const plans: CommandPlan[] = [];
  const paths = changedFiles.map((file) => file.path);

  for (const signal of signals) {
    if (signal.ecosystem === "node" && touchesNode(paths)) {
      const workspacePlanCount = addNodeWorkspacePlans(plans, paths, signal);
      if (workspacePlanCount === 0) addNodePlans(plans, signal);
    }
    if (signal.ecosystem === "python" && touchesPython(paths, root)) {
      pushUnique(plans, {
        id: "python-tests",
        label: "Python tests",
        command: "python -m pytest",
        reason: "Python files or Python project metadata changed.",
        ecosystem: "python",
        required: true
      });
      pushUnique(plans, {
        id: "python-compile",
        label: "Python syntax compile",
        command: "python -m compileall .",
        reason: "Compile Python files to catch syntax errors without needing project-specific tooling.",
        ecosystem: "python",
        required: true
      });
    }
    if (signal.ecosystem === "rust" && touches(paths, [".rs", "Cargo.toml", "Cargo.lock"])) {
      pushUnique(plans, {
        id: "rust-tests",
        label: "Rust tests",
        command: "cargo test --all-targets",
        reason: "Rust source or Cargo metadata changed.",
        ecosystem: "rust",
        required: true
      });
      pushUnique(plans, {
        id: "rust-clippy",
        label: "Rust clippy",
        command: "cargo clippy --all-targets -- -D warnings",
        reason: "Rust changes should pass linting before merge.",
        ecosystem: "rust",
        required: false
      });
    }
    if (signal.ecosystem === "go" && touches(paths, [".go", "go.mod", "go.sum"])) {
      pushUnique(plans, {
        id: "go-tests",
        label: "Go tests",
        command: "go test ./...",
        reason: "Go source or module metadata changed.",
        ecosystem: "go",
        required: true
      });
      pushUnique(plans, {
        id: "go-vet",
        label: "Go vet",
        command: "go vet ./...",
        reason: "Static checks catch common Go regressions.",
        ecosystem: "go",
        required: false
      });
    }
    if (signal.ecosystem === "java" && touchesJava(paths, root)) {
      pushUnique(plans, {
        id: "java-tests",
        label: "Java tests",
        command: existsSync(join(root, "mvnw")) ? "./mvnw test" : existsSync(join(root, "gradlew")) ? "./gradlew test" : "mvn test",
        reason: "Java/Kotlin source or build metadata changed.",
        ecosystem: "java",
        required: true
      });
    }
    if (signal.ecosystem === "ruby" && touches(paths, [".rb", "Gemfile", "Gemfile.lock"])) {
      pushUnique(plans, {
        id: "ruby-tests",
        label: "Ruby tests",
        command: "bundle exec rake test",
        reason: "Ruby source or dependency metadata changed.",
        ecosystem: "ruby",
        required: true
      });
    }
    if (signal.ecosystem === "php" && touches(paths, [".php", "composer.json", "composer.lock"])) {
      pushUnique(plans, {
        id: "php-tests",
        label: "PHP tests",
        command: "composer test",
        reason: "PHP source or Composer metadata changed.",
        ecosystem: "php",
        required: true
      });
    }
    if (signal.ecosystem === "dotnet" && touches(paths, [".cs", ".fs", ".vb", ".csproj", ".sln"])) {
      pushUnique(plans, {
        id: "dotnet-tests",
        label: ".NET tests",
        command: "dotnet test",
        reason: ".NET source or project metadata changed.",
        ecosystem: "dotnet",
        required: true
      });
    }
    if (signal.ecosystem === "terraform" && paths.some((path) => path.endsWith(".tf") || path.endsWith(".tfvars"))) {
      pushUnique(plans, {
        id: "terraform-validate",
        label: "Terraform validate",
        command: "terraform fmt -check && terraform validate",
        reason: "Terraform configuration changed.",
        ecosystem: "terraform",
        required: true
      });
    }
    if (signal.ecosystem === "docker" && paths.some((path) => /(^|\/)(Dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/.test(path))) {
      pushUnique(plans, {
        id: "docker-build-check",
        label: "Docker build check",
        command: "docker build .",
        reason: "Container build files changed.",
        ecosystem: "docker",
        required: false
      });
    }
  }

  if (paths.some((path) => path.startsWith(".github/workflows/"))) {
    pushUnique(plans, {
      id: "workflow-review",
      label: "GitHub Actions review",
      command: "git diff -- .github/workflows",
      reason: "Workflow changes affect CI permissions and release behavior.",
      ecosystem: "github-actions",
      required: false
    });
  }

  return plans;
}

export function findAffectedWorkspacePackages(changedFiles: ChangedFile[], signals: ProjectSignal[]): WorkspacePackage[] {
  const affected = new Map<string, WorkspacePackage>();
  const paths = changedFiles.map((file) => file.path);
  for (const signal of signals) {
    if (signal.ecosystem !== "node") continue;
    for (const workspacePackage of affectedPackagesForSignal(paths, signal)) {
      affected.set(workspacePackage.path, workspacePackage);
    }
  }
  return [...affected.values()];
}

function addNodePlans(plans: CommandPlan[], signal: ProjectSignal): void {
  const scripts = signal.scripts ?? {};
  for (const script of ["typecheck", "lint", "test", "build"]) {
    if (!scripts[script]) continue;
    pushUnique(plans, {
      id: `node-${script}`,
      label: `Node ${script}`,
      command: nodeRun(signal.packageManager ?? "npm", script),
      reason: `package.json defines "${script}", and Node-related files changed.`,
      ecosystem: "node",
      required: script === "test" || script === "typecheck" || script === "build"
    });
  }
}

function addNodeWorkspacePlans(plans: CommandPlan[], paths: string[], signal: ProjectSignal): number {
  const affectedPackages = affectedPackagesForSignal(paths, signal);
  const directlyAffected = new Set(directlyAffectedPackagesForSignal(paths, signal).map((workspacePackage) => workspacePackage.path));
  const affectedNames = new Set(affectedPackages.map((workspacePackage) => workspacePackage.name));
  const rootWideChange = touchesRootWorkspaceMetadata(paths);
  let added = 0;
  for (const workspacePackage of affectedPackages) {
    for (const script of ["typecheck", "lint", "test", "build"]) {
      if (!workspacePackage.scripts[script]) continue;
      const plan: CommandPlan = {
        id: `node-workspace-${slug(workspacePackage.name)}-${script}`,
        label: `${workspacePackage.name} ${script}`,
        command: workspaceRun(signal.packageManager ?? "npm", workspacePackage.name, script),
        reason: workspaceReason(workspacePackage, script, directlyAffected, affectedNames, rootWideChange),
        ecosystem: "node",
        required: script === "test" || script === "typecheck" || script === "build",
        packageName: workspacePackage.name,
        packagePath: workspacePackage.path
      };
      const before = plans.length;
      pushUnique(plans, plan);
      if (plans.length > before) added += 1;
    }
  }
  return added;
}

function affectedPackagesForSignal(paths: string[], signal: ProjectSignal): WorkspacePackage[] {
  const workspacePackages = signal.workspacePackages ?? [];
  if (workspacePackages.length === 0) return [];
  const rootWideChange = touchesRootWorkspaceMetadata(paths);
  if (rootWideChange) return workspacePackages;
  return includeDownstreamDependents(directlyAffectedPackagesForSignal(paths, signal), workspacePackages);
}

function directlyAffectedPackagesForSignal(paths: string[], signal: ProjectSignal): WorkspacePackage[] {
  const workspacePackages = signal.workspacePackages ?? [];
  return workspacePackages.filter((workspacePackage) => paths.some((path) => path === workspacePackage.path || path.startsWith(`${workspacePackage.path}/`)));
}

function includeDownstreamDependents(directlyAffected: WorkspacePackage[], workspacePackages: WorkspacePackage[]): WorkspacePackage[] {
  const affected = new Map<string, WorkspacePackage>();
  const queue = [...directlyAffected];
  for (const workspacePackage of directlyAffected) affected.set(workspacePackage.path, workspacePackage);

  for (let index = 0; index < queue.length; index += 1) {
    const changedPackage = queue[index];
    if (!changedPackage) continue;
    for (const candidate of workspacePackages) {
      if (affected.has(candidate.path)) continue;
      if (!candidate.dependencies?.includes(changedPackage.name)) continue;
      affected.set(candidate.path, candidate);
      queue.push(candidate);
    }
  }

  return [...affected.values()];
}

function workspaceReason(
  workspacePackage: WorkspacePackage,
  script: string,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): string {
  if (rootWideChange) {
    return `Root workspace metadata changed, and ${workspacePackage.name} defines "${script}".`;
  }
  if (directlyAffected.has(workspacePackage.path)) {
    return `${workspacePackage.name} changed under ${workspacePackage.path}, and its package.json defines "${script}".`;
  }
  const upstream = workspacePackage.dependencies?.find((dependency) => affectedNames.has(dependency));
  return `${workspacePackage.name} depends on ${upstream ?? "an affected workspace package"}, and its package.json defines "${script}".`;
}

function touchesRootWorkspaceMetadata(paths: string[]): boolean {
  return paths.some((path) =>
    ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "pnpm-workspace.yaml", "turbo.json", "nx.json"].includes(path)
  );
}

function nodeRun(packageManager: string, script: string): string {
  if (packageManager === "npm") return `npm run ${script}`;
  if (packageManager === "yarn") return `yarn ${script}`;
  if (packageManager === "pnpm") return `pnpm ${script}`;
  if (packageManager === "bun") return `bun run ${script}`;
  return `${packageManager} run ${script}`;
}

function workspaceRun(packageManager: string, packageName: string, script: string): string {
  const quotedName = quoteShell(packageName);
  if (packageManager === "pnpm") return `pnpm --filter ${quotedName} run ${script}`;
  if (packageManager === "yarn") return `yarn workspace ${quotedName} ${script}`;
  if (packageManager === "bun") return `bun --filter ${quotedName} run ${script}`;
  return `npm --workspace ${quotedName} run ${script}`;
}

function touchesNode(paths: string[]): boolean {
  return paths.some((path) =>
    [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".cjs",
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      "tsconfig.json",
      "vite.config.ts",
      "next.config.js",
      "next.config.mjs"
    ].some((token) => path.endsWith(token) || path === token)
  );
}

function touchesPython(paths: string[], root: string): boolean {
  return touches(paths, [".py", "pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"]) || existsSync(join(root, "pytest.ini"));
}

function touchesJava(paths: string[], root: string): boolean {
  return touches(paths, [".java", ".kt", ".kts", "pom.xml", "build.gradle", "build.gradle.kts"]) || existsSync(join(root, "mvnw"));
}

function touches(paths: string[], tokens: string[]): boolean {
  return paths.some((path) => tokens.some((token) => path.endsWith(token) || path === token));
}

function pushUnique(plans: CommandPlan[], plan: CommandPlan): void {
  if (plans.some((existing) => existing.id === plan.id)) return;
  plans.push(plan);
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "package";
}
