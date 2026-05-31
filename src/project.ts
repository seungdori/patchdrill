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

  if (exists(root, "pyproject.toml")) {
    add({ ecosystem: "python", manifestPath: "pyproject.toml" });
  } else if (exists(root, "requirements.txt") || exists(root, "setup.py") || exists(root, "setup.cfg")) {
    add({
      ecosystem: "python",
      manifestPath: firstExisting(root, ["requirements.txt", "setup.py", "setup.cfg"]) ?? "python"
    });
  }

  if (exists(root, "Cargo.toml")) {
    add({
      ecosystem: "rust",
      manifestPath: "Cargo.toml",
      workspacePackages: discoverCargoWorkspacePackages(root)
    });
  }
  if (exists(root, "go.mod")) add({ ecosystem: "go", manifestPath: "go.mod" });
  if (exists(root, "pom.xml") || exists(root, "build.gradle") || exists(root, "build.gradle.kts")) {
    add({
      ecosystem: "java",
      manifestPath: firstExisting(root, ["pom.xml", "build.gradle", "build.gradle.kts"]) ?? "java"
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
  if (exists(root, "Dockerfile") || exists(root, "compose.yaml") || exists(root, "docker-compose.yml")) {
    add({
      ecosystem: "docker",
      manifestPath: firstExisting(root, ["Dockerfile", "compose.yaml", "docker-compose.yml"]) ?? "docker"
    });
  }
  if (hasTerraform(root)) add({ ecosystem: "terraform", manifestPath: "*.tf" });
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
