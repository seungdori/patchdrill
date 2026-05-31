import { readFilePair, type GitDiffOptions } from "./git.js";
import type { ChangedFile, DependencyChange } from "./types.js";

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
    changes.push(...diffPackageLock(file.path, before ?? new Map(), after ?? new Map()));
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

function diffPackageLock(file: string, before: Map<string, LockPackage>, after: Map<string, LockPackage>): DependencyChange[] {
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
