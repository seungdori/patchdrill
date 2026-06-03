import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectSignal, WorkspacePackage } from "./types.js";

const PYTHON_MANIFEST_NAMES = ["pyproject.toml", "uv.lock", "requirements.txt", "setup.py", "setup.cfg", "manage.py"];
const NESTED_PROJECT_MAX_DEPTH = 5;

export function discoverProjectSignals(root: string): ProjectSignal[] {
  const signals: ProjectSignal[] = [];
  const add = (signal: ProjectSignal) => signals.push(signal);

  if (exists(root, "package.json")) {
    const packageJson = readPackageJson(root);
    const taskRunner = detectNodeTaskRunner(root, packageJson);
    add({
      ecosystem: "node",
      manifestPath: "package.json",
      packageManager: detectNodePackageManager(root),
      ...(taskRunner ? { taskRunner } : {}),
      scripts: packageJson.scripts ?? {},
      workspacePackages: discoverNodeWorkspacePackages(root)
    });
  }

  const pythonManifestPath = firstExisting(root, PYTHON_MANIFEST_NAMES);
  if (pythonManifestPath) {
    const framework = detectPythonFramework(root);
    const entrypoint = detectPythonEntrypoint(root, framework);
    add({
      ecosystem: "python",
      manifestPath: pythonManifestPath,
      ...(framework ? { framework } : {}),
      ...(entrypoint ? { entrypoint } : {})
    });
  }
  for (const signal of discoverNestedPythonSignals(root)) add(signal);

  if (exists(root, "Cargo.toml")) {
    add({
      ecosystem: "rust",
      manifestPath: "Cargo.toml",
      workspacePackages: discoverCargoWorkspacePackages(root, "Cargo.toml")
    });
  }
  for (const signal of discoverNestedRustSignals(root)) add(signal);
  const goManifestPath = firstExisting(root, ["go.work", "go.mod"]);
  if (goManifestPath) {
    add({
      ecosystem: "go",
      manifestPath: goManifestPath,
      workspacePackages: discoverGoWorkspacePackages(root, goManifestPath)
    });
  }
  for (const signal of discoverNestedGoSignals(root)) add(signal);
  const androidManifestPath = findAndroidManifestPath(root);
  if (androidManifestPath) {
    add({
      ecosystem: "android",
      manifestPath: androidManifestPath
    });
  }

  const javaManifestPath = firstExisting(root, ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]);
  if (javaManifestPath && !androidManifestPath) {
    const framework = detectJavaFramework(root);
    add({
      ecosystem: "java",
      manifestPath: javaManifestPath,
      ...(framework ? { framework } : {})
    });
  }
  if (exists(root, "Gemfile")) {
    const framework = detectRubyFramework(root);
    add({
      ecosystem: "ruby",
      manifestPath: "Gemfile",
      ...(framework ? { framework } : {})
    });
  }
  if (exists(root, "composer.json")) {
    const framework = detectPhpFramework(root);
    const scripts = readComposerScripts(root);
    add({
      ecosystem: "php",
      manifestPath: "composer.json",
      ...(framework ? { framework } : {}),
      ...(Object.keys(scripts).length > 0 ? { scripts } : {})
    });
  }
  const dotnetManifestPath = findDotnetManifestPath(root);
  if (dotnetManifestPath) {
    const framework = detectDotnetFramework(root);
    add({
      ecosystem: "dotnet",
      manifestPath: dotnetManifestPath,
      ...(framework ? { framework } : {})
    });
  }
  if (exists(root, "Package.swift")) add({ ecosystem: "swift", manifestPath: "Package.swift" });
  const xcodeManifestPath = findXcodeManifestPath(root);
  if (xcodeManifestPath) add({ ecosystem: "xcode", manifestPath: xcodeManifestPath });
  const dockerManifestPath = findDockerManifestPath(root);
  if (dockerManifestPath) {
    add({
      ecosystem: "docker",
      manifestPath: dockerManifestPath
    });
  }
  if (exists(root, "pants.toml")) add({ ecosystem: "pants", manifestPath: "pants.toml" });
  const bazelManifestPath = findBazelManifestPath(root);
  if (bazelManifestPath) add({ ecosystem: "bazel", manifestPath: bazelManifestPath });
  const buckManifestPath = findBuckManifestPath(root);
  if (buckManifestPath) add({ ecosystem: "buck", manifestPath: buckManifestPath });
  if (hasTerraform(root)) add({ ecosystem: "terraform", manifestPath: "*.tf" });
  const kubernetesManifestPath = findKubernetesManifestPath(root);
  if (kubernetesManifestPath) add({ ecosystem: "kubernetes", manifestPath: kubernetesManifestPath });
  if (exists(root, ".github/workflows")) add({ ecosystem: "github-actions", manifestPath: ".github/workflows" });

  return signals;
}

function exists(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

function firstExisting(root: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => exists(root, candidate));
}

function detectNodePackageManager(root: string): string {
  if (exists(root, "pnpm-lock.yaml")) return "pnpm";
  if (exists(root, "yarn.lock")) return "yarn";
  if (exists(root, "bun.lockb") || exists(root, "bun.lock")) return "bun";
  return "npm";
}

function readPackageJson(root: string): {
  name?: string;
  scripts?: Record<string, string>;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
} {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
      workspaces?: unknown;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return parsed;
  } catch {
    return {};
  }
}

function detectPythonFramework(root: string): ProjectSignal["framework"] | undefined {
  if (exists(root, "manage.py")) return "django";
  if (pythonDependencyDeclared(root, "django")) return "django";
  if (pythonDependencyDeclared(root, "fastapi")) return "fastapi";
  return undefined;
}

function detectPythonEntrypoint(root: string, framework: ProjectSignal["framework"] | undefined): string | undefined {
  if (framework === "fastapi") return findFastApiEntrypoint(root);
  return undefined;
}

function findFastApiEntrypoint(root: string): string | undefined {
  for (const path of ["main.py", "app/main.py", "src/main.py", "src/app/main.py"]) {
    const entrypoint = parseFastApiEntrypoint(root, path);
    if (entrypoint) return entrypoint;
  }
  const nestedPath = findFileWithExtensionMentioning(root, ".py", ["FastAPI("], 4);
  return nestedPath ? parseFastApiEntrypoint(root, nestedPath) : undefined;
}

function parseFastApiEntrypoint(root: string, path: string): string | undefined {
  try {
    const content = readFileSync(join(root, path), "utf8");
    const match = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FastAPI\s*\(/.exec(content);
    if (!match?.[1]) return undefined;
    const moduleName = pythonModuleName(path);
    if (!moduleName) return undefined;
    return `${moduleName}:${match[1]}`;
  } catch {
    return undefined;
  }
}

function pythonModuleName(path: string): string | undefined {
  const withoutSourceRoot = path.startsWith("src/") ? path.slice("src/".length) : path;
  const moduleName = withoutSourceRoot.replace(/\.py$/, "").replaceAll("/", ".");
  return moduleName.split(".").every(isPythonIdentifier) ? moduleName : undefined;
}

function isPythonIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function pythonDependencyDeclared(root: string, packageName: string): boolean {
  return ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"].some((path) => pythonManifestMentionsPackage(root, path, packageName));
}

function pythonManifestMentionsPackage(root: string, path: string, packageName: string): boolean {
  try {
    const content = readFileSync(join(root, path), "utf8");
    const normalizedName = packageName.toLowerCase().replaceAll("_", "-");
    const searchable = content
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
      .join("\n")
      .replaceAll("_", "-");
    const escapedName = escapeRegExp(normalizedName);
    const dependencyPattern = new RegExp(`(^|[^a-z0-9.-])${escapedName}(?:\\[[^\\]]+\\])?\\s*($|[<>=!~;,\\]"'])`, "i");
    return dependencyPattern.test(searchable);
  } catch {
    return false;
  }
}

function detectJavaFramework(root: string): ProjectSignal["framework"] | undefined {
  if (javaManifestMentions(root, ["org.springframework.boot", "spring-boot-starter"])) return "spring-boot";
  return undefined;
}

function detectRubyFramework(root: string): ProjectSignal["framework"] | undefined {
  if (exists(root, "config/application.rb")) return "rails";
  if (rubyManifestMentions(root, ["gem \"rails\"", "gem 'rails'", " rails ("])) return "rails";
  return undefined;
}

function detectPhpFramework(root: string): ProjectSignal["framework"] | undefined {
  if (exists(root, "artisan")) return "laravel";
  if (composerManifestMentions(root, ["laravel/framework"])) return "laravel";
  return undefined;
}

function detectDotnetFramework(root: string): ProjectSignal["framework"] | undefined {
  if (findFileWithExtensionMentioning(root, ".csproj", ["Microsoft.NET.Sdk.Web", "Microsoft.AspNetCore"], 4)) return "aspnet-core";
  return undefined;
}

function rubyManifestMentions(root: string, needles: string[]): boolean {
  return ["Gemfile", "Gemfile.lock"].some((path) => {
    try {
      const content = readFileSync(join(root, path), "utf8").toLowerCase();
      return needles.some((needle) => content.includes(needle.toLowerCase()));
    } catch {
      return false;
    }
  });
}

function composerManifestMentions(root: string, needles: string[]): boolean {
  try {
    const content = readFileSync(join(root, "composer.json"), "utf8").toLowerCase();
    return needles.some((needle) => content.includes(needle.toLowerCase()));
  } catch {
    return false;
  }
}

function readComposerScripts(root: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "composer.json"), "utf8")) as { scripts?: unknown };
    if (!isRecord(parsed.scripts)) return {};
    const scripts: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed.scripts)) {
      if (typeof value === "string") scripts[name] = value;
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) scripts[name] = value.join(" && ");
    }
    return scripts;
  } catch {
    return {};
  }
}

function findDotnetManifestPath(root: string): string | undefined {
  return firstExisting(root, ["global.json"]) ?? findFileWithExtension(root, ".slnf", 2) ?? findFileWithExtension(root, ".sln", 2) ?? findFileWithExtension(root, ".csproj", 3);
}

function findAndroidManifestPath(root: string): string | undefined {
  const directBuildFile = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts", "app/build.gradle", "app/build.gradle.kts"].find((path) =>
    androidManifestMentions(root, path)
  );
  if (directBuildFile) return directBuildFile;
  const nestedBuildFile = findFileMentioning(root, ["build.gradle", "build.gradle.kts"], ["com.android.application", "com.android.library"], 3);
  if (nestedBuildFile) return nestedBuildFile;
  if (hasFileNamed(root, "AndroidManifest.xml", 5)) return "AndroidManifest.xml";
  return undefined;
}

function findXcodeManifestPath(root: string): string | undefined {
  return findDirectoryWithExtension(root, ".xcworkspace", 3) ?? findDirectoryWithExtension(root, ".xcodeproj", 3);
}

function findDockerManifestPath(root: string): string | undefined {
  const candidates = ["Dockerfile", "compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];
  const direct = firstExisting(root, candidates);
  if (direct) return direct;
  for (const candidate of candidates) {
    const match = findFilesNamed(root, [candidate], 4)[0];
    if (match) return match;
  }
  return undefined;
}

function androidManifestMentions(root: string, path: string): boolean {
  try {
    const content = readFileSync(join(root, path), "utf8").toLowerCase();
    return content.includes("com.android.application") || content.includes("com.android.library") || content.includes("com.android.tools.build:gradle");
  } catch {
    return false;
  }
}

function javaManifestMentions(root: string, needles: string[]): boolean {
  return ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "gradle/libs.versions.toml"].some((path) => {
    try {
      const content = readFileSync(join(root, path), "utf8").toLowerCase();
      return needles.some((needle) => content.includes(needle.toLowerCase()));
    } catch {
      return false;
    }
  });
}

function detectNodeTaskRunner(root: string, manifest: ReturnType<typeof readPackageJson>): "turbo" | "nx" | undefined {
  if (exists(root, "turbo.json")) return "turbo";
  if (exists(root, "nx.json")) return "nx";
  if (hasPackageDependency(manifest, "turbo")) return "turbo";
  if (hasPackageDependency(manifest, "nx")) return "nx";
  if (scriptsMention(manifest.scripts, "turbo")) return "turbo";
  if (scriptsMention(manifest.scripts, "nx")) return "nx";
  return undefined;
}

function hasPackageDependency(manifest: ReturnType<typeof readPackageJson>, packageName: string): boolean {
  return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies].some((section) => Boolean(section?.[packageName]));
}

function scriptsMention(scripts: Record<string, string> | undefined, commandName: string): boolean {
  if (!scripts) return false;
  const pattern = new RegExp(`(^|[\\s&|;(])${escapeRegExp(commandName)}(\\s|$)`);
  return Object.values(scripts).some((script) => pattern.test(script));
}

function discoverNodeWorkspacePackages(root: string): WorkspacePackage[] {
  const patterns = readWorkspacePatterns(root);
  if (patterns.length === 0) return [];
  const packages = new Map<string, WorkspacePackage>();

  for (const pattern of patterns) {
    for (const packagePath of expandWorkspacePattern(root, pattern)) {
      const manifest = readPackageJson(join(root, packagePath));
      if (!manifest.name) continue;
      const projectMetadata = readProjectMetadata(join(root, packagePath));
      const workspacePackage: WorkspacePackage = {
        name: manifest.name,
        ...(projectMetadata.name && projectMetadata.name !== manifest.name ? { projectName: projectMetadata.name } : {}),
        path: packagePath,
        scripts: manifest.scripts ?? {},
        ...(projectMetadata.targets.length > 0 ? { targets: projectMetadata.targets } : {})
      };
      const dependencies = readPackageDependencyNames(manifest);
      if (dependencies.length > 0) workspacePackage.dependencies = dependencies;
      packages.set(packagePath, workspacePackage);
    }
  }

  const workspaceNames = new Set([...packages.values()].map((workspacePackage) => workspacePackage.name));
  return [...packages.values()]
    .map((workspacePackage) => {
      const dependencies = workspacePackage.dependencies?.filter((dependency) => workspaceNames.has(dependency)) ?? [];
      if (dependencies.length === 0) {
        const { dependencies: _dependencies, ...withoutDependencies } = workspacePackage;
        return withoutDependencies;
      }
      return { ...workspacePackage, dependencies };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readProjectMetadata(packageRoot: string): { name?: string; targets: string[] } {
  try {
    const parsed = JSON.parse(readFileSync(join(packageRoot, "project.json"), "utf8")) as { name?: unknown; targets?: unknown };
    const targets = isRecord(parsed.targets) ? Object.keys(parsed.targets).sort() : [];
    return {
      ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
      targets
    };
  } catch {
    return { targets: [] };
  }
}

function discoverNestedPythonSignals(root: string): ProjectSignal[] {
  const selected = new Map<string, string>();
  for (const manifestPath of findFilesNamed(root, PYTHON_MANIFEST_NAMES, NESTED_PROJECT_MAX_DEPTH)) {
    const projectRoot = parentPath(manifestPath) || ".";
    if (projectRoot === ".") continue;
    const existing = selected.get(projectRoot);
    if (!existing || manifestPriority(manifestPath, PYTHON_MANIFEST_NAMES) < manifestPriority(existing, PYTHON_MANIFEST_NAMES)) {
      selected.set(projectRoot, manifestPath);
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([projectRoot, manifestPath]) => {
      const packageRoot = join(root, projectRoot);
      const framework = detectPythonFramework(packageRoot);
      const entrypoint = detectPythonEntrypoint(packageRoot, framework);
      return {
        ecosystem: "python" as const,
        manifestPath,
        ...(framework ? { framework } : {}),
        ...(entrypoint ? { entrypoint } : {})
      };
    });
}

function discoverNestedRustSignals(root: string): ProjectSignal[] {
  const rootWorkspacePackageRoots = exists(root, "Cargo.toml")
    ? discoverCargoWorkspacePackages(root, "Cargo.toml").map((workspacePackage) => workspacePackage.path)
    : [];
  const manifests = findFilesNamed(root, ["Cargo.toml"], NESTED_PROJECT_MAX_DEPTH).filter((manifestPath) => {
    const projectRoot = parentPath(manifestPath);
    if (projectRoot === "") return false;
    return !rootWorkspacePackageRoots.some((packageRoot) => projectRoot === packageRoot || projectRoot.startsWith(`${packageRoot}/`));
  });
  const workspaceManifests = manifests.filter((manifestPath) => readCargoWorkspaceMembers(readText(root, manifestPath)).length > 0);
  const workspaceRoots = workspaceManifests.map((manifestPath) => parentPath(manifestPath)).sort((a, b) => a.localeCompare(b));
  const selected = new Set<string>();

  for (const manifestPath of workspaceManifests) selected.add(manifestPath);
  for (const manifestPath of manifests) {
    if (selected.has(manifestPath)) continue;
    const projectRoot = parentPath(manifestPath);
    if (workspaceRoots.some((workspaceRoot) => projectRoot.startsWith(`${workspaceRoot}/`))) continue;
    selected.add(manifestPath);
  }

  return [...selected]
    .sort((a, b) => a.localeCompare(b))
    .map((manifestPath) => ({
      ecosystem: "rust" as const,
      manifestPath,
      workspacePackages: discoverCargoWorkspacePackages(root, manifestPath)
    }));
}

function discoverNestedGoSignals(root: string): ProjectSignal[] {
  const rootWorkspaceModuleRoots = exists(root, "go.work")
    ? discoverGoWorkspacePackages(root, "go.work").map((workspacePackage) => workspacePackage.path)
    : [];
  const manifests = findFilesNamed(root, ["go.work", "go.mod"], NESTED_PROJECT_MAX_DEPTH).filter((manifestPath) => {
    const projectRoot = parentPath(manifestPath);
    if (projectRoot === "") return false;
    return !rootWorkspaceModuleRoots.some((moduleRoot) => projectRoot === moduleRoot || projectRoot.startsWith(`${moduleRoot}/`));
  });
  const workspaceManifests = manifests.filter((manifestPath) => fileName(manifestPath) === "go.work");
  const workspaceRoots = workspaceManifests.map((manifestPath) => parentPath(manifestPath)).sort((a, b) => a.localeCompare(b));
  const selected = new Set<string>();

  for (const manifestPath of workspaceManifests) selected.add(manifestPath);
  for (const manifestPath of manifests) {
    if (selected.has(manifestPath) || fileName(manifestPath) !== "go.mod") continue;
    const projectRoot = parentPath(manifestPath);
    // A go.work with `use .` places the root module at the workspace root itself,
    // so exclude an equal projectRoot too — otherwise it is double-listed as both a
    // workspace member and a standalone go signal.
    if (workspaceRoots.some((workspaceRoot) => projectRoot === workspaceRoot || projectRoot.startsWith(`${workspaceRoot}/`))) continue;
    selected.add(manifestPath);
  }

  return [...selected]
    .sort((a, b) => a.localeCompare(b))
    .map((manifestPath) => ({
      ecosystem: "go" as const,
      manifestPath,
      workspacePackages: fileName(manifestPath) === "go.work" ? discoverGoWorkspacePackages(root, manifestPath) : []
    }));
}

function discoverCargoWorkspacePackages(root: string, manifestPath: string): WorkspacePackage[] {
  let rootManifest: string;
  try {
    rootManifest = readFileSync(join(root, manifestPath), "utf8");
  } catch {
    return [];
  }
  const members = readCargoWorkspaceMembers(rootManifest);
  if (members.length === 0) return [];
  const packages = new Map<string, WorkspacePackage>();
  const workspaceRoot = parentPath(manifestPath) || ".";
  const absoluteWorkspaceRoot = workspaceRoot === "." ? root : join(root, workspaceRoot);

  for (const pattern of members) {
    for (const packagePath of expandWorkspacePattern(absoluteWorkspaceRoot, pattern, "Cargo.toml")) {
      const repoPackagePath = joinRepoPath(workspaceRoot, packagePath);
      const manifest = readCargoManifest(join(root, repoPackagePath));
      if (!manifest.name) continue;
      const workspacePackage: WorkspacePackage = {
        name: manifest.name,
        path: repoPackagePath,
        scripts: {}
      };
      if (manifest.dependencies.length > 0) workspacePackage.dependencies = manifest.dependencies;
      packages.set(repoPackagePath, workspacePackage);
    }
  }

  const workspaceNames = new Set([...packages.values()].map((workspacePackage) => workspacePackage.name));
  return [...packages.values()]
    .map((workspacePackage) => {
      const dependencies = workspacePackage.dependencies?.filter((dependency) => workspaceNames.has(dependency)) ?? [];
      if (dependencies.length === 0) {
        const { dependencies: _dependencies, ...withoutDependencies } = workspacePackage;
        return withoutDependencies;
      }
      return { ...workspacePackage, dependencies };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readCargoWorkspaceMembers(manifest: string): string[] {
  const workspaceSection = readTomlSection(manifest, "workspace");
  if (!workspaceSection) return [];
  const match = /^members\s*=\s*\[([\s\S]*?)\]/m.exec(workspaceSection);
  if (!match?.[1]) return [];
  return readTomlStringArray(match[1]).filter((member) => !member.startsWith("!"));
}

function readCargoManifest(packageRoot: string): { name?: string; dependencies: string[] } {
  try {
    const manifest = readFileSync(join(packageRoot, "Cargo.toml"), "utf8");
    return {
      ...readCargoPackageName(manifest),
      dependencies: readCargoDependencyNames(manifest)
    };
  } catch {
    return { dependencies: [] };
  }
}

function readCargoPackageName(manifest: string): { name?: string } {
  const packageSection = readTomlSection(manifest, "package");
  const match = packageSection ? /^name\s*=\s*["']([^"']+)["']/m.exec(packageSection) : undefined;
  return match?.[1] ? { name: match[1] } : {};
}

function readCargoDependencyNames(manifest: string): string[] {
  const dependencies = new Set<string>();
  let inDependencySection = false;
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section?.[1]) {
      inDependencySection = section[1] === "dependencies" || section[1] === "dev-dependencies" || section[1] === "build-dependencies" || section[1].endsWith(".dependencies");
      continue;
    }
    if (!inDependencySection) continue;
    const match = /^["']?([A-Za-z0-9_.-]+)["']?\s*=/.exec(line);
    if (match?.[1]) dependencies.add(match[1]);
  }
  return [...dependencies].sort();
}

function readTomlSection(manifest: string, sectionName: string): string | undefined {
  const lines = manifest.split(/\r?\n/);
  const sectionLines: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (section?.[1]) {
      if (inSection) break;
      inSection = section[1] === sectionName;
      continue;
    }
    if (inSection) sectionLines.push(line);
  }
  return sectionLines.length > 0 ? sectionLines.join("\n") : undefined;
}

function readTomlStringArray(value: string): string[] {
  const strings: string[] = [];
  const pattern = /"([^"]+)"|'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const item = match[1] ?? match[2];
    if (item) strings.push(item);
  }
  return strings;
}

function discoverGoWorkspacePackages(root: string, manifestPath: string): WorkspacePackage[] {
  let workspace: string;
  try {
    workspace = readFileSync(join(root, manifestPath), "utf8");
  } catch {
    return [];
  }
  const modules = readGoWorkspaceModules(workspace);
  if (modules.length === 0) return [];
  const packages = new Map<string, WorkspacePackage>();
  const workspaceRoot = parentPath(manifestPath) || ".";
  const absoluteWorkspaceRoot = workspaceRoot === "." ? root : join(root, workspaceRoot);

  for (const modulePath of modules) {
    const repoModulePath = joinRepoPath(workspaceRoot, modulePath);
    const manifest = readGoModuleManifest(join(absoluteWorkspaceRoot, modulePath));
    if (!manifest.name) continue;
    const workspacePackage: WorkspacePackage = {
      name: manifest.name,
      path: repoModulePath,
      scripts: {}
    };
    if (manifest.dependencies.length > 0) workspacePackage.dependencies = manifest.dependencies;
    packages.set(repoModulePath, workspacePackage);
  }

  const workspaceNames = new Set([...packages.values()].map((workspacePackage) => workspacePackage.name));
  return [...packages.values()]
    .map((workspacePackage) => {
      const dependencies = workspacePackage.dependencies?.filter((dependency) => workspaceNames.has(dependency)) ?? [];
      if (dependencies.length === 0) {
        const { dependencies: _dependencies, ...withoutDependencies } = workspacePackage;
        return withoutDependencies;
      }
      return { ...workspacePackage, dependencies };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readGoWorkspaceModules(workspace: string): string[] {
  const modules: string[] = [];
  let inUseBlock = false;
  for (const rawLine of workspace.split(/\r?\n/)) {
    const line = stripGoComment(rawLine).trim();
    if (!line) continue;
    if (/^use\s*\($/.test(line)) {
      inUseBlock = true;
      continue;
    }
    if (inUseBlock && line === ")") {
      inUseBlock = false;
      continue;
    }
    if (inUseBlock) {
      const modulePath = normalizeGoWorkspacePath(line);
      if (modulePath) modules.push(modulePath);
      continue;
    }
    if (line.startsWith("use ")) {
      const modulePath = normalizeGoWorkspacePath(line.slice(4).trim());
      if (modulePath) modules.push(modulePath);
    }
  }
  return [...new Set(modules)].sort();
}

function readGoModuleManifest(moduleRoot: string): { name?: string; dependencies: string[] } {
  try {
    const manifest = readFileSync(join(moduleRoot, "go.mod"), "utf8");
    return {
      ...readGoModuleName(manifest),
      dependencies: readGoRequireNames(manifest)
    };
  } catch {
    return { dependencies: [] };
  }
}

function readGoModuleName(manifest: string): { name?: string } {
  const match = /^module\s+(\S+)/m.exec(manifest);
  return match?.[1] ? { name: match[1] } : {};
}

function readGoRequireNames(manifest: string): string[] {
  const dependencies = new Set<string>();
  let inRequireBlock = false;
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = stripGoComment(rawLine).trim();
    if (!line) continue;
    if (/^require\s*\($/.test(line)) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && line === ")") {
      inRequireBlock = false;
      continue;
    }
    const requireLine = inRequireBlock ? line : line.startsWith("require ") ? line.slice(8).trim() : "";
    if (!requireLine) continue;
    const dependency = requireLine.split(/\s+/, 1)[0];
    if (dependency) dependencies.add(dependency);
  }
  return [...dependencies].sort();
}

function normalizeGoWorkspacePath(value: string): string | undefined {
  const normalized = value.replace(/^["']|["']$/g, "").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized) return undefined;
  return normalized === "." ? "." : normalized;
}

function stripGoComment(value: string): string {
  return value.replace(/\s*\/\/.*$/, "");
}

function readText(root: string, path: string): string {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return "";
  }
}

function manifestPriority(path: string, names: string[]): number {
  const priority = names.indexOf(fileName(path));
  return priority >= 0 ? priority : names.length;
}

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

function joinRepoPath(base: string, child: string): string {
  if (base === "." || !base) return child;
  if (child === ".") return base;
  return `${base}/${child}`;
}

function readPackageDependencyNames(manifest: ReturnType<typeof readPackageJson>): string[] {
  const dependencies = new Set<string>();
  for (const section of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies]) {
    if (!section) continue;
    for (const name of Object.keys(section)) dependencies.add(name);
  }
  return [...dependencies].sort();
}

function readWorkspacePatterns(root: string): string[] {
  const packageJson = readPackageJson(root);
  const patterns = new Set<string>();
  const workspaces = packageJson.workspaces;
  if (Array.isArray(workspaces)) {
    for (const pattern of workspaces) if (typeof pattern === "string") patterns.add(pattern);
  } else if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    for (const pattern of workspaces.packages) if (typeof pattern === "string") patterns.add(pattern);
  }

  if (exists(root, "pnpm-workspace.yaml")) {
    try {
      const parsed = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")) as { packages?: unknown };
      if (Array.isArray(parsed.packages)) {
        for (const pattern of parsed.packages) if (typeof pattern === "string") patterns.add(pattern);
      }
    } catch {
      // Ignore malformed workspace metadata; normal project detection still works.
    }
  }

  return [...patterns].filter((pattern) => !pattern.startsWith("!"));
}

function expandWorkspacePattern(root: string, pattern: string, manifestName = "package.json"): string[] {
  const normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized.includes("*")) return exists(root, join(normalized, manifestName)) ? [normalized] : [];
  const segments = normalized.split("/");
  const baseSegments: string[] = [];
  for (const segment of segments) {
    if (segment.includes("*")) break;
    baseSegments.push(segment);
  }
  const base = baseSegments.join("/") || ".";
  const hasGlobstar = normalized.includes("**");
  const maxDepth = hasGlobstar ? 10 : Math.max(1, segments.length - baseSegments.length);
  const matcher = workspacePatternToRegExp(normalized);
  // Walk candidate manifest directories, then keep only those whose full relative
  // path matches the glob — honoring segments after "*" and excluding the base
  // directory itself, which a single "*" must not match.
  return walkForManifest(join(root, base), root, manifestName, maxDepth)
    .filter((candidate) => candidate !== "." && matcher.test(candidate))
    .sort((a, b) => a.localeCompare(b));
}

function workspacePatternToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]+";
    } else {
      source += escapeRegExp(char ?? "");
    }
  }
  return new RegExp(`^${source}$`);
}

function walkForManifest(directory: string, root: string, manifestName: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readDirentsSorted(directory);
    const results: string[] = [];
    if (entries.some((entry) => entry.isFile() && entry.name === manifestName)) {
      results.push(relativePath(root, directory));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      for (const match of walkForManifest(join(directory, entry.name), root, manifestName, maxDepth, depth + 1)) {
        results.push(match);
      }
    }
    return results;
  } catch {
    return [];
  }
}

function shouldSkipDirectory(name: string): boolean {
  // Skip dependency stores, build output, and tool caches: they are never the
  // user's project source, and walking them (e.g. a huge .pnpm-store) wastes work.
  return [
    "node_modules",
    ".git",
    ".patchdrill",
    ".next",
    ".turbo",
    ".nx",
    "dist",
    "coverage",
    "build",
    "tmp",
    ".pnpm-store",
    ".yarn",
    ".venv",
    "venv",
    "__pycache__",
    ".uv-cache",
    ".ruff_cache",
    ".mypy_cache",
    ".pytest_cache"
  ].includes(name);
}

function relativePath(root: string, path: string): string {
  return path.slice(root.length).replace(/^\//, "") || ".";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// readdirSync order is filesystem-dependent. Single-result walkers must iterate
// deterministically (files before directories, then by name) so the same repo
// yields the same chosen path on every machine — the byte-identical promise.
function readDirentsSorted(directory: string): Dirent[] {
  return readdirSync(directory, { withFileTypes: true, encoding: "utf8" }).sort((a, b) => {
    const aFile = a.isFile();
    const bFile = b.isFile();
    if (aFile !== bFile) return aFile ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function findFileWithExtension(root: string, extension: string, maxDepth: number): string | undefined {
  return walkForExtensionPath(root, root, extension, maxDepth, 0);
}

function findDirectoryWithExtension(root: string, extension: string, maxDepth: number): string | undefined {
  return walkForDirectoryExtensionPath(root, root, extension, maxDepth, 0);
}

function findFilesNamed(root: string, fileNames: string[], maxDepth: number): string[] {
  return walkForFileNames(root, root, new Set(fileNames), maxDepth, 0).sort((a, b) => a.localeCompare(b));
}

function walkForFileNames(root: string, directory: string, fileNames: Set<string>, maxDepth: number, depth: number): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readDirentsSorted(directory);
    const results: string[] = [];
    for (const entry of entries) {
      if (shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && fileNames.has(entry.name)) results.push(relativePath(root, path));
      if (entry.isDirectory()) {
        for (const match of walkForFileNames(root, path, fileNames, maxDepth, depth + 1)) results.push(match);
      }
    }
    return results;
  } catch {
    return [];
  }
}

function walkForExtensionPath(root: string, directory: string, extension: string, maxDepth: number, depth: number): string | undefined {
  if (depth > maxDepth) return undefined;
  try {
    const entries = readDirentsSorted(directory);
    for (const entry of entries) {
      if (shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) return relativePath(root, path);
      if (entry.isDirectory()) {
        const match = walkForExtensionPath(root, path, extension, maxDepth, depth + 1);
        if (match) return match;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function walkForDirectoryExtensionPath(root: string, directory: string, extension: string, maxDepth: number, depth: number): string | undefined {
  if (depth > maxDepth) return undefined;
  try {
    const entries = readDirentsSorted(directory);
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.name.endsWith(extension)) return relativePath(root, path);
      const match = walkForDirectoryExtensionPath(root, path, extension, maxDepth, depth + 1);
      if (match) return match;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function hasTerraform(root: string): boolean {
  return ["main.tf", "variables.tf", "providers.tf", "terraform.tfvars"].some((file) => exists(root, file));
}

function findKubernetesManifestPath(root: string): string | undefined {
  const direct = firstExisting(root, ["Chart.yaml", "kustomization.yaml", "kustomization.yml", "k8s", "kubernetes", "manifests", "charts"]);
  if (direct) return direct;
  if (hasFileNamed(root, "Chart.yaml", 3)) return "Chart.yaml";
  if (hasFileNamed(root, "kustomization.yaml", 3) || hasFileNamed(root, "kustomization.yml", 3)) return "kustomization.yaml";
  return undefined;
}

function findBazelManifestPath(root: string): string | undefined {
  const direct = firstExisting(root, ["MODULE.bazel", "WORKSPACE.bazel", "WORKSPACE", ".bazelrc"]);
  if (direct) return direct;
  if (exists(root, "pants.toml")) return undefined;
  if (hasFileNamed(root, "BUILD.bazel", 3) || hasFileNamed(root, "BUILD", 3)) return "BUILD.bazel";
  return undefined;
}

function findBuckManifestPath(root: string): string | undefined {
  const direct = firstExisting(root, [".buckconfig", "BUCK", "BUCK.v2"]);
  if (direct) return direct;
  if (hasFileNamed(root, "BUCK", 3) || hasFileNamed(root, "BUCK.v2", 3)) return "BUCK";
  return undefined;
}

function hasFileNamed(root: string, fileName: string, maxDepth: number): boolean {
  return walkForFileName(root, fileName, maxDepth, 0);
}

function findFileMentioning(root: string, fileNames: string[], needles: string[], maxDepth: number): string | undefined {
  return walkForFileMentioning(root, root, new Set(fileNames), needles.map((needle) => needle.toLowerCase()), maxDepth, 0);
}

function findFileWithExtensionMentioning(root: string, extension: string, needles: string[], maxDepth: number): string | undefined {
  return walkForExtensionMentioning(root, root, extension, needles.map((needle) => needle.toLowerCase()), maxDepth, 0);
}

function walkForFileMentioning(directory: string, root: string, fileNames: Set<string>, needles: string[], maxDepth: number, depth: number): string | undefined {
  if (depth > maxDepth) return undefined;
  try {
    const entries = readDirentsSorted(directory);
    for (const entry of entries) {
      if (shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && fileNames.has(entry.name)) {
        const content = readFileSync(path, "utf8").toLowerCase();
        if (needles.some((needle) => content.includes(needle))) return relativePath(root, path);
      }
      if (entry.isDirectory()) {
        const match = walkForFileMentioning(path, root, fileNames, needles, maxDepth, depth + 1);
        if (match) return match;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function walkForExtensionMentioning(root: string, directory: string, extension: string, needles: string[], maxDepth: number, depth: number): string | undefined {
  if (depth > maxDepth) return undefined;
  try {
    const entries = readDirentsSorted(directory);
    for (const entry of entries) {
      if (shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) {
        const content = readFileSync(path, "utf8").toLowerCase();
        if (needles.some((needle) => content.includes(needle.toLowerCase()))) return relativePath(root, path);
      }
      if (entry.isDirectory()) {
        const match = walkForExtensionMentioning(root, path, extension, needles, maxDepth, depth + 1);
        if (match) return match;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function walkForFileName(directory: string, fileName: string, maxDepth: number, depth: number): boolean {
  if (depth > maxDepth) return false;
  try {
    const entries = readDirentsSorted(directory);
    for (const entry of entries) {
      if (shouldSkipDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === fileName) return true;
      if (entry.isDirectory() && walkForFileName(path, fileName, maxDepth, depth + 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}
