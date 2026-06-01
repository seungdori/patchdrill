import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, CommandPlan, ProjectSignal, WorkspacePackage } from "./types.js";

export interface PlannerOptions {
  changedSince?: string;
}

export function planCommands(root: string, changedFiles: ChangedFile[], signals: ProjectSignal[], options: PlannerOptions = {}): CommandPlan[] {
  const plans: CommandPlan[] = [];
  const paths = changedFiles.map((file) => file.path);

  for (const signal of signals) {
    if (signal.ecosystem === "node" && touchesNode(paths)) {
      const workspacePlanCount = addNodeWorkspacePlans(plans, paths, signal);
      if (workspacePlanCount === 0) addNodePlans(plans, signal);
    }
    if (signal.ecosystem === "python" && touchesPython(paths, root, signal)) {
      if (isDjangoProject(root, signal)) {
        addDjangoPlans(plans);
      } else {
        addPythonPlans(plans);
        if (signal.framework === "fastapi" && signal.entrypoint) addFastApiPlans(plans, signal.entrypoint);
      }
    }
    if (signal.ecosystem === "rust" && touches(paths, [".rs", "Cargo.toml", "Cargo.lock"])) {
      const workspacePlanCount = addCargoWorkspacePlans(plans, paths, signal);
      if (workspacePlanCount === 0) {
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
    }
    if (signal.ecosystem === "go" && touches(paths, [".go", "go.mod", "go.sum", "go.work", "go.work.sum"])) {
      const workspacePlanCount = addGoWorkspacePlans(plans, paths, signal);
      if (workspacePlanCount === 0) addGoPlans(plans);
    }
    if (signal.ecosystem === "java" && touchesJava(paths, root)) {
      addJavaPlans(plans, root, signal);
    }
    if (signal.ecosystem === "android" && touchesAndroid(paths)) {
      addAndroidPlans(plans, root);
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
    if (signal.ecosystem === "dotnet" && touchesDotnet(paths)) {
      addDotnetPlans(plans, signal);
    }
    if (signal.ecosystem === "swift" && touches(paths, [".swift", "Package.swift", "Package.resolved"])) {
      pushUnique(plans, {
        id: "swift-tests",
        label: "Swift tests",
        command: "swift test",
        reason: "Swift package source or package metadata changed.",
        ecosystem: "swift",
        required: true
      });
      pushUnique(plans, {
        id: "swift-build",
        label: "Swift build",
        command: "swift build",
        reason: "Swift packages should still build after source or dependency changes.",
        ecosystem: "swift",
        required: false
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
    if (signal.ecosystem === "kubernetes" && touchesKubernetes(paths)) {
      addKubernetesPlans(plans, root, paths);
    }
    if (signal.ecosystem === "bazel" && touchesBazel(paths)) {
      addBazelPlans(plans, root);
    }
    if (signal.ecosystem === "buck" && touchesBuck(paths)) {
      addBuckPlans(plans, root);
    }
    if (signal.ecosystem === "pants" && touchesPants(paths)) {
      addPantsPlans(plans, root, options.changedSince ?? "HEAD");
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

function addDotnetPlans(plans: CommandPlan[], signal: ProjectSignal): void {
  pushUnique(plans, {
    id: "dotnet-tests",
    label: ".NET tests",
    command: "dotnet test",
    reason: ".NET source or project metadata changed.",
    ecosystem: "dotnet",
    required: true
  });
  pushUnique(plans, {
    id: "dotnet-build",
    label: ".NET build",
    command: "dotnet build --no-restore",
    reason: ".NET projects should still compile after source or project metadata changes.",
    ecosystem: "dotnet",
    required: false
  });
  if (signal.framework === "aspnet-core") {
    pushUnique(plans, {
      id: "aspnet-core-publish",
      label: "ASP.NET Core publish",
      command: "dotnet publish --no-restore",
      reason: "ASP.NET Core services should still produce a publishable deployment artifact.",
      ecosystem: "dotnet",
      required: false
    });
  }
}

function addPythonPlans(plans: CommandPlan[]): void {
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

function addDjangoPlans(plans: CommandPlan[]): void {
  pushUnique(plans, {
    id: "django-tests",
    label: "Django tests",
    command: "python manage.py test",
    reason: "Django app code or framework metadata changed, so the Django test runner should load settings, apps, migrations, and tests.",
    ecosystem: "python",
    required: true
  });
  pushUnique(plans, {
    id: "django-check",
    label: "Django system check",
    command: "python manage.py check",
    reason: "Django system checks catch model, settings, URL, and app registry issues before deployment.",
    ecosystem: "python",
    required: false
  });
  pushUnique(plans, {
    id: "python-compile",
    label: "Python syntax compile",
    command: "python -m compileall .",
    reason: "Compile Python files to catch syntax errors in modules not imported by Django tests.",
    ecosystem: "python",
    required: true
  });
}

function addFastApiPlans(plans: CommandPlan[], entrypoint: string): void {
  if (!isPythonEntrypoint(entrypoint)) return;
  pushUnique(plans, {
    id: "fastapi-import-smoke",
    label: "FastAPI import smoke",
    command: `python -c "import importlib, sys; sys.path[:0] = ['src', '.']; target = '${entrypoint}'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)"`,
    reason: "FastAPI app entrypoints should import cleanly so route modules, startup wiring, and dependency setup are not obviously broken.",
    ecosystem: "python",
    required: false
  });
}

function isPythonEntrypoint(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*:[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function addJavaPlans(plans: CommandPlan[], root: string, signal: ProjectSignal): void {
  const buildTool = javaBuildTool(root, signal);
  pushUnique(plans, {
    id: "java-tests",
    label: "Java tests",
    command: javaTestCommand(root, buildTool),
    reason: "Java/Kotlin source or build metadata changed.",
    ecosystem: "java",
    required: true
  });
  if (signal.framework === "spring-boot") {
    pushUnique(plans, {
      id: "spring-boot-package",
      label: "Spring Boot package",
      command: springBootPackageCommand(root, buildTool),
      reason: "Spring Boot applications should still produce an executable application artifact after source or build changes.",
      ecosystem: "java",
      required: false
    });
  }
}

function addAndroidPlans(plans: CommandPlan[], root: string): void {
  const gradle = gradleCommand(root);
  pushUnique(plans, {
    id: "android-unit-tests",
    label: "Android unit tests",
    command: `${gradle} testDebugUnitTest`,
    reason: "Android source, resources, manifest, or Gradle metadata changed, so debug JVM unit tests should run through the Android Gradle plugin.",
    ecosystem: "android",
    required: true
  });
  pushUnique(plans, {
    id: "android-assemble-debug",
    label: "Android debug assemble",
    command: `${gradle} assembleDebug`,
    reason: "Android changes should still compile resources, manifests, generated code, and the debug artifact.",
    ecosystem: "android",
    required: false
  });
  pushUnique(plans, {
    id: "android-lint-debug",
    label: "Android lint",
    command: `${gradle} lintDebug`,
    reason: "Android lint catches manifest, resource, API, and lifecycle issues that normal JVM tests can miss.",
    ecosystem: "android",
    required: false
  });
}

type JavaBuildTool = "maven" | "gradle";

function javaBuildTool(root: string, signal: ProjectSignal): JavaBuildTool {
  if (signal.manifestPath === "pom.xml" || existsSync(join(root, "pom.xml")) || existsSync(join(root, "mvnw"))) return "maven";
  if (signal.manifestPath.includes("gradle") || existsSync(join(root, "build.gradle")) || existsSync(join(root, "build.gradle.kts")) || existsSync(join(root, "gradlew"))) {
    return "gradle";
  }
  return "maven";
}

function javaTestCommand(root: string, buildTool: JavaBuildTool): string {
  if (buildTool === "gradle") return `${gradleCommand(root)} test`;
  return `${mavenCommand(root)} test`;
}

function springBootPackageCommand(root: string, buildTool: JavaBuildTool): string {
  if (buildTool === "gradle") return `${gradleCommand(root)} bootJar`;
  return `${mavenCommand(root)} package -DskipTests`;
}

function gradleCommand(root: string): string {
  return existsSync(join(root, "gradlew")) ? "./gradlew" : "gradle";
}

function mavenCommand(root: string): string {
  return existsSync(join(root, "mvnw")) ? "./mvnw" : "mvn";
}

function addPantsPlans(plans: CommandPlan[], root: string, changedSince: string): void {
  const pants = existsSync(join(root, "pants")) ? "./pants" : "pants";
  const changedArgs = `--changed-since=${quoteShell(changedSince)} --changed-dependents=transitive`;
  pushUnique(plans, {
    id: "pants-changed-tests",
    label: "Pants changed tests",
    command: `${pants} ${changedArgs} test`,
    reason: "pants.toml is present, so Pants can select changed targets and transitive dependents from Git.",
    ecosystem: "pants",
    required: true
  });
  pushUnique(plans, {
    id: "pants-changed-lint",
    label: "Pants changed lint",
    command: `${pants} ${changedArgs} lint`,
    reason: "Pants can lint changed targets and their transitive dependents with native target selection.",
    ecosystem: "pants",
    required: false
  });
  pushUnique(plans, {
    id: "pants-changed-check",
    label: "Pants changed check",
    command: `${pants} ${changedArgs} check`,
    reason: "Pants can run configured typecheck and static analysis goals over changed targets.",
    ecosystem: "pants",
    required: false
  });
}

function addKubernetesPlans(plans: CommandPlan[], root: string, paths: string[]): void {
  const helmRoots = new Set<string>();
  const kustomizeRoots = new Set<string>();
  const manifestRoots = new Set<string>();

  for (const path of paths) {
    if (!isKubernetesPath(path)) continue;
    const helmRoot = nearestManifestRoot(root, path, ["Chart.yaml"]);
    if (helmRoot) {
      helmRoots.add(helmRoot);
      continue;
    }
    const kustomizeRoot = nearestManifestRoot(root, path, ["kustomization.yaml", "kustomization.yml"]);
    if (kustomizeRoot) {
      kustomizeRoots.add(kustomizeRoot);
      continue;
    }
    manifestRoots.add(kubernetesManifestRoot(path));
  }

  for (const chartRoot of [...helmRoots].sort()) {
    pushUnique(plans, {
      id: `kubernetes-helm-lint-${slug(chartRoot)}`,
      label: "Helm lint",
      command: `helm lint ${quoteShell(chartRoot)}`,
      reason: "Helm chart files changed, so chart templates and values should lint before merge.",
      ecosystem: "kubernetes",
      required: true
    });
  }
  for (const kustomizeRoot of [...kustomizeRoots].sort()) {
    pushUnique(plans, {
      id: `kubernetes-kustomize-${slug(kustomizeRoot)}`,
      label: "Kustomize render",
      command: `kubectl kustomize ${quoteShell(kustomizeRoot)}`,
      reason: "Kustomize files changed, so rendered manifests should be generated before merge.",
      ecosystem: "kubernetes",
      required: true
    });
  }
  for (const manifestRoot of [...manifestRoots].sort()) {
    pushUnique(plans, {
      id: `kubernetes-dry-run-${slug(manifestRoot)}`,
      label: "Kubernetes manifest dry-run",
      command: `kubectl apply --dry-run=client -f ${quoteShell(manifestRoot)}`,
      reason: "Kubernetes manifests changed, so client-side apply should parse them before merge.",
      ecosystem: "kubernetes",
      required: true
    });
  }
}

function addBazelPlans(plans: CommandPlan[], root: string): void {
  const bazel = existsSync(join(root, "bazelisk")) ? "./bazelisk" : existsSync(join(root, "bazel")) ? "./bazel" : "bazel";
  pushUnique(plans, {
    id: "bazel-tests",
    label: "Bazel tests",
    command: `${bazel} test //...`,
    reason: "Bazel workspace files changed, so all test targets should run through Bazel's target graph.",
    ecosystem: "bazel",
    required: true
  });
  pushUnique(plans, {
    id: "bazel-build",
    label: "Bazel build",
    command: `${bazel} build //...`,
    reason: "Bazel build graph should still analyze and build after workspace or source changes.",
    ecosystem: "bazel",
    required: false
  });
}

function addBuckPlans(plans: CommandPlan[], root: string): void {
  const buck = existsSync(join(root, "buck2")) ? "./buck2" : "buck2";
  pushUnique(plans, {
    id: "buck-tests",
    label: "Buck tests",
    command: `${buck} test //...`,
    reason: "Buck target files changed, so test targets should run through Buck's target graph.",
    ecosystem: "buck",
    required: true
  });
  pushUnique(plans, {
    id: "buck-build",
    label: "Buck build",
    command: `${buck} build //...`,
    reason: "Buck build graph should still analyze and build after target or source changes.",
    ecosystem: "buck",
    required: false
  });
}

export function findAffectedWorkspacePackages(changedFiles: ChangedFile[], signals: ProjectSignal[]): WorkspacePackage[] {
  const affected = new Map<string, WorkspacePackage>();
  const paths = changedFiles.map((file) => file.path);
  for (const signal of signals) {
    if (!signal.workspacePackages || signal.workspacePackages.length === 0) continue;
    for (const workspacePackage of affectedPackagesForSignal(paths, signal, rootWideMetadataChange(paths, signal))) {
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

function addGoPlans(plans: CommandPlan[]): void {
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

function addNodeWorkspacePlans(plans: CommandPlan[], paths: string[], signal: ProjectSignal): number {
  const affectedPackages = affectedPackagesForSignal(paths, signal, touchesRootWorkspaceMetadata(paths));
  const directlyAffected = new Set(directlyAffectedPackagesForSignal(paths, signal).map((workspacePackage) => workspacePackage.path));
  const affectedNames = new Set(affectedPackages.map((workspacePackage) => workspacePackage.name));
  const rootWideChange = touchesRootWorkspaceMetadata(paths);
  const taskRunnerPlanCount = addNodeTaskRunnerPlans(plans, affectedPackages, signal, directlyAffected, affectedNames, rootWideChange);
  if (taskRunnerPlanCount > 0) return taskRunnerPlanCount;

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

function addCargoWorkspacePlans(plans: CommandPlan[], paths: string[], signal: ProjectSignal): number {
  const affectedPackages = affectedPackagesForSignal(paths, signal, touchesCargoRootMetadata(paths));
  const directlyAffected = new Set(directlyAffectedPackagesForSignal(paths, signal).map((workspacePackage) => workspacePackage.path));
  const affectedNames = new Set(affectedPackages.map((workspacePackage) => workspacePackage.name));
  const rootWideChange = touchesCargoRootMetadata(paths);
  let added = 0;
  for (const workspacePackage of affectedPackages) {
    for (const command of rustWorkspaceCommands(workspacePackage, directlyAffected, affectedNames, rootWideChange)) {
      const before = plans.length;
      pushUnique(plans, command);
      if (plans.length > before) added += 1;
    }
  }
  return added;
}

function addGoWorkspacePlans(plans: CommandPlan[], paths: string[], signal: ProjectSignal): number {
  const affectedPackages = affectedPackagesForSignal(paths, signal, touchesGoRootMetadata(paths));
  const directlyAffected = new Set(directlyAffectedPackagesForSignal(paths, signal).map((workspacePackage) => workspacePackage.path));
  const affectedNames = new Set(affectedPackages.map((workspacePackage) => workspacePackage.name));
  const rootWideChange = touchesGoRootMetadata(paths);
  let added = 0;
  for (const workspacePackage of affectedPackages) {
    for (const command of goWorkspaceCommands(workspacePackage, directlyAffected, affectedNames, rootWideChange)) {
      const before = plans.length;
      pushUnique(plans, command);
      if (plans.length > before) added += 1;
    }
  }
  return added;
}

function goWorkspaceCommands(
  workspacePackage: WorkspacePackage,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): CommandPlan[] {
  const pattern = goWorkspacePattern(workspacePackage.path);
  const reason = goWorkspaceReason(workspacePackage, directlyAffected, affectedNames, rootWideChange);
  return [
    {
      id: `go-workspace-${slug(workspacePackage.name)}-tests`,
      label: `${workspacePackage.name} Go tests`,
      command: `go test ${pattern}`,
      reason,
      ecosystem: "go",
      required: true,
      packageName: workspacePackage.name,
      packagePath: workspacePackage.path
    },
    {
      id: `go-workspace-${slug(workspacePackage.name)}-vet`,
      label: `${workspacePackage.name} Go vet`,
      command: `go vet ${pattern}`,
      reason: `${reason} Go workspace changes should pass static checks before merge.`,
      ecosystem: "go",
      required: false,
      packageName: workspacePackage.name,
      packagePath: workspacePackage.path
    }
  ];
}

function rustWorkspaceCommands(
  workspacePackage: WorkspacePackage,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): CommandPlan[] {
  const packageName = quoteShell(workspacePackage.name);
  const reason = cargoWorkspaceReason(workspacePackage, directlyAffected, affectedNames, rootWideChange);
  return [
    {
      id: `rust-workspace-${slug(workspacePackage.name)}-tests`,
      label: `${workspacePackage.name} Rust tests`,
      command: `cargo test -p ${packageName} --all-targets`,
      reason,
      ecosystem: "rust",
      required: true,
      packageName: workspacePackage.name,
      packagePath: workspacePackage.path
    },
    {
      id: `rust-workspace-${slug(workspacePackage.name)}-clippy`,
      label: `${workspacePackage.name} Rust clippy`,
      command: `cargo clippy -p ${packageName} --all-targets -- -D warnings`,
      reason: `${reason} Rust workspace changes should pass linting before merge.`,
      ecosystem: "rust",
      required: false,
      packageName: workspacePackage.name,
      packagePath: workspacePackage.path
    }
  ];
}

function addNodeTaskRunnerPlans(
  plans: CommandPlan[],
  affectedPackages: WorkspacePackage[],
  signal: ProjectSignal,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): number {
  if (!signal.taskRunner || affectedPackages.length === 0) return 0;
  let added = 0;
  for (const workspacePackage of affectedPackages) {
    for (const script of ["typecheck", "lint", "test", "build"]) {
      if (!workspaceSupportsTask(workspacePackage, script, signal.taskRunner)) continue;
      const projectName = workspacePackage.projectName ?? workspacePackage.name;
      const plan: CommandPlan = {
        id: `node-${signal.taskRunner}-${slug(projectName)}-${script}`,
        label: `${workspacePackage.name} ${script}`,
        command: taskRunnerRun(signal.packageManager ?? "npm", signal.taskRunner, workspacePackage, script),
        reason: `${workspaceTaskRunnerReason(workspacePackage, script, directlyAffected, affectedNames, rootWideChange)} PatchDrill detected ${signal.taskRunner} and will use its task graph.`,
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

function workspaceSupportsTask(workspacePackage: WorkspacePackage, script: string, taskRunner: NonNullable<ProjectSignal["taskRunner"]>): boolean {
  if (workspacePackage.scripts[script]) return true;
  return taskRunner === "nx" && Boolean(workspacePackage.targets?.includes(script));
}

function affectedPackagesForSignal(paths: string[], signal: ProjectSignal, rootWideChange: boolean): WorkspacePackage[] {
  const workspacePackages = signal.workspacePackages ?? [];
  if (workspacePackages.length === 0) return [];
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

function workspaceTaskRunnerReason(
  workspacePackage: WorkspacePackage,
  script: string,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): string {
  const taskDefinition = workspacePackage.scripts[script] ? `package.json defines "${script}"` : `project.json defines target "${script}"`;
  if (rootWideChange) {
    return `Root workspace metadata changed, and ${taskDefinition} for ${workspacePackage.name}.`;
  }
  if (directlyAffected.has(workspacePackage.path)) {
    return `${workspacePackage.name} changed under ${workspacePackage.path}, and ${taskDefinition}.`;
  }
  const upstream = workspacePackage.dependencies?.find((dependency) => affectedNames.has(dependency));
  return `${workspacePackage.name} depends on ${upstream ?? "an affected workspace package"}, and ${taskDefinition}.`;
}

function cargoWorkspaceReason(
  workspacePackage: WorkspacePackage,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): string {
  if (rootWideChange) {
    return `Cargo workspace metadata changed, and ${workspacePackage.name} is a workspace member.`;
  }
  if (directlyAffected.has(workspacePackage.path)) {
    return `${workspacePackage.name} changed under ${workspacePackage.path}.`;
  }
  const upstream = workspacePackage.dependencies?.find((dependency) => affectedNames.has(dependency));
  return `${workspacePackage.name} depends on ${upstream ?? "an affected workspace crate"}.`;
}

function goWorkspaceReason(
  workspacePackage: WorkspacePackage,
  directlyAffected: Set<string>,
  affectedNames: Set<string>,
  rootWideChange: boolean
): string {
  if (rootWideChange) {
    return `Go workspace metadata changed, and ${workspacePackage.name} is a workspace module.`;
  }
  if (directlyAffected.has(workspacePackage.path)) {
    return `${workspacePackage.name} changed under ${workspacePackage.path}.`;
  }
  const upstream = workspacePackage.dependencies?.find((dependency) => affectedNames.has(dependency));
  return `${workspacePackage.name} depends on ${upstream ?? "an affected workspace module"}.`;
}

function touchesRootWorkspaceMetadata(paths: string[]): boolean {
  return paths.some((path) =>
    ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "pnpm-workspace.yaml", "turbo.json", "nx.json"].includes(path)
  );
}

function touchesCargoRootMetadata(paths: string[]): boolean {
  return paths.some((path) => path === "Cargo.toml" || path === "Cargo.lock");
}

function touchesGoRootMetadata(paths: string[]): boolean {
  return paths.some((path) => path === "go.work" || path === "go.work.sum");
}

function rootWideMetadataChange(paths: string[], signal: ProjectSignal): boolean {
  if (signal.ecosystem === "rust") return touchesCargoRootMetadata(paths);
  if (signal.ecosystem === "go") return touchesGoRootMetadata(paths);
  return touchesRootWorkspaceMetadata(paths);
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

function taskRunnerRun(packageManager: string, taskRunner: NonNullable<ProjectSignal["taskRunner"]>, workspacePackage: WorkspacePackage, script: string): string {
  const runner = packageManagerExec(packageManager, taskRunner);
  if (taskRunner === "turbo") return `${runner} run ${script} ${quoteShell(`--filter=${workspacePackage.name}`)}`;
  return `${runner} run ${quoteShell(`${workspacePackage.projectName ?? workspacePackage.name}:${script}`)}`;
}

function packageManagerExec(packageManager: string, binary: string): string {
  if (packageManager === "pnpm") return `pnpm exec ${binary}`;
  if (packageManager === "yarn") return `yarn ${binary}`;
  if (packageManager === "bun") return `bunx ${binary}`;
  return `npx ${binary}`;
}

function goWorkspacePattern(packagePath: string): string {
  return packagePath === "." ? "./..." : `./${packagePath}/...`;
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
      "pnpm-workspace.yaml",
      "turbo.json",
      "nx.json",
      "tsconfig.json",
      "vite.config.ts",
      "next.config.js",
      "next.config.mjs"
    ].some((token) => path.endsWith(token) || path === token)
  );
}

function touchesPython(paths: string[], root: string, signal?: ProjectSignal): boolean {
  if (isDjangoProject(root, signal) && paths.some(isDjangoRelevantPath)) return true;
  return touches(paths, [".py", "pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "manage.py"]) || existsSync(join(root, "pytest.ini"));
}

function isDjangoProject(root: string, signal?: ProjectSignal): boolean {
  return signal?.framework === "django" || existsSync(join(root, "manage.py"));
}

function isDjangoRelevantPath(path: string): boolean {
  return (
    path === "manage.py" ||
    path.endsWith(".py") ||
    path.endsWith("requirements.txt") ||
    path.endsWith("pyproject.toml") ||
    path.endsWith("setup.py") ||
    path.endsWith("setup.cfg") ||
    /(^|\/)(templates|static)\//.test(path) ||
    /(^|\/)(settings|urls|asgi|wsgi)\.py$/.test(path)
  );
}

function touchesJava(paths: string[], root: string): boolean {
  return (
    touches(paths, [".java", ".kt", ".kts", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "gradle.properties"]) ||
    paths.some((path) => path === "gradlew" || path === "mvnw" || path.startsWith("gradle/")) ||
    existsSync(join(root, "mvnw"))
  );
}

function touchesDotnet(paths: string[]): boolean {
  return touches(paths, [".cs", ".fs", ".vb", ".csproj", ".fsproj", ".vbproj", ".sln", ".props", ".targets", "global.json", "Directory.Build.props", "Directory.Build.targets"]);
}

function touchesAndroid(paths: string[]): boolean {
  return paths.some((path) =>
    touches([path], [".java", ".kt", ".kts", ".xml", ".gradle", ".gradle.kts", "AndroidManifest.xml", "gradle.properties", "settings.gradle", "settings.gradle.kts"]) ||
    path === "gradlew" ||
    path.startsWith("gradle/") ||
    /(^|\/)(res|assets|aidl|jni|cpp)\//.test(path)
  );
}

function touchesPants(paths: string[]): boolean {
  return paths.some((path) => path === "pants.toml" || path === "pants" || path === "BUILD" || path.endsWith("/BUILD") || path.endsWith("/BUILD.pants") || isSourceLikePath(path));
}

function touchesKubernetes(paths: string[]): boolean {
  return paths.some(isKubernetesPath);
}

function touchesBazel(paths: string[]): boolean {
  return paths.some((path) =>
    path === "MODULE.bazel" ||
    path === "WORKSPACE" ||
    path === "WORKSPACE.bazel" ||
    path === ".bazelrc" ||
    path.endsWith("/BUILD") ||
    path.endsWith("/BUILD.bazel") ||
    isSourceLikePath(path)
  );
}

function touchesBuck(paths: string[]): boolean {
  return paths.some((path) => path === ".buckconfig" || path === "BUCK" || path === "BUCK.v2" || path.endsWith("/BUCK") || path.endsWith("/BUCK.v2") || isSourceLikePath(path));
}

function isKubernetesPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    /(^|\/)(chart\.yaml|values\.ya?ml|kustomization\.ya?ml)$/.test(lower) ||
    /(^|\/)templates\/.+\.(ya?ml|tpl)$/.test(lower) ||
    (/(^|\/)(k8s|kubernetes|manifests|charts|helm)\//.test(lower) && /\.(ya?ml|tpl)$/.test(lower))
  );
}

function nearestManifestRoot(root: string, path: string, manifestNames: string[]): string | undefined {
  let current = parentPath(path);
  while (true) {
    if (manifestNames.some((manifestName) => existsSync(join(root, current, manifestName)))) return current || ".";
    const next = parentPath(current);
    if (next === current) return undefined;
    current = next;
  }
}

function kubernetesManifestRoot(path: string): string {
  const segments = path.split("/");
  const anchorIndex = segments.findIndex((segment) => ["k8s", "kubernetes", "manifests"].includes(segment.toLowerCase()));
  if (anchorIndex >= 0) return segments.slice(0, anchorIndex + 1).join("/");
  return parentPath(path) || ".";
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

function isSourceLikePath(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|kts|rb|php|cs|fs|swift|scala)$/.test(path);
}

function touches(paths: string[], tokens: string[]): boolean {
  return paths.some((path) => tokens.some((token) => path.endsWith(token) || path === token));
}

function pushUnique(plans: CommandPlan[], plan: CommandPlan): void {
  if (plans.some((existing) => existing.id === plan.id)) return;
  plans.push(plan);
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./@=:-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "package";
}
