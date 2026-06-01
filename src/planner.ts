import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { basename, dirname, join, normalize, relative } from "node:path";
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
        addPythonPlans(plans, root, paths, signal);
        if (signal.framework === "fastapi" && signal.entrypoint) addFastApiPlans(plans, paths, signal.entrypoint);
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
      addAndroidPlans(plans, root, paths);
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
      addDotnetPlans(plans, root, paths, signal);
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
    if (signal.ecosystem === "xcode" && touchesXcode(paths)) {
      addXcodePlans(plans, root, paths, signal);
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
      addBazelPlans(plans, root, paths);
    }
    if (signal.ecosystem === "buck" && touchesBuck(paths)) {
      addBuckPlans(plans, root, paths);
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

interface DotnetProject {
  name: string;
  path: string;
  directory: string;
  references: string[];
  isTestProject: boolean;
  isAspNetCoreProject: boolean;
}

interface DotnetSolutionFilter {
  path: string;
  projects: string[];
}

function addDotnetPlans(plans: CommandPlan[], root: string, paths: string[], signal: ProjectSignal): void {
  const solutionFilterPlanCount = addDotnetSolutionFilterPlans(plans, root, paths);
  if (solutionFilterPlanCount > 0) return;
  const targetedPlanCount = addDotnetProjectPlans(plans, root, paths, signal);
  if (targetedPlanCount > 0) return;
  addRootDotnetPlans(plans, signal);
}

function addRootDotnetPlans(plans: CommandPlan[], signal: ProjectSignal): void {
  const solutionFilter = dotnetSolutionFilterTarget(signal);
  pushUnique(plans, {
    id: solutionFilter ? "dotnet-solution-filter-tests" : "dotnet-tests",
    label: solutionFilter ? ".NET solution filter tests" : ".NET tests",
    command: `dotnet test${solutionFilter ? ` ${quoteShell(solutionFilter)}` : ""}`,
    reason: solutionFilter
      ? `.NET solution filter ${solutionFilter} changed, so tests should run against the filtered solution.`
      : ".NET source or project metadata changed.",
    ecosystem: "dotnet",
    required: true
  });
  pushUnique(plans, {
    id: solutionFilter ? "dotnet-solution-filter-build" : "dotnet-build",
    label: solutionFilter ? ".NET solution filter build" : ".NET build",
    command: `dotnet build${solutionFilter ? ` ${quoteShell(solutionFilter)}` : ""} --no-restore`,
    reason: solutionFilter
      ? `.NET solution filter ${solutionFilter} changed, so the filtered solution should still compile.`
      : ".NET projects should still compile after source or project metadata changes.",
    ecosystem: "dotnet",
    required: false
  });
  if (signal.framework === "aspnet-core" && !solutionFilter) {
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

function dotnetSolutionFilterTarget(signal: ProjectSignal): string | undefined {
  return signal.manifestPath.endsWith(".slnf") ? signal.manifestPath : undefined;
}

function addDotnetSolutionFilterPlans(plans: CommandPlan[], root: string, paths: string[]): number {
  if (touchesDotnetRootMetadata(paths)) return 0;
  const projects = discoverDotnetProjects(root);
  if (projects.length === 0) return 0;
  const changedProjects = dotnetChangedProjects(projects, paths);
  if (changedProjects.length === 0) return 0;
  const affectedProjects = includeDownstreamDotnetProjects(changedProjects, projects);
  const affectedProjectPaths = new Set(affectedProjects.map((project) => project.path));
  const affectedTestProjectPaths = new Set(affectedProjects.filter((project) => project.isTestProject).map((project) => project.path));
  if (affectedTestProjectPaths.size === 0) return 0;

  const filters = selectDotnetSolutionFilters(root, affectedProjectPaths, affectedTestProjectPaths);
  let added = 0;
  for (const filter of filters) {
    const before = plans.length;
    pushUnique(plans, {
      id: `dotnet-solution-filter-${slug(filter.path)}-tests`,
      label: `${filter.path} .NET solution filter tests`,
      command: `dotnet test ${quoteShell(filter.path)}`,
      reason: dotnetSolutionFilterReason(filter, changedProjects, "test"),
      ecosystem: "dotnet",
      required: true,
      packagePath: filter.path
    });
    pushUnique(plans, {
      id: `dotnet-solution-filter-${slug(filter.path)}-build`,
      label: `${filter.path} .NET solution filter build`,
      command: `dotnet build ${quoteShell(filter.path)} --no-restore`,
      reason: dotnetSolutionFilterReason(filter, changedProjects, "build"),
      ecosystem: "dotnet",
      required: false,
      packagePath: filter.path
    });
    if (plans.length > before) added += plans.length - before;
  }
  return added;
}

function selectDotnetSolutionFilters(root: string, affectedProjectPaths: Set<string>, affectedTestProjectPaths: Set<string>): DotnetSolutionFilter[] {
  const filters = discoverDotnetSolutionFilters(root)
    .filter((filter) => filter.projects.some((project) => affectedTestProjectPaths.has(project)))
    .sort((a, b) => a.projects.length - b.projects.length || a.path.localeCompare(b.path));
  const selected: DotnetSolutionFilter[] = [];
  const coveredTestProjects = new Set<string>();

  for (const filter of filters) {
    const uncoveredTests = filter.projects.filter((project) => affectedTestProjectPaths.has(project) && !coveredTestProjects.has(project));
    if (uncoveredTests.length === 0) continue;
    selected.push(filter);
    for (const project of filter.projects) {
      if (affectedProjectPaths.has(project) && affectedTestProjectPaths.has(project)) coveredTestProjects.add(project);
    }
  }

  return selected;
}

function discoverDotnetSolutionFilters(root: string): DotnetSolutionFilter[] {
  return findFilesWithExtension(root, ".slnf", 4)
    .map((path) => ({ path, projects: dotnetSolutionFilterProjects(root, path) }))
    .filter((filter) => filter.projects.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function dotnetSolutionFilterProjects(root: string, filterPath: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(root, filterPath));
  } catch {
    return [];
  }
  const projects = dotnetSolutionFilterProjectList(parsed);
  if (!projects) return [];
  const filterDirectory = dirname(filterPath);
  return uniqueStrings(
    projects
      .map((project) => toRepoPath(relative(root, join(root, filterDirectory, normalize(project.replaceAll("\\", "/"))))))
      .filter((project) => project.endsWith(".csproj") || project.endsWith(".fsproj") || project.endsWith(".vbproj"))
  ).sort();
}

function dotnetSolutionFilterProjectList(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const solution = (value as { solution?: unknown }).solution;
  if (!solution || typeof solution !== "object") return undefined;
  const projects = (solution as { projects?: unknown }).projects;
  return Array.isArray(projects) && projects.every((project) => typeof project === "string") ? projects : undefined;
}

function dotnetSolutionFilterReason(filter: DotnetSolutionFilter, changedProjects: DotnetProject[], command: "build" | "test"): string {
  const examples = changedProjects.slice(0, 3).map((project) => project.path).join(", ");
  const suffix = changedProjects.length > 3 ? ", ..." : "";
  if (command === "test") {
    return `${filter.path} covers affected .NET test projects for changed ${examples}${suffix}, so tests should run through that solution filter.`;
  }
  return `${filter.path} covers affected .NET projects for changed ${examples}${suffix}, so the filtered solution should still compile.`;
}

function addDotnetProjectPlans(plans: CommandPlan[], root: string, paths: string[], signal: ProjectSignal): number {
  if (touchesDotnetRootMetadata(paths)) return 0;
  const projects = discoverDotnetProjects(root);
  if (projects.length === 0) return 0;
  const changedProjects = dotnetChangedProjects(projects, paths);
  if (changedProjects.length === 0) return 0;
  const affectedProjects = includeDownstreamDotnetProjects(changedProjects, projects);
  const affectedProjectPaths = new Set(affectedProjects.map((project) => project.path));
  const testProjects = affectedProjects.filter((project) => project.isTestProject);
  if (testProjects.length === 0) return 0;

  let added = 0;
  for (const project of testProjects) {
    const before = plans.length;
    pushUnique(plans, {
      id: `dotnet-project-${slug(project.name)}-tests`,
      label: `${project.name} .NET tests`,
      command: `dotnet test ${quoteShell(project.path)}`,
      reason: dotnetProjectReason(project, changedProjects, affectedProjectPaths, "test"),
      ecosystem: "dotnet",
      required: true,
      packageName: project.name,
      packagePath: project.directory
    });
    if (plans.length > before) added += 1;
  }

  for (const project of affectedProjects.filter((candidate) => !candidate.isTestProject)) {
    const before = plans.length;
    pushUnique(plans, {
      id: `dotnet-project-${slug(project.name)}-build`,
      label: `${project.name} .NET build`,
      command: `dotnet build ${quoteShell(project.path)} --no-restore`,
      reason: dotnetProjectReason(project, changedProjects, affectedProjectPaths, "build"),
      ecosystem: "dotnet",
      required: false,
      packageName: project.name,
      packagePath: project.directory
    });
    if (plans.length > before) added += 1;
  }

  if (signal.framework === "aspnet-core") {
    for (const project of affectedProjects.filter((candidate) => candidate.isAspNetCoreProject && !candidate.isTestProject)) {
      const before = plans.length;
      pushUnique(plans, {
        id: `aspnet-core-project-${slug(project.name)}-publish`,
        label: `${project.name} ASP.NET Core publish`,
        command: `dotnet publish ${quoteShell(project.path)} --no-restore`,
        reason: "Changed ASP.NET Core projects should still produce publishable deployment artifacts.",
        ecosystem: "dotnet",
        required: false,
        packageName: project.name,
        packagePath: project.directory
      });
      if (plans.length > before) added += 1;
    }
  }

  return added;
}

function discoverDotnetProjects(root: string): DotnetProject[] {
  return findFilesWithExtension(root, ".csproj", 5).map((path) => {
    const content = readText(root, path);
    const explicitName = firstXmlValue(content, "AssemblyName") ?? firstXmlValue(content, "RootNamespace");
    const name = explicitName ?? basename(path, ".csproj");
    return {
      name,
      path,
      directory: parentPath(path) || ".",
      references: dotnetProjectReferences(root, path, content),
      isTestProject: isDotnetTestProject(path, content),
      isAspNetCoreProject: isDotnetAspNetCoreProject(content)
    };
  });
}

function dotnetChangedProjects(projects: DotnetProject[], paths: string[]): DotnetProject[] {
  return projects.filter((project) => paths.some((path) => path === project.path || path.startsWith(`${project.directory === "." ? "" : `${project.directory}/`}`)));
}

function includeDownstreamDotnetProjects(changedProjects: DotnetProject[], projects: DotnetProject[]): DotnetProject[] {
  const affected = new Map<string, DotnetProject>();
  const queue = [...changedProjects];
  for (const project of changedProjects) affected.set(project.path, project);

  for (let index = 0; index < queue.length; index += 1) {
    const changedProject = queue[index];
    if (!changedProject) continue;
    for (const candidate of projects) {
      if (affected.has(candidate.path)) continue;
      if (!candidate.references.includes(changedProject.path)) continue;
      affected.set(candidate.path, candidate);
      queue.push(candidate);
    }
  }

  return [...affected.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function dotnetProjectReason(project: DotnetProject, changedProjects: DotnetProject[], affectedProjectPaths: Set<string>, command: "build" | "test"): string {
  if (changedProjects.some((changedProject) => changedProject.path === project.path)) {
    return `${project.name} changed under ${project.directory}, so its .NET ${command} should run.`;
  }
  const upstream = project.references.find((reference) => affectedProjectPaths.has(reference));
  return `${project.name} references ${upstream ?? "a changed project"}, so its .NET ${command} should run.`;
}

function dotnetProjectReferences(root: string, projectPath: string, content: string): string[] {
  const references: string[] = [];
  const projectDir = dirname(projectPath);
  const pattern = /<ProjectReference\b[^>]*\bInclude=["']([^"']+)["'][^>]*>/gi;
  for (const match of content.matchAll(pattern)) {
    const includePath = match[1];
    if (!includePath) continue;
    const normalizedIncludePath = normalize(includePath.replaceAll("\\", "/"));
    const normalizedPath = toRepoPath(relative(root, join(root, projectDir, normalizedIncludePath)));
    if (normalizedPath.endsWith(".csproj")) references.push(normalizedPath);
  }
  return [...new Set(references)].sort();
}

function isDotnetTestProject(path: string, content: string): boolean {
  return (
    /(^|[./_-])tests?([./_-]|$)/i.test(path) ||
    /Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest\.TestFramework/i.test(content)
  );
}

function isDotnetAspNetCoreProject(content: string): boolean {
  return /Sdk=["']Microsoft\.NET\.Sdk\.Web["']|Microsoft\.AspNetCore/i.test(content);
}

function firstXmlValue(content: string, tagName: string): string | undefined {
  const match = new RegExp(`<${tagName}>\\s*([^<]+?)\\s*</${tagName}>`, "i").exec(content);
  return match?.[1]?.trim() || undefined;
}

function readText(root: string, path: string): string {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return "";
  }
}

function addPythonPlans(plans: CommandPlan[], root: string, paths: string[], signal?: ProjectSignal): void {
  const testTargets = pythonChangedTestTargets(root, paths, signal);
  pushUnique(plans, {
    id: testTargets.length > 0 ? "python-targeted-tests" : "python-tests",
    label: testTargets.length > 0 ? "Python targeted tests" : "Python tests",
    command: testTargets.length > 0 ? `python -m pytest ${testTargets.map(quoteShell).join(" ")}` : "python -m pytest",
    reason: testTargets.length > 0
      ? "Python source changes have matching changed-test or FastAPI dependency override targets on disk."
      : "Python files or Python project metadata changed.",
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

function pythonChangedTestTargets(root: string, paths: string[], signal?: ProjectSignal): string[] {
  const targets = new Set<string>();
  for (const path of paths) {
    if (!path.endsWith(".py")) continue;
    if (isPythonTestPath(path) && existsSync(join(root, path))) {
      targets.add(path);
      continue;
    }
    for (const candidate of pythonTestCandidates(path)) {
      if (existsSync(join(root, candidate))) targets.add(candidate);
    }
  }
  if (signal?.framework === "fastapi") {
    for (const target of fastApiDependencyOverrideTestTargets(root, paths)) targets.add(target);
  }
  return [...targets].sort();
}

interface FastApiDependencyModule {
  module: string;
  functionNames: string[];
}

function fastApiDependencyOverrideTestTargets(root: string, paths: string[]): string[] {
  const dependencyModules = paths
    .filter((path) => isFastApiDependencyPath(path))
    .map((path) => ({
      module: pythonImportModuleName(path),
      functionNames: pythonDefinedFunctionNames(root, path)
    }))
    .filter((target): target is FastApiDependencyModule => Boolean(target.module) && target.functionNames.length > 0);
  if (dependencyModules.length === 0) return [];

  return findFilesWithExtension(root, ".py", 7)
    .filter((path) => isPythonTestPath(path))
    .filter((path) => testOverridesFastApiDependency(readText(root, path), dependencyModules))
    .sort();
}

function isFastApiDependencyPath(path: string): boolean {
  if (!path.endsWith(".py")) return false;
  return /(^|\/)(dependencies|deps)\.py$/.test(path) || /(^|\/)(dependencies|deps)\//.test(path);
}

function pythonDefinedFunctionNames(root: string, path: string): string[] {
  const names = new Set<string>();
  const content = readText(root, path);
  for (const match of content.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort();
}

function testOverridesFastApiDependency(content: string, dependencyModules: FastApiDependencyModule[]): boolean {
  if (!content.includes("dependency_overrides")) return false;
  const overrideRefs = fastApiDependencyOverrideRefs(content);
  if (overrideRefs.length === 0) return false;

  return dependencyModules.some((dependencyModule) => {
    const imports = pythonImportsForModule(content, dependencyModule.module);
    for (const ref of overrideRefs) {
      const [qualifier, name] = splitPythonAttributeRef(ref);
      if (name && imports.moduleAliases.has(qualifier) && dependencyModule.functionNames.includes(name)) return true;
      if (!name && imports.directNames.has(qualifier) && dependencyModule.functionNames.includes(qualifier)) return true;
    }
    return false;
  });
}

function fastApiDependencyOverrideRefs(content: string): string[] {
  const refs = new Set<string>();
  for (const match of content.matchAll(/dependency_overrides\s*\[\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\]/g)) {
    if (match[1]) refs.add(match[1]);
  }
  return [...refs].sort();
}

function pythonImportsForModule(content: string, moduleName: string): { directNames: Set<string>; moduleAliases: Set<string> } {
  const directNames = new Set<string>();
  const moduleAliases = new Set<string>();
  const escapedModule = escapeRegExp(moduleName);

  for (const match of content.matchAll(new RegExp(`^\\s*from\\s+${escapedModule}\\s+import\\s+(.+)$`, "gm"))) {
    const imports = match[1] ?? "";
    for (const imported of imports.split(",")) {
      const name = imported.trim().replace(/[()]/g, "").split(/\s+as\s+/i).at(-1)?.trim();
      if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) directNames.add(name);
    }
  }

  for (const match of content.matchAll(new RegExp(`^\\s*import\\s+${escapedModule}\\s+as\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*$`, "gm"))) {
    if (match[1]) moduleAliases.add(match[1]);
  }

  return { directNames, moduleAliases };
}

function splitPythonAttributeRef(value: string): [string, string | undefined] {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex < 0) return [value, undefined];
  return [value.slice(0, dotIndex), value.slice(dotIndex + 1)];
}

function pythonTestCandidates(path: string): string[] {
  const parsed = parsePath(path);
  if (!parsed) return [];
  const testNames = [`test_${parsed.name}${parsed.extension}`, `${parsed.name}_test${parsed.extension}`];
  const candidates = new Set<string>();
  const directories = [parsed.directory];
  if (parsed.directory.startsWith("src/")) directories.push(parsed.directory.slice("src/".length));
  if (parsed.directory.startsWith("app/")) directories.push(parsed.directory.slice("app/".length));

  for (const directory of directories.filter((value, index, values) => values.indexOf(value) === index)) {
    for (const testName of testNames) {
      candidates.add(joinPath(directory, testName));
      candidates.add(joinPath(directory, "tests", testName));
      candidates.add(joinPath("tests", directory, testName));
      candidates.add(joinPath("test", directory, testName));
      candidates.add(joinPath("tests", testName));
      candidates.add(joinPath("test", testName));
    }
  }
  return [...candidates];
}

function isPythonTestPath(path: string): boolean {
  return /(^|\/)(tests?|spec)\//i.test(path) || /(^|\/)test_[^/]+\.py$/i.test(path) || /_test\.py$/i.test(path);
}

function parsePath(path: string): { directory: string; name: string; extension: string } | undefined {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash) : "";
  const fileName = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return {
    directory,
    name: fileName.slice(0, dot),
    extension: fileName.slice(dot)
  };
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
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

function addFastApiPlans(plans: CommandPlan[], paths: string[], entrypoint: string): void {
  if (!isPythonEntrypoint(entrypoint)) return;
  pushUnique(plans, {
    id: "fastapi-import-smoke",
    label: "FastAPI import smoke",
    command: `python -c "import importlib, sys; sys.path[:0] = ['src', '.']; target = '${entrypoint}'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)"`,
    reason: "FastAPI app entrypoints should import cleanly so route modules, startup wiring, and dependency setup are not obviously broken.",
    ecosystem: "python",
    required: false
  });

  const modules = fastApiChangedImportModules(paths);
  if (modules.length === 0) return;
  pushUnique(plans, {
    id: "fastapi-module-import-smoke",
    label: "FastAPI changed module import smoke",
    command: `python -c "import importlib, sys; sys.path[:0] = ['src', '.']; targets = [${modules.map((module) => `'${module}'`).join(", ")}]; [importlib.import_module(target) for target in targets]"`,
    reason: "Changed FastAPI router or dependency modules should import cleanly before the full app startup path is trusted.",
    ecosystem: "python",
    required: false
  });
}

function isPythonEntrypoint(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*:[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function addXcodePlans(plans: CommandPlan[], root: string, paths: string[], signal: ProjectSignal): void {
  const schemes = xcodeTargetSchemes(root, paths, signal.manifestPath);
  const subject = xcodeBuildSubject(signal.manifestPath);
  if (schemes.length === 0) {
    pushUnique(plans, {
      id: "xcode-list-schemes",
      label: "Xcode scheme listing",
      command: `xcodebuild ${subject} -list`,
      reason: "Xcode project files changed, but no shared scheme was found in the repository. List schemes before choosing a build or test command.",
      ecosystem: "xcode",
      required: false,
      packagePath: signal.manifestPath
    });
    return;
  }

  for (const scheme of schemes) {
    const testPlanArg = scheme.testPlan ? ` -testPlan ${quoteShell(scheme.testPlan)}` : "";
    const testDestinationArg = xcodeDestinationArg(scheme.destination, "test");
    const buildDestinationArg = xcodeDestinationArg(scheme.destination, "build");
    pushUnique(plans, {
      id: `xcode-${slug(scheme.name)}-tests`,
      label: `${scheme.name} Xcode tests`,
      command: `xcodebuild ${subject} -scheme ${quoteShell(scheme.name)}${testPlanArg}${testDestinationArg} test`,
      reason: scheme.testPlan
        ? `${scheme.name} is an Xcode shared scheme for ${signal.manifestPath} with test plan ${scheme.testPlan}, so changed app or test files should run through that xcodebuild test plan${testDestinationArg ? ` on ${scheme.destination?.label}` : ""}.`
        : `${scheme.name} is an Xcode shared scheme for ${signal.manifestPath}, so changed app or test files should run through xcodebuild test${testDestinationArg ? ` on ${scheme.destination?.label}` : ""}.`,
      ecosystem: "xcode",
      required: true,
      packageName: scheme.name,
      packagePath: signal.manifestPath
    });
    if (scheme.destination && !scheme.destination.testSpecifier) {
      pushUnique(plans, {
        id: `xcode-${slug(scheme.name)}-destinations`,
        label: `${scheme.name} Xcode destinations`,
        command: `xcodebuild ${subject} -scheme ${quoteShell(scheme.name)} -showdestinations`,
        reason: `${scheme.name} targets ${scheme.destination.label}; xcodebuild test needs a concrete simulator or device name, so list valid destinations before pinning CI to one.`,
        ecosystem: "xcode",
        required: false,
        packageName: scheme.name,
        packagePath: signal.manifestPath
      });
    }
    pushUnique(plans, {
      id: `xcode-${slug(scheme.name)}-build`,
      label: `${scheme.name} Xcode build`,
      command: `xcodebuild ${subject} -scheme ${quoteShell(scheme.name)}${buildDestinationArg} build`,
      reason: `${scheme.name} should still compile through Xcode after project, source, resource, or signing metadata changes${buildDestinationArg ? ` using the ${scheme.destination?.label} destination.` : "."}`,
      ecosystem: "xcode",
      required: false,
      packageName: scheme.name,
      packagePath: signal.manifestPath
    });
  }
}

function xcodeBuildSubject(manifestPath: string): string {
  if (manifestPath.endsWith(".xcworkspace")) return `-workspace ${quoteShell(manifestPath)}`;
  return `-project ${quoteShell(manifestPath)}`;
}

interface XcodeScheme {
  name: string;
  testPlan?: string;
  destination?: XcodeDestination;
}

type XcodePlatform = "ios" | "macos" | "tvos" | "visionos" | "watchos";

interface XcodeDestination {
  label: string;
  buildSpecifier: string;
  testSpecifier?: string;
}

function xcodeTargetSchemes(root: string, paths: string[], manifestPath: string): XcodeScheme[] {
  const changedSchemes = paths.filter((path) => path.endsWith(".xcscheme")).map((path) => xcodeScheme(root, path, manifestPath));
  if (changedSchemes.length > 0) return uniqueXcodeSchemes(changedSchemes);

  const manifestSchemes = xcodeSharedSchemes(root, manifestPath);
  if (manifestSchemes.length > 0) return manifestSchemes;

  return uniqueXcodeSchemes(findFilesWithExtension(root, ".xcscheme", 7)
    .filter((path) => path.includes("/xcshareddata/xcschemes/"))
    .map((path) => xcodeScheme(root, path, manifestPath)));
}

function xcodeSharedSchemes(root: string, manifestPath: string): XcodeScheme[] {
  const schemeRoot = joinPath(manifestPath, "xcshareddata", "xcschemes");
  return uniqueXcodeSchemes(findFilesWithExtension(root, ".xcscheme", 7)
    .filter((path) => path.startsWith(`${schemeRoot}/`))
    .map((path) => xcodeScheme(root, path, manifestPath)));
}

function xcodeScheme(root: string, path: string, manifestPath: string): XcodeScheme {
  const testPlan = xcodeSchemeTestPlan(root, path);
  const destination = xcodeSchemeDestination(root, path, manifestPath);
  return {
    name: basename(path, ".xcscheme"),
    ...(testPlan ? { testPlan } : {}),
    ...(destination ? { destination } : {})
  };
}

function xcodeSchemeTestPlan(root: string, path: string): string | undefined {
  const content = readText(root, path);
  const references = [...content.matchAll(/<TestPlanReference\b[^>]*\breference\s*=\s*"([^"]+)"[^>]*>/gi)];
  const defaultReference = references.find((match) => /\bdefault\s*=\s*"YES"/i.test(match[0]));
  return xcodeTestPlanName(defaultReference?.[1] ?? references[0]?.[1]);
}

function xcodeTestPlanName(reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  const cleanReference = reference.replace(/^container:/, "");
  if (!cleanReference.endsWith(".xctestplan")) return undefined;
  return basename(cleanReference, ".xctestplan");
}

function xcodeSchemeDestination(root: string, path: string, manifestPath: string): XcodeDestination | undefined {
  const content = readText(root, path);
  const platforms = uniqueStrings([...content.matchAll(/<BuildableReference\b[^>]*>/gi)]
    .map((match) => xcodeBuildableReferencePlatform(root, path, manifestPath, match[0]))
    .filter((platform): platform is XcodePlatform => Boolean(platform)));
  if (platforms.length !== 1) return undefined;
  return xcodeDestinationForPlatform(platforms[0] as XcodePlatform);
}

function xcodeBuildableReferencePlatform(root: string, schemePath: string, manifestPath: string, tag: string): XcodePlatform | undefined {
  const targetId = xmlAttribute(tag, "BlueprintIdentifier");
  if (!targetId) return undefined;
  const projectPath = xcodeReferencedProjectPath(root, schemePath, manifestPath, xmlAttribute(tag, "ReferencedContainer"));
  if (!projectPath) return undefined;
  return xcodeProjectTargetPlatform(root, projectPath, targetId);
}

function xcodeReferencedProjectPath(root: string, schemePath: string, manifestPath: string, reference: string | undefined): string | undefined {
  const rawReference = reference?.replace(/^container:/, "").trim();
  if (!rawReference) return manifestPath.endsWith(".xcodeproj") ? manifestPath : undefined;
  const directPath = normalizeRepoPath(rawReference);
  if (directPath?.endsWith(".xcodeproj") && existsSync(join(root, directPath, "project.pbxproj"))) return directPath;

  const schemeContainer = xcodeSchemeContainerPath(schemePath);
  const containerParent = schemeContainer ? dirname(schemeContainer).replaceAll("\\", "/") : "";
  const relativePath = normalizeRepoPath(joinPath(containerParent === "." ? "" : containerParent, rawReference));
  if (relativePath?.endsWith(".xcodeproj") && existsSync(join(root, relativePath, "project.pbxproj"))) return relativePath;

  if (manifestPath.endsWith(".xcodeproj")) return manifestPath;
  return directPath?.endsWith(".xcodeproj") ? directPath : undefined;
}

function xcodeProjectTargetPlatform(root: string, projectPath: string, targetId: string): XcodePlatform | undefined {
  const content = readText(root, joinPath(projectPath, "project.pbxproj"));
  const targetBlock = xcodeObjectBlock(content, targetId);
  if (!targetBlock) return undefined;
  const buildConfigurationIds = xcodeTargetBuildConfigurationIds(content, targetBlock);
  for (const configurationId of buildConfigurationIds) {
    const platform = xcodeBuildConfigurationPlatform(content, configurationId);
    if (platform) return platform;
  }
  return xcodeProductTypePlatform(firstPbxValue(targetBlock, "productType"));
}

function xcodeTargetBuildConfigurationIds(content: string, targetBlock: string): string[] {
  const configurationListId = firstPbxValue(targetBlock, "buildConfigurationList");
  if (!configurationListId) return [];
  const configurationListBlock = xcodeObjectBlock(content, configurationListId);
  const configurations = /buildConfigurations\s*=\s*\(([\s\S]*?)\);/.exec(configurationListBlock ?? "");
  const configurationIds = configurations?.[1];
  if (!configurationIds) return [];
  return [...configurationIds.matchAll(/\b([A-Za-z0-9_]+)\b\s*(?:\/\*[\s\S]*?\*\/)?\s*,/g)]
    .map((match) => match[1])
    .filter((id): id is string => Boolean(id));
}

function xcodeBuildConfigurationPlatform(content: string, configurationId: string): XcodePlatform | undefined {
  const block = xcodeObjectBlock(content, configurationId);
  if (!block) return undefined;
  return (
    xcodePlatformFromTokens(xcodeBuildSettingValues(block, "SDKROOT")) ??
    xcodePlatformFromTokens(xcodeBuildSettingValues(block, "SUPPORTED_PLATFORMS"))
  );
}

function xcodeBuildSettingValues(content: string, key: string): string[] {
  return [...content.matchAll(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*([^;]+);`, "g"))]
    .flatMap((match) => (match[1] ?? "").split(/[\s"',()]+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function xcodePlatformFromTokens(tokens: string[]): XcodePlatform | undefined {
  const value = tokens.join(" ").toLowerCase();
  if (/\bmacosx\b/.test(value)) return "macos";
  if (/\b(xros|xrsimulator|visionos)\b/.test(value)) return "visionos";
  if (/\b(watchos|watchsimulator)\b/.test(value)) return "watchos";
  if (/\b(appletvos|appletvsimulator)\b/.test(value)) return "tvos";
  if (/\b(iphoneos|iphonesimulator)\b/.test(value)) return "ios";
  return undefined;
}

function xcodeProductTypePlatform(productType: string | undefined): XcodePlatform | undefined {
  if (!productType) return undefined;
  const value = productType.toLowerCase();
  if (value.includes("watch")) return "watchos";
  if (value.includes("tv")) return "tvos";
  return undefined;
}

function xcodeDestinationForPlatform(platform: XcodePlatform): XcodeDestination {
  switch (platform) {
    case "macos":
      return { label: "macOS", buildSpecifier: "platform=macOS", testSpecifier: "platform=macOS" };
    case "visionos":
      return { label: "visionOS", buildSpecifier: "generic/platform=visionOS" };
    case "watchos":
      return { label: "watchOS", buildSpecifier: "generic/platform=watchOS" };
    case "tvos":
      return { label: "tvOS", buildSpecifier: "generic/platform=tvOS" };
    case "ios":
      return { label: "iOS", buildSpecifier: "generic/platform=iOS" };
  }
}

function xcodeDestinationArg(destination: XcodeDestination | undefined, action: "build" | "test"): string {
  const specifier = action === "test" ? destination?.testSpecifier : destination?.buildSpecifier;
  return specifier ? ` -destination ${quoteShell(specifier)}` : "";
}

function xcodeObjectBlock(content: string, id: string): string | undefined {
  const match = new RegExp(`\\b${escapeRegExp(id)}\\b\\s*(?:\\/\\*[\\s\\S]*?\\*\\/\\s*)?=\\s*\\{`).exec(content);
  if (!match) return undefined;
  const start = match.index + match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start + 1, index);
    }
  }
  return undefined;
}

function firstPbxValue(content: string, key: string): string | undefined {
  return new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*([^;]+);`).exec(content)?.[1]?.replace(/\/\*[\s\S]*?\*\//g, "").replaceAll('"', "").trim();
}

function xmlAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];
}

function xcodeSchemeContainerPath(path: string): string | undefined {
  const parts = path.split("/");
  const index = parts.findIndex((part) => part.endsWith(".xcodeproj") || part.endsWith(".xcworkspace"));
  return index >= 0 ? parts.slice(0, index + 1).join("/") : undefined;
}

function normalizeRepoPath(path: string): string | undefined {
  const normalized = normalize(path).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) return undefined;
  return normalized;
}

function uniqueXcodeSchemes(schemes: XcodeScheme[]): XcodeScheme[] {
  const byName = new Map<string, XcodeScheme>();
  for (const scheme of schemes) {
    if (!scheme.name || byName.has(scheme.name)) continue;
    byName.set(scheme.name, scheme);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function fastApiChangedImportModules(paths: string[]): string[] {
  const modules = new Set<string>();
  for (const path of paths) {
    if (!isFastApiImportSmokePath(path)) continue;
    const module = pythonImportModuleName(path);
    if (module) modules.add(module);
  }
  return [...modules].sort();
}

function isFastApiImportSmokePath(path: string): boolean {
  if (!path.endsWith(".py")) return false;
  return /(^|\/)routers?\//.test(path) || /(^|\/)(dependencies|deps)\.py$/.test(path) || /(^|\/)(dependencies|deps)\//.test(path);
}

function pythonImportModuleName(path: string): string | undefined {
  const withoutSourceRoot = path.startsWith("src/") ? path.slice("src/".length) : path;
  const withoutExtension = withoutSourceRoot.replace(/\.py$/, "");
  if (withoutExtension.endsWith(".__init__")) return withoutExtension.slice(0, -"__init__".length - 1);
  const moduleName = withoutExtension.replaceAll("/", ".");
  return moduleName.split(".").every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) ? moduleName : undefined;
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

function addAndroidPlans(plans: CommandPlan[], root: string, paths: string[]): void {
  const gradle = gradleCommand(root);
  const variant = androidVariantFromPaths(root, paths) ?? "Debug";
  const variantSlug = slug(androidVariantSlug(variant));
  pushUnique(plans, {
    id: `android-${variantSlug}-unit-tests`,
    label: `Android ${variant} unit tests`,
    command: `${gradle} test${variant}UnitTest`,
    reason: `Android source, resources, manifest, or Gradle metadata changed, so ${variant} JVM unit tests should run through the Android Gradle plugin.`,
    ecosystem: "android",
    required: true
  });
  pushUnique(plans, {
    id: `android-${variantSlug}-assemble`,
    label: `Android ${variant} assemble`,
    command: `${gradle} assemble${variant}`,
    reason: `Android changes should still compile resources, manifests, generated code, and the ${variant} artifact.`,
    ecosystem: "android",
    required: false
  });
  pushUnique(plans, {
    id: `android-${variantSlug}-lint`,
    label: `Android ${variant} lint`,
    command: `${gradle} lint${variant}`,
    reason: `Android ${variant} lint catches manifest, resource, API, and lifecycle issues that normal JVM tests can miss.`,
    ecosystem: "android",
    required: false
  });
}

function androidVariantFromPaths(root: string, paths: string[]): string | undefined {
  const variants = new Set<string>();
  for (const path of paths) {
    const generatedVariant = androidGeneratedVariantFromPath(root, path);
    if (generatedVariant) {
      variants.add(androidEnabledVariant(root, path, generatedVariant));
      continue;
    }
    const sourceSet = androidSourceSet(path);
    if (!sourceSet) continue;
    const variant = androidVariantFromSourceSet(sourceSet) ?? androidVariantFromFlavorSourceSet(root, path, sourceSet);
    if (variant) variants.add(androidEnabledVariant(root, path, variant));
  }
  return variants.size === 1 ? [...variants][0] : undefined;
}

function androidGeneratedVariantFromPath(root: string, path: string): string | undefined {
  const segments = path.split("/");
  const buildIndex = segments.findIndex((segment, index) => segment === "build" && segments[index + 1] === "generated");
  if (buildIndex < 0) return undefined;
  for (const segment of segments.slice(buildIndex + 2)) {
    const variant = androidVariantFromSourceSet(segment) ?? androidVariantFromFlavorSourceSet(root, path, segment);
    if (variant) return variant;
  }
  return undefined;
}

function androidSourceSet(path: string): string | undefined {
  return /(^|\/)src\/([^/]+)\//.exec(path)?.[2];
}

function androidVariantFromSourceSet(sourceSet: string): string | undefined {
  if (sourceSet === "main") return undefined;
  if (sourceSet === "debug" || sourceSet === "testDebug" || sourceSet === "androidTestDebug") return "Debug";
  if (sourceSet === "release" || sourceSet === "testRelease" || sourceSet === "androidTestRelease") return "Release";
  const match = /^(?:test|androidTest)?([A-Za-z][A-Za-z0-9]*?)(Debug|Release)$/.exec(sourceSet);
  if (!match?.[1] || !match[2]) return undefined;
  return `${pascalCase(match[1])}${match[2]}`;
}

interface AndroidGradleModel {
  productFlavors: string[];
  buildTypes: string[];
  disabledVariants: string[];
}

function androidVariantFromFlavorSourceSet(root: string, path: string, sourceSet: string): string | undefined {
  const normalizedSourceSet = sourceSet.replace(/^(?:test|androidTest)(?=[A-Z])/, (prefix) => (prefix === "test" || prefix === "androidTest" ? "" : prefix));
  const model = readAndroidGradleModel(root, path);
  if (model.productFlavors.length === 0) return undefined;
  if (!androidSourceSetMatchesFlavors(normalizedSourceSet, model.productFlavors)) return undefined;
  const buildType = model.buildTypes.find((candidate) => candidate.toLowerCase() === "debug") ?? model.buildTypes[0] ?? "debug";
  return `${pascalCase(normalizedSourceSet)}${pascalCase(buildType)}`;
}

function androidEnabledVariant(root: string, path: string, variant: string): string {
  const model = readAndroidGradleModel(root, path);
  if (!model.disabledVariants.includes(variant)) return variant;
  return androidFallbackEnabledVariant(variant, model) ?? variant;
}

function readAndroidGradleModel(root: string, path: string): AndroidGradleModel {
  const moduleRoot = nearestManifestRoot(root, path, ["build.gradle", "build.gradle.kts"]) ?? ".";
  const content = ["build.gradle", "build.gradle.kts"]
    .map((fileName) => readText(root, joinPath(moduleRoot === "." ? "" : moduleRoot, fileName)))
    .join("\n");
  const productFlavors = gradleNamedBlockChildren(content, "productFlavors");
  const explicitBuildTypes = gradleNamedBlockChildren(content, "buildTypes");
  const buildTypes = uniqueStrings([...explicitBuildTypes, "debug", "release"]);
  const disabledVariants = androidDisabledVariants(content, productFlavors, buildTypes);
  return { productFlavors, buildTypes, disabledVariants };
}

function androidDisabledVariants(content: string, productFlavors: string[], buildTypes: string[]): string[] {
  const variants = new Set<string>();
  for (const snippet of androidDisabledVariantSnippets(content)) {
    const mentionedBuildTypes = androidMentionedBuildTypes(snippet, buildTypes);
    const mentionedFlavors = androidMentionedFlavors(snippet, productFlavors);
    const targetBuildTypes = mentionedBuildTypes.length > 0 ? mentionedBuildTypes : buildTypes;
    const targetFlavorSets = mentionedFlavors.length > 0 ? [mentionedFlavors] : [[]];
    for (const flavorSet of targetFlavorSets) {
      for (const buildType of targetBuildTypes) {
        variants.add(androidVariantName(flavorSet, buildType));
      }
    }
  }
  return [...variants].sort();
}

function androidDisabledVariantSnippets(content: string): string[] {
  const snippets: string[] = [];
  const variantFilter = gradleBlockBody(content, "variantFilter");
  if (variantFilter) snippets.push(...androidVariantFilterDisabledSnippets(variantFilter));

  for (const match of content.matchAll(/beforeVariants\s*\(\s*selector\(\)([\s\S]*?)\)\s*\{([\s\S]*?)\}/g)) {
    const selector = match[1] ?? "";
    const body = match[2] ?? "";
    if (/\benable\s*=\s*false\b/.test(body)) snippets.push(`${selector}\n${body}`);
  }
  return snippets;
}

function androidVariantFilterDisabledSnippets(content: string): string[] {
  const snippets: string[] = [];
  for (const match of content.matchAll(/if\s*\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/g)) {
    const condition = match[1] ?? "";
    const body = match[2] ?? "";
    if (/(setIgnore\s*\(\s*true\s*\)|ignore\s*=\s*true)/.test(body)) snippets.push(`${condition}\n${body}`);
  }
  if (snippets.length === 0 && /(setIgnore\s*\(\s*true\s*\)|ignore\s*=\s*true)/.test(content)) snippets.push(content);
  return snippets;
}

function androidMentionedBuildTypes(content: string, buildTypes: string[]): string[] {
  const mentioned = new Set<string>();
  for (const match of content.matchAll(/buildType\.name\s*(?:==|=)\s*["']([^"']+)["']/g)) {
    if (match[1]) mentioned.add(match[1]);
  }
  for (const match of content.matchAll(/withBuildType\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) mentioned.add(match[1]);
  }
  return filterKnownGradleNames([...mentioned], buildTypes);
}

function androidMentionedFlavors(content: string, productFlavors: string[]): string[] {
  const mentioned = new Set<string>();
  for (const match of content.matchAll(/flavors\*\.\s*name\.contains\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) mentioned.add(match[1]);
  }
  for (const match of content.matchAll(/withFlavor\s*\(\s*["'][^"']+["']\s*(?:to|,)\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) mentioned.add(match[1]);
  }
  return filterKnownGradleNames([...mentioned], productFlavors);
}

function filterKnownGradleNames(values: string[], knownValues: string[]): string[] {
  if (knownValues.length === 0) return values;
  const known = new Map(knownValues.map((value) => [value.toLowerCase(), value]));
  return values.map((value) => known.get(value.toLowerCase())).filter((value): value is string => Boolean(value));
}

function androidVariantName(flavors: string[], buildType: string): string {
  return `${flavors.map(pascalCase).join("")}${pascalCase(buildType)}`;
}

function androidFallbackEnabledVariant(variant: string, model: AndroidGradleModel): string | undefined {
  const buildType = androidVariantBuildType(variant, model.buildTypes);
  if (!buildType) return undefined;
  const flavorPrefix = variant.slice(0, -pascalCase(buildType).length);
  const preferredBuildTypes = uniqueStrings([...model.buildTypes.filter((candidate) => candidate.toLowerCase() === "debug"), ...model.buildTypes]);
  for (const candidateBuildType of preferredBuildTypes) {
    const candidate = `${flavorPrefix}${pascalCase(candidateBuildType)}`;
    if (!model.disabledVariants.includes(candidate)) return candidate;
  }
  return undefined;
}

function androidVariantBuildType(variant: string, buildTypes: string[]): string | undefined {
  return buildTypes
    .map((buildType) => ({ raw: buildType, pascal: pascalCase(buildType) }))
    .sort((a, b) => b.pascal.length - a.pascal.length)
    .find((buildType) => variant.endsWith(buildType.pascal))?.raw;
}

function androidSourceSetMatchesFlavors(sourceSet: string, productFlavors: string[]): boolean {
  const flavorNames = productFlavors.map((flavor) => pascalCase(flavor)).sort((a, b) => b.length - a.length);
  let remaining = pascalCase(sourceSet);
  if (remaining.length === 0) return false;
  while (remaining.length > 0) {
    const match = flavorNames.find((flavor) => remaining.startsWith(flavor));
    if (!match) return false;
    remaining = remaining.slice(match.length);
  }
  return true;
}

function gradleNamedBlockChildren(content: string, blockName: string): string[] {
  const body = gradleBlockBody(content, blockName);
  if (!body) return [];
  const names: string[] = [];
  let depth = 0;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, "");
    if (depth === 0) {
      const directBlock = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(line);
      const factoryBlock = /^\s*(?:create|maybeCreate|register)\s*\(\s*["']([^"']+)["']\s*\)/.exec(line);
      const name = directBlock?.[1] ?? factoryBlock?.[1];
      if (name) names.push(name);
    }
    depth += countChar(line, "{") - countChar(line, "}");
    if (depth < 0) depth = 0;
  }
  return uniqueStrings(names);
}

function gradleBlockBody(content: string, blockName: string): string | undefined {
  const match = new RegExp(`\\b${escapeRegExp(blockName)}\\s*\\{`, "m").exec(content);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  let depth = 1;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return content.slice(start, index);
  }
  return undefined;
}

function countChar(value: string, char: string): number {
  return [...value].filter((candidate) => candidate === char).length;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function androidVariantSlug(variant: string): string {
  return variant.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
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

function addBazelPlans(plans: CommandPlan[], root: string, paths: string[]): void {
  const bazel = existsSync(join(root, "bazelisk")) ? "./bazelisk" : existsSync(join(root, "bazel")) ? "./bazel" : "bazel";
  const targets = bazelChangedTargetPatterns(root, paths);
  const targetArgs = targets.join(" ");
  const narrowed = targetArgs !== "//...";
  pushUnique(plans, {
    id: narrowed ? "bazel-changed-tests" : "bazel-tests",
    label: narrowed ? "Bazel changed-package tests" : "Bazel tests",
    command: `${bazel} test ${targetArgs}`,
    reason: narrowed
      ? "Bazel source or package files changed, so the nearest recursive target patterns should run through Bazel."
      : "Bazel workspace metadata changed or no nearest package was found, so all test targets should run through Bazel's target graph.",
    ecosystem: "bazel",
    required: true
  });
  pushUnique(plans, {
    id: narrowed ? "bazel-changed-build" : "bazel-build",
    label: narrowed ? "Bazel changed-package build" : "Bazel build",
    command: `${bazel} build ${targetArgs}`,
    reason: narrowed
      ? "Bazel changed packages should still analyze and build with their recursive target patterns."
      : "Bazel build graph should still analyze and build after workspace or source changes.",
    ecosystem: "bazel",
    required: false
  });
  if (narrowed) {
    const downstreamQuery = `rdeps(//..., set(${targetArgs}))`;
    pushUnique(plans, {
      id: "bazel-downstream-query",
      label: "Bazel downstream reverse-dependency query",
      command: `${bazel} query ${quoteShell(downstreamQuery)}`,
      reason: "Bazel changed-package patterns can miss downstream owners; rdeps shows graph-wide reverse dependencies for review before expanding tests.",
      ecosystem: "bazel",
      required: false
    });
    pushUnique(plans, {
      id: "bazel-downstream-tests",
      label: "Bazel downstream test targets",
      command: downstreamTargetsCommand(bazel, "query", `tests(${downstreamQuery})`, "test", "No downstream Bazel tests found"),
      reason: "Bazel rdeps can be promoted through tests(...) into executable downstream test targets after review.",
      ecosystem: "bazel",
      required: false
    });
  }
}

function addBuckPlans(plans: CommandPlan[], root: string, paths: string[]): void {
  const buck = existsSync(join(root, "buck2")) ? "./buck2" : "buck2";
  const targets = buckChangedTargetPatterns(root, paths);
  const targetArgs = targets.join(" ");
  const narrowed = targetArgs !== "//...";
  pushUnique(plans, {
    id: narrowed ? "buck-changed-tests" : "buck-tests",
    label: narrowed ? "Buck changed-package tests" : "Buck tests",
    command: `${buck} test ${targetArgs}`,
    reason: narrowed
      ? "Buck source or package files changed, so the nearest recursive target patterns should run through Buck."
      : "Buck workspace metadata changed or no nearest package was found, so test targets should run through Buck's target graph.",
    ecosystem: "buck",
    required: true
  });
  pushUnique(plans, {
    id: narrowed ? "buck-changed-build" : "buck-build",
    label: narrowed ? "Buck changed-package build" : "Buck build",
    command: `${buck} build ${targetArgs}`,
    reason: narrowed
      ? "Buck changed packages should still analyze and build with their recursive target patterns."
      : "Buck build graph should still analyze and build after target or source changes.",
    ecosystem: "buck",
    required: false
  });
  if (narrowed) {
    const downstreamQuery = `rdeps(//..., set(${targetArgs}))`;
    pushUnique(plans, {
      id: "buck-downstream-uquery",
      label: "Buck downstream reverse-dependency query",
      command: `${buck} uquery ${quoteShell(downstreamQuery)}`,
      reason: "Buck changed-package patterns can miss downstream owners; uquery rdeps shows graph-wide reverse dependencies for review before expanding tests.",
      ecosystem: "buck",
      required: false
    });
    pushUnique(plans, {
      id: "buck-downstream-tests",
      label: "Buck downstream test targets",
      command: downstreamTargetsCommand(buck, "uquery", `testsof(${downstreamQuery})`, "test", "No downstream Buck tests found"),
      reason: "Buck uquery rdeps can be promoted through testsof(...) into executable downstream test targets after review.",
      ecosystem: "buck",
      required: false
    });
  }
}

function downstreamTargetsCommand(tool: string, querySubcommand: string, query: string, runSubcommand: string, emptyMessage: string): string {
  return `targets="$(${tool} ${querySubcommand} ${quoteShell(query)})" && if [ -n "$targets" ]; then ${tool} ${runSubcommand} $targets; else echo ${quoteShell(emptyMessage)}; fi`;
}

function bazelChangedTargetPatterns(root: string, paths: string[]): string[] {
  if (touchesBazelRootMetadata(paths)) return ["//..."];
  const patterns = new Set<string>();
  for (const path of paths) {
    if (!touchesBazel([path])) continue;
    const packageRoot = nearestManifestRoot(root, path, ["BUILD.bazel", "BUILD"]);
    if (!packageRoot) return ["//..."];
    const pattern = bazelTargetPattern(packageRoot);
    if (!pattern) return ["//..."];
    patterns.add(pattern);
  }
  return patterns.size > 0 ? [...patterns].sort() : ["//..."];
}

function buckChangedTargetPatterns(root: string, paths: string[]): string[] {
  if (touchesBuckRootMetadata(paths)) return ["//..."];
  const patterns = new Set<string>();
  for (const path of paths) {
    if (!touchesBuck([path])) continue;
    const packageRoot = nearestManifestRoot(root, path, ["BUCK", "BUCK.v2"]);
    if (!packageRoot) return ["//..."];
    const pattern = buckTargetPattern(packageRoot);
    if (!pattern) return ["//..."];
    patterns.add(pattern);
  }
  return patterns.size > 0 ? [...patterns].sort() : ["//..."];
}

function bazelTargetPattern(packageRoot: string): string | undefined {
  if (packageRoot === ".") return "//:all";
  if (!isBuildTargetPackagePath(packageRoot)) return undefined;
  return `//${packageRoot}/...`;
}

function buckTargetPattern(packageRoot: string): string | undefined {
  if (packageRoot === ".") return "//:";
  if (!isBuildTargetPackagePath(packageRoot)) return undefined;
  return `//${packageRoot}/...`;
}

function isBuildTargetPackagePath(path: string): boolean {
  return /^[A-Za-z0-9_./+=,@~-]+$/.test(path) && !path.includes("//") && !path.split("/").includes("..");
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
  return touches(paths, [".cs", ".fs", ".vb", ".csproj", ".fsproj", ".vbproj", ".sln", ".slnf", ".props", ".targets", "global.json", "Directory.Build.props", "Directory.Build.targets"]);
}

function touchesDotnetRootMetadata(paths: string[]): boolean {
  return paths.some((path) => path === "global.json" || path.endsWith(".sln") || path.endsWith(".slnf") || path === "Directory.Build.props" || path === "Directory.Build.targets");
}

function touchesAndroid(paths: string[]): boolean {
  return paths.some((path) =>
    touches([path], [".java", ".kt", ".kts", ".xml", ".gradle", ".gradle.kts", "AndroidManifest.xml", "gradle.properties", "settings.gradle", "settings.gradle.kts"]) ||
    path === "gradlew" ||
    path.startsWith("gradle/") ||
    /(^|\/)(res|assets|aidl|jni|cpp)\//.test(path)
  );
}

function touchesXcode(paths: string[]): boolean {
  return paths.some((path) =>
    touches([path], [
      ".swift",
      ".m",
      ".mm",
      ".h",
      ".hpp",
      ".storyboard",
      ".xib",
      ".plist",
      ".xcconfig",
      ".entitlements",
      ".xcscheme",
      ".xctestplan",
      "Package.resolved",
      "project.pbxproj"
    ]) ||
    path.includes(".xcodeproj/") ||
    path.includes(".xcworkspace/")
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

function touchesBazelRootMetadata(paths: string[]): boolean {
  return paths.some((path) => path === "MODULE.bazel" || path === "WORKSPACE" || path === "WORKSPACE.bazel" || path === ".bazelrc");
}

function touchesBuck(paths: string[]): boolean {
  return paths.some((path) => path === ".buckconfig" || path === "BUCK" || path === "BUCK.v2" || path.endsWith("/BUCK") || path.endsWith("/BUCK.v2") || isSourceLikePath(path));
}

function touchesBuckRootMetadata(paths: string[]): boolean {
  return paths.some((path) => path === ".buckconfig");
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

function findFilesWithExtension(root: string, extension: string, maxDepth: number): string[] {
  const results: string[] = [];
  const ignoredDirs = new Set([".git", "node_modules", "dist", "coverage", ".next", "bin", "obj"]);

  const walk = (relativeDir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, relativeDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) walk(relativePath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        results.push(relativePath);
      }
    }
  };

  walk("", 0);
  return results.sort();
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

function toRepoPath(path: string): string {
  return path.replaceAll("\\", "/");
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

function pascalCase(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "package";
}
