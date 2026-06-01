import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectSignal, WorkspacePackage } from "./types.js";

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

  const pythonManifestPath = firstExisting(root, ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "manage.py"]);
  if (pythonManifestPath) {
    const framework = detectPythonFramework(root);
    add({
      ecosystem: "python",
      manifestPath: pythonManifestPath,
      ...(framework ? { framework } : {})
    });
  }

  if (exists(root, "Cargo.toml")) {
    add({
      ecosystem: "rust",
      manifestPath: "Cargo.toml",
      workspacePackages: discoverCargoWorkspacePackages(root)
    });
  }
  if (exists(root, "go.mod") || exists(root, "go.work")) {
    add({
      ecosystem: "go",
      manifestPath: firstExisting(root, ["go.work", "go.mod"]) ?? "go",
      workspacePackages: discoverGoWorkspacePackages(root)
    });
  }
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
  if (exists(root, "Gemfile")) add({ ecosystem: "ruby", manifestPath: "Gemfile" });
  if (exists(root, "composer.json")) add({ ecosystem: "php", manifestPath: "composer.json" });
  if (exists(root, "global.json") || hasFileWithExtension(root, ".csproj", 2)) {
    add({
      ecosystem: "dotnet",
      manifestPath: firstExisting(root, ["global.json"]) ?? "*.csproj"
    });
  }
  if (exists(root, "Package.swift")) add({ ecosystem: "swift", manifestPath: "Package.swift" });
  if (exists(root, "Dockerfile") || exists(root, "compose.yaml") || exists(root, "docker-compose.yml")) {
    add({
      ecosystem: "docker",
      manifestPath: firstExisting(root, ["Dockerfile", "compose.yaml", "docker-compose.yml"]) ?? "docker"
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

function discoverCargoWorkspacePackages(root: string): WorkspacePackage[] {
  let rootManifest = "";
  try {
    rootManifest = readFileSync(join(root, "Cargo.toml"), "utf8");
  } catch {
    return [];
  }
  const members = readCargoWorkspaceMembers(rootManifest);
  if (members.length === 0) return [];
  const packages = new Map<string, WorkspacePackage>();

  for (const pattern of members) {
    for (const packagePath of expandWorkspacePattern(root, pattern, "Cargo.toml")) {
      const manifest = readCargoManifest(join(root, packagePath));
      if (!manifest.name) continue;
      const workspacePackage: WorkspacePackage = {
        name: manifest.name,
        path: packagePath,
        scripts: {}
      };
      if (manifest.dependencies.length > 0) workspacePackage.dependencies = manifest.dependencies;
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

function discoverGoWorkspacePackages(root: string): WorkspacePackage[] {
  let workspace = "";
  try {
    workspace = readFileSync(join(root, "go.work"), "utf8");
  } catch {
    return [];
  }
  const modules = readGoWorkspaceModules(workspace);
  if (modules.length === 0) return [];
  const packages = new Map<string, WorkspacePackage>();

  for (const modulePath of modules) {
    const manifest = readGoModuleManifest(join(root, modulePath));
    if (!manifest.name) continue;
    const workspacePackage: WorkspacePackage = {
      name: manifest.name,
      path: modulePath,
      scripts: {}
    };
    if (manifest.dependencies.length > 0) workspacePackage.dependencies = manifest.dependencies;
    packages.set(modulePath, workspacePackage);
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
  const prefix = normalized.split("*", 1)[0]?.replace(/\/$/, "") ?? "";
  const base = prefix || ".";
  return walkForManifest(join(root, base), root, manifestName, normalized.includes("**") ? 5 : 1);
}

function walkForManifest(directory: string, root: string, manifestName: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    const results: string[] = [];
    if (entries.some((entry) => entry.isFile() && entry.name === manifestName)) {
      results.push(relativePath(root, directory));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      results.push(...walkForManifest(join(directory, entry.name), root, manifestName, maxDepth, depth + 1));
    }
    return results;
  } catch {
    return [];
  }
}

function shouldSkipDirectory(name: string): boolean {
  return ["node_modules", ".git", "dist", "coverage", ".next", "build"].includes(name);
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

function hasFileWithExtension(root: string, extension: string, maxDepth: number): boolean {
  return walkForExtension(root, extension, maxDepth, 0);
}

function walkForExtension(directory: string, extension: string, maxDepth: number, depth: number): boolean {
  if (depth > maxDepth) return false;
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) return true;
      if (entry.isDirectory() && walkForExtension(path, extension, maxDepth, depth + 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
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

function walkForFileMentioning(directory: string, root: string, fileNames: Set<string>, needles: string[], maxDepth: number, depth: number): string | undefined {
  if (depth > maxDepth) return undefined;
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
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

function walkForFileName(directory: string, fileName: string, maxDepth: number, depth: number): boolean {
  if (depth > maxDepth) return false;
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === fileName) return true;
      if (entry.isDirectory() && walkForFileName(path, fileName, maxDepth, depth + 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}
