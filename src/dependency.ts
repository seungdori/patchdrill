import { readFilePair, type GitDiffOptions } from "./git.js";
import type { ChangedFile, DependencyChange } from "./types.js";
import { parse as parseYaml } from "yaml";

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

type DependencyField = (typeof dependencyFields)[number];
type PackageJson = Partial<Record<DependencyField, Record<string, string>>>;
interface LockPackage {
  name: string;
  path: string;
  version: string;
}

export function analyzeDependencyChanges(options: GitDiffOptions, changedFiles: ChangedFile[]): DependencyChange[] {
  const changes: DependencyChange[] = [];
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("package.json"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePackageJson(pair.before);
    const after = parsePackageJson(pair.after);
    if (!before && !after) continue;
    changes.push(...diffPackageJson(file.path, before ?? {}, after ?? {}));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("package-lock.json"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePackageLock(pair.before);
    const after = parsePackageLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("pnpm-lock.yaml"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePnpmLock(pair.before);
    const after = parsePnpmLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("yarn.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseYarnLock(pair.before);
    const after = parseYarnLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("go.sum"))) {
    const pair = readFilePair(options, file.path);
    const before = parseGoSum(pair.before);
    const after = parseGoSum(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  return changes.sort((a, b) =>
    `${a.file}:${a.dependencyType}:${a.packageName}:${a.packagePath ?? ""}`.localeCompare(`${b.file}:${b.dependencyType}:${b.packageName}:${b.packagePath ?? ""}`)
  );
}

function diffPackageJson(file: string, before: PackageJson, after: PackageJson): DependencyChange[] {
  const changes: DependencyChange[] = [];
  for (const dependencyType of dependencyFields) {
    const beforeDeps = before[dependencyType] ?? {};
    const afterDeps = after[dependencyType] ?? {};
    const names = new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)]);
    for (const packageName of names) {
      const beforeVersion = beforeDeps[packageName];
      const afterVersion = afterDeps[packageName];
      if (beforeVersion === afterVersion) continue;
      if (beforeVersion === undefined && afterVersion !== undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "added", after: afterVersion });
      } else if (beforeVersion !== undefined && afterVersion === undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "removed", before: beforeVersion });
      } else if (beforeVersion !== undefined && afterVersion !== undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "updated", before: beforeVersion, after: afterVersion });
      }
    }
  }
  return changes;
}

function parsePackageJson(value: string | undefined): PackageJson | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as PackageJson;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function diffLockPackages(file: string, before: Map<string, LockPackage>, after: Map<string, LockPackage>): DependencyChange[] {
  const changes: DependencyChange[] = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const packagePath of paths) {
    const beforePackage = before.get(packagePath);
    const afterPackage = after.get(packagePath);
    if (beforePackage?.version === afterPackage?.version) continue;
    const packageName = afterPackage?.name ?? beforePackage?.name ?? packagePath;
    if (!beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        packagePath,
        dependencyType: "lockfile",
        changeType: "added",
        after: afterPackage.version
      });
    } else if (beforePackage && !afterPackage) {
      changes.push({
        file,
        packageName,
        packagePath,
        dependencyType: "lockfile",
        changeType: "removed",
        before: beforePackage.version
      });
    } else if (beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        packagePath,
        dependencyType: "lockfile",
        changeType: "updated",
        before: beforePackage.version,
        after: afterPackage.version
      });
    }
  }
  return changes;
}

function diffNameVersionLockPackages(file: string, before: Map<string, LockPackage>, after: Map<string, LockPackage>): DependencyChange[] {
  const changes: DependencyChange[] = [];
  const beforeByName = groupLockPackagesByName(before);
  const afterByName = groupLockPackagesByName(after);
  const names = new Set([...beforeByName.keys(), ...afterByName.keys()]);
  const fallbackBefore = new Map<string, LockPackage>();
  const fallbackAfter = new Map<string, LockPackage>();

  for (const name of names) {
    const beforePackages = beforeByName.get(name) ?? [];
    const afterPackages = afterByName.get(name) ?? [];
    if (beforePackages.length === 1 && afterPackages.length === 1) {
      const beforePackage = beforePackages[0];
      const afterPackage = afterPackages[0];
      if (!beforePackage || !afterPackage || beforePackage.version === afterPackage.version) continue;
      changes.push({
        file,
        packageName: name,
        packagePath: `${beforePackage.path} -> ${afterPackage.path}`,
        dependencyType: "lockfile",
        changeType: "updated",
        before: beforePackage.version,
        after: afterPackage.version
      });
      continue;
    }
    for (const item of beforePackages) fallbackBefore.set(item.path, item);
    for (const item of afterPackages) fallbackAfter.set(item.path, item);
  }

  changes.push(...diffLockPackages(file, fallbackBefore, fallbackAfter));
  return changes;
}

function groupLockPackagesByName(packages: Map<string, LockPackage>): Map<string, LockPackage[]> {
  const grouped = new Map<string, LockPackage[]>();
  for (const item of packages.values()) {
    const group = grouped.get(item.name) ?? [];
    group.push(item);
    grouped.set(item.name, group);
  }
  return grouped;
}

function parsePackageLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as {
      packages?: Record<string, { version?: unknown }>;
      dependencies?: Record<string, LockDependencyNode>;
    };
    if (parsed && typeof parsed === "object" && parsed.packages && typeof parsed.packages === "object") {
      return readPackageLockPackages(parsed.packages);
    }
    if (parsed && typeof parsed === "object" && parsed.dependencies && typeof parsed.dependencies === "object") {
      const packages = new Map<string, LockPackage>();
      collectLockDependencies(parsed.dependencies, packages);
      return packages;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function parsePnpmLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  try {
    const parsed = parseYaml(value) as { packages?: unknown };
    if (!isRecord(parsed.packages)) return undefined;
    const packages = new Map<string, LockPackage>();
    for (const [packagePath, entry] of Object.entries(parsed.packages)) {
      if (!isRecord(entry)) continue;
      const parsedKey = parsePnpmPackageKey(packagePath);
      if (!parsedKey) continue;
      packages.set(packagePath, {
        name: parsedKey.name,
        path: packagePath,
        version: parsedKey.version
      });
    }
    return packages;
  } catch {
    return undefined;
  }
}

function parseYarnLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, LockPackage>();
  const lines = value.split(/\r?\n/);
  let descriptor: string | undefined;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.startsWith("#")) continue;
    if (!/^\s/.test(rawLine) && rawLine.trim().endsWith(":")) {
      descriptor = normalizeYarnDescriptor(rawLine.trim().slice(0, -1));
      continue;
    }
    if (!descriptor) continue;
    const version = readYarnVersion(rawLine);
    if (!version) continue;
    const parsedDescriptor = parseYarnDescriptor(descriptor);
    if (!parsedDescriptor) continue;
    packages.set(descriptor, {
      name: parsedDescriptor.name,
      path: descriptor,
      version
    });
    descriptor = undefined;
  }

  return packages.size > 0 ? packages : undefined;
}

function parseGoSum(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, LockPackage>();
  for (const rawLine of value.split(/\r?\n/)) {
    const [name, rawVersion] = rawLine.trim().split(/\s+/, 3);
    if (!name || !rawVersion) continue;
    const version = rawVersion.replace(/\/go\.mod$/, "");
    const path = `${name}@${version}`;
    packages.set(path, { name, path, version });
  }
  return packages.size > 0 ? packages : undefined;
}

interface LockDependencyNode {
  version?: unknown;
  dependencies?: Record<string, LockDependencyNode>;
}

function readPackageLockPackages(packages: Record<string, { version?: unknown }>): Map<string, LockPackage> {
  const result = new Map<string, LockPackage>();
  for (const [packagePath, entry] of Object.entries(packages)) {
    if (!packagePath || typeof entry.version !== "string") continue;
    const name = packageNameFromLockPath(packagePath);
    if (!name) continue;
    result.set(packagePath, { name, path: packagePath, version: entry.version });
  }
  return result;
}

function collectLockDependencies(dependencies: Record<string, LockDependencyNode>, result: Map<string, LockPackage>, parentPath = ""): void {
  for (const [name, entry] of Object.entries(dependencies)) {
    if (typeof entry.version !== "string") continue;
    const packagePath = parentPath ? `${parentPath}/node_modules/${name}` : `node_modules/${name}`;
    result.set(packagePath, { name, path: packagePath, version: entry.version });
    if (entry.dependencies) collectLockDependencies(entry.dependencies, result, packagePath);
  }
}

function packageNameFromLockPath(packagePath: string): string | undefined {
  const tail = packagePath.split("node_modules/").at(-1);
  if (!tail) return undefined;
  const parts = tail.split("/");
  if (parts[0]?.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  return parts[0];
}

function parsePnpmPackageKey(rawKey: string): { name: string; version: string } | undefined {
  const key = rawKey.replace(/^\//, "");
  const separator = key.startsWith("@") ? key.indexOf("@", key.indexOf("/") + 1) : key.indexOf("@");
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1).split("(")[0]?.split("_")[0];
  if (!name || !version) return undefined;
  return { name, version };
}

function normalizeYarnDescriptor(value: string): string {
  return value.replace(/^"|"$/g, "").split(",")[0]?.trim().replace(/^"|"$/g, "") ?? value;
}

function readYarnVersion(line: string): string | undefined {
  const trimmed = line.trim();
  const classic = /^version\s+"([^"]+)"$/.exec(trimmed);
  if (classic?.[1]) return classic[1];
  const modern = /^version:\s*"?([^"\s]+)"?$/.exec(trimmed);
  return modern?.[1];
}

function parseYarnDescriptor(descriptor: string): { name: string } | undefined {
  const key = descriptor.replace(/^"|"$/g, "");
  const separator = key.startsWith("@") ? key.indexOf("@", key.indexOf("/") + 1) : key.indexOf("@");
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  return name ? { name } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
