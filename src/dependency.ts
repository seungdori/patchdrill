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
interface RequirementPackage {
  name: string;
  displayName: string;
  key: string;
  spec: string;
}
interface ManifestDependency {
  name: string;
  key: string;
  spec: string;
  packagePath: string;
  dependencyType?: DependencyChange["dependencyType"];
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
  for (const file of changedFiles.filter((candidate) => isRequirementsFile(candidate.path))) {
    const pair = readFilePair(options, file.path);
    const before = parseRequirements(pair.before);
    const after = parseRequirements(pair.after);
    if (!before && !after) continue;
    changes.push(...diffRequirementPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("pyproject.toml"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePyprojectDependencies(pair.before);
    const after = parsePyprojectDependencies(pair.after);
    if (!before && !after) continue;
    changes.push(...diffManifestDependencies(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => isDotnetDependencyManifest(candidate.path))) {
    const pair = readFilePair(options, file.path);
    const before = parseDotnetDependencyManifest(pair.before);
    const after = parseDotnetDependencyManifest(pair.after);
    if (!before && !after) continue;
    changes.push(...diffManifestDependencies(file.path, before ?? new Map(), after ?? new Map()));
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
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("bun.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseBunLock(pair.before);
    const after = parseBunLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("go.sum"))) {
    const pair = readFilePair(options, file.path);
    const before = parseGoSum(pair.before);
    const after = parseGoSum(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("Cargo.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseTomlPackageLock(pair.before);
    const after = parseTomlPackageLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("poetry.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseTomlPackageLock(pair.before);
    const after = parseTomlPackageLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("uv.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseUvLock(pair.before);
    const after = parseUvLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("Pipfile.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePipfileLock(pair.before);
    const after = parsePipfileLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("Gemfile.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseGemfileLock(pair.before);
    const after = parseGemfileLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffNameVersionLockPackages(file.path, before ?? new Map(), after ?? new Map()));
  }
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("composer.lock"))) {
    const pair = readFilePair(options, file.path);
    const before = parseComposerLock(pair.before);
    const after = parseComposerLock(pair.after);
    if (!before && !after) continue;
    changes.push(...diffLockPackages(file.path, before ?? new Map(), after ?? new Map()));
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

function diffRequirementPackages(file: string, before: Map<string, RequirementPackage>, after: Map<string, RequirementPackage>): DependencyChange[] {
  const changes: DependencyChange[] = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of keys) {
    const beforePackage = before.get(key);
    const afterPackage = after.get(key);
    if (beforePackage?.spec === afterPackage?.spec) continue;
    const packageName = afterPackage?.name ?? beforePackage?.name ?? key;
    const packagePath = requirementPackagePath(afterPackage ?? beforePackage);
    if (!beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType: "dependencies",
        changeType: "added",
        after: afterPackage.spec
      });
    } else if (beforePackage && !afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType: "dependencies",
        changeType: "removed",
        before: beforePackage.spec
      });
    } else if (beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType: "dependencies",
        changeType: "updated",
        before: beforePackage.spec,
        after: afterPackage.spec
      });
    }
  }
  return changes;
}

function diffManifestDependencies(file: string, before: Map<string, ManifestDependency>, after: Map<string, ManifestDependency>): DependencyChange[] {
  const changes: DependencyChange[] = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of keys) {
    const beforePackage = before.get(key);
    const afterPackage = after.get(key);
    if (beforePackage?.spec === afterPackage?.spec) continue;
    const packageName = afterPackage?.name ?? beforePackage?.name ?? key;
    const packagePath = afterPackage?.packagePath ?? beforePackage?.packagePath;
    const dependencyType = afterPackage?.dependencyType ?? beforePackage?.dependencyType ?? "dependencies";
    if (!beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType,
        changeType: "added",
        after: afterPackage.spec
      });
    } else if (beforePackage && !afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType,
        changeType: "removed",
        before: beforePackage.spec
      });
    } else if (beforePackage && afterPackage) {
      changes.push({
        file,
        packageName,
        ...(packagePath ? { packagePath } : {}),
        dependencyType,
        changeType: "updated",
        before: beforePackage.spec,
        after: afterPackage.spec
      });
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

function parseRequirements(value: string | undefined): Map<string, RequirementPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, RequirementPackage>();
  for (const rawLine of value.split(/\r?\n/)) {
    const line = cleanRequirementLine(rawLine);
    if (!line) continue;
    const parsed = parseRequirementLine(line);
    if (!parsed) continue;
    packages.set(parsed.key, parsed);
  }
  return packages.size > 0 ? packages : undefined;
}

function parsePyprojectDependencies(value: string | undefined): Map<string, ManifestDependency> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, ManifestDependency>();
  const lines = value.split(/\r?\n/);
  let section = "";

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = stripTomlComment(lines[index] ?? "").trim();
    if (!trimmed) continue;
    const sectionMatch = /^\[([A-Za-z0-9_.-]+)\]$/.exec(trimmed);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1];
      continue;
    }

    if (section === "project" && /^dependencies\s*=/.test(trimmed)) {
      const result = readTomlStringArray(lines, index);
      index = result.endIndex;
      for (const spec of result.items) addPyprojectDependency(packages, "project.dependencies", "dependencies", spec);
      continue;
    }

    if (section === "project.optional-dependencies") {
      const match = /^([A-Za-z0-9_.-]+)\s*=/.exec(trimmed);
      if (!match?.[1]) continue;
      const result = readTomlStringArray(lines, index);
      index = result.endIndex;
      for (const spec of result.items) {
        addPyprojectDependency(packages, `project.optional-dependencies.${match[1]}`, "optionalDependencies", spec);
      }
      continue;
    }

    const poetryDependencyType = poetryDependencySectionType(section);
    if (poetryDependencyType) {
      const item = readTomlKeyValue(trimmed);
      if (!item) continue;
      addPoetryDependency(packages, section, poetryDependencyType, item.key, item.value);
    }
  }

  return packages.size > 0 ? packages : undefined;
}

function parseDotnetDependencyManifest(value: string | undefined): Map<string, ManifestDependency> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, ManifestDependency>();
  const packagePattern = /<(PackageReference|PackageVersion)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  for (const match of value.matchAll(packagePattern)) {
    const kind = match[1];
    const attributes = match[2] ?? "";
    const inner = match[3] ?? "";
    if (!kind) continue;
    const name = readXmlAttribute(attributes, "Include") ?? readXmlAttribute(attributes, "Update");
    if (!name) continue;
    const version = readXmlAttribute(attributes, "Version") ?? readXmlElement(inner, "Version") ?? "*";
    const packagePath = kind;
    packages.set(`${kind}:${name.toLowerCase()}`, {
      name,
      key: `${kind}:${name.toLowerCase()}`,
      spec: version,
      packagePath
    });
  }
  return packages.size > 0 ? packages : undefined;
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

function parseBunLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  try {
    const parsed = parseYaml(value) as { packages?: unknown };
    if (!isRecord(parsed.packages)) return undefined;
    const packages = new Map<string, LockPackage>();
    for (const [packagePath, entry] of Object.entries(parsed.packages)) {
      const version = readBunPackageVersion(entry);
      if (!packagePath || !version) continue;
      packages.set(packagePath, { name: packagePath, path: packagePath, version });
    }
    return packages.size > 0 ? packages : undefined;
  } catch {
    return undefined;
  }
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

function parseTomlPackageLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, LockPackage>();
  let current: Partial<Pick<LockPackage, "name" | "version">> | undefined;

  const flush = () => {
    if (!current?.name || !current.version) return;
    const path = `${current.name}@${current.version}`;
    packages.set(path, { name: current.name, path, version: current.version });
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (/^\[\[.*\]\]$/.test(trimmed)) {
      flush();
      current = trimmed === "[[package]]" ? {} : undefined;
      continue;
    }
    if (!current) continue;
    const match = /^(name|version)\s*=\s*"([^"]+)"/.exec(trimmed);
    if (!match?.[1] || !match[2]) continue;
    if (match[1] === "name") {
      current.name = match[2];
    } else {
      current.version = match[2];
    }
  }

  flush();
  return packages.size > 0 ? packages : undefined;
}

function parseUvLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, LockPackage>();
  let current: Partial<Pick<LockPackage, "name" | "version">> & { source?: string } | undefined;

  const flush = () => {
    if (!current?.name || !current.version) return;
    const source = current.source ? ` ${current.source}` : "";
    const path = `${current.name}@${current.version}${source}`;
    packages.set(path, { name: current.name, path, version: current.version });
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (/^\[\[.*\]\]$/.test(trimmed)) {
      flush();
      current = trimmed === "[[package]]" ? {} : undefined;
      continue;
    }
    if (!current) continue;
    const scalar = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(trimmed);
    if (!scalar?.[1] || !scalar[2]) continue;
    const value = unquoteTomlScalar(scalar[2]);
    if (scalar[1] === "name") current.name = value;
    if (scalar[1] === "version") current.version = value;
    if (scalar[1] === "source") current.source = normalizeInlineToml(value);
  }

  flush();
  return packages.size > 0 ? packages : undefined;
}

function parsePipfileLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { default?: unknown; develop?: unknown };
    const packages = new Map<string, LockPackage>();
    readPipfileSection(packages, "default", parsed.default);
    readPipfileSection(packages, "develop", parsed.develop);
    return packages.size > 0 ? packages : undefined;
  } catch {
    return undefined;
  }
}

function parseGemfileLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  const packages = new Map<string, LockPackage>();
  let inSpecs = false;
  for (const rawLine of value.split(/\r?\n/)) {
    if (/^[A-Z][A-Z ]+$/.test(rawLine.trim())) {
      inSpecs = rawLine.trim() === "GEM";
      continue;
    }
    if (!inSpecs) continue;
    if (rawLine.trim() === "specs:") continue;
    const match = /^ {4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/.exec(rawLine);
    if (!match?.[1] || !match[2]) continue;
    const version = match[2].split(",")[0]?.trim();
    if (!version) continue;
    const path = `${match[1]}@${version}`;
    packages.set(path, { name: match[1], path, version });
  }
  return packages.size > 0 ? packages : undefined;
}

function parseComposerLock(value: string | undefined): Map<string, LockPackage> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { packages?: unknown; "packages-dev"?: unknown };
    const packages = new Map<string, LockPackage>();
    readComposerSection(packages, "packages", parsed.packages);
    readComposerSection(packages, "packages-dev", parsed["packages-dev"]);
    return packages.size > 0 ? packages : undefined;
  } catch {
    return undefined;
  }
}

function isRequirementsFile(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? path;
  return /^requirements([-.].*)?\.txt$/i.test(fileName) || /^.*[-.]requirements\.txt$/i.test(fileName);
}

function isDotnetDependencyManifest(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? path;
  return /\.(csproj|fsproj|vbproj)$/i.test(fileName) || fileName === "Directory.Packages.props";
}

function readXmlAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes);
  return match?.[1]?.trim() || undefined;
}

function readXmlElement(content: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`, "i").exec(content);
  return match?.[1]?.trim() || undefined;
}

function cleanRequirementLine(rawLine: string): string | undefined {
  const line = rawLine.trim();
  if (!line || line.startsWith("#") || line.startsWith("--hash")) return undefined;
  const cleaned = line
    .replace(/\s+#.*$/, "")
    .replace(/\s+\\$/, "")
    .replace(/\s+--hash=\S+.*$/, "")
    .trim();
  if (!cleaned || cleaned.startsWith("-r ") || cleaned.startsWith("--")) return undefined;
  return cleaned;
}

function parseRequirementLine(line: string): RequirementPackage | undefined {
  const editable = /^-e\s+(.+)$/.exec(line);
  if (editable?.[1]) {
    const egg = /[#&]egg=([^&\s]+)/.exec(editable[1]);
    if (!egg?.[1]) return undefined;
    return buildRequirementPackage(decodeURIComponent(egg[1]), `@ ${editable[1]}`);
  }

  const direct = /^([A-Za-z0-9_.-]+(?:\[[^\]]+\])?)\s*@\s*(.+)$/.exec(line);
  if (direct?.[1] && direct[2]) {
    return buildRequirementPackage(direct[1], `@ ${direct[2].trim()}`);
  }

  const constrained = /^([A-Za-z0-9_.-]+(?:\[[^\]]+\])?)\s*(===|==|~=|!=|<=|>=|<|>)\s*(.+)$/.exec(line);
  if (constrained?.[1] && constrained[2] && constrained[3]) {
    return buildRequirementPackage(constrained[1], `${constrained[2]}${constrained[3].trim()}`);
  }

  const bare = /^([A-Za-z0-9_.-]+(?:\[[^\]]+\])?)$/.exec(line);
  if (bare?.[1]) return buildRequirementPackage(bare[1], "*");

  return undefined;
}

function buildRequirementPackage(displayName: string, spec: string): RequirementPackage | undefined {
  const name = normalizePythonPackageName(displayName);
  if (!name) return undefined;
  return {
    name,
    displayName,
    key: requirementKey(name, spec),
    spec
  };
}

function normalizePythonPackageName(value: string): string {
  return value.replace(/\[.*$/, "").toLowerCase().replace(/[-_.]+/g, "-");
}

function requirementKey(name: string, spec: string): string {
  const marker = spec.split(";", 2)[1]?.trim();
  return marker ? `${name};${marker}` : name;
}

function requirementPackagePath(item: RequirementPackage | undefined): string | undefined {
  if (!item) return undefined;
  const marker = item.key.split(";", 2)[1];
  if (marker) return `${item.displayName}; ${marker}`;
  return normalizePythonPackageName(item.displayName) === item.displayName ? undefined : item.displayName;
}

function addPyprojectDependency(
  packages: Map<string, ManifestDependency>,
  packagePath: string,
  dependencyType: DependencyChange["dependencyType"],
  spec: string
): void {
  const parsed = parseRequirementLine(spec.trim());
  if (!parsed) return;
  packages.set(`${dependencyType}:${packagePath}:${parsed.key}`, {
    name: parsed.name,
    key: `${dependencyType}:${packagePath}:${parsed.key}`,
    spec: parsed.spec,
    packagePath,
    dependencyType
  });
}

function addPoetryDependency(
  packages: Map<string, ManifestDependency>,
  packagePath: string,
  dependencyType: DependencyChange["dependencyType"],
  rawName: string,
  rawValue: string
): void {
  const displayName = unquoteTomlScalar(rawName);
  const name = normalizePythonPackageName(displayName);
  if (!name || name === "python") return;
  const spec = readPoetryDependencySpec(rawValue);
  if (!spec) return;
  const effectiveDependencyType = dependencyType === "dependencies" && /\boptional\s*=\s*true\b/i.test(rawValue) ? "optionalDependencies" : dependencyType;
  packages.set(`${effectiveDependencyType}:${packagePath}:${name}`, {
    name,
    key: `${effectiveDependencyType}:${packagePath}:${name}`,
    spec,
    packagePath,
    dependencyType: effectiveDependencyType
  });
}

function poetryDependencySectionType(section: string): DependencyChange["dependencyType"] | undefined {
  if (section === "tool.poetry.dependencies") return "dependencies";
  if (section === "tool.poetry.dev-dependencies") return "devDependencies";
  if (/^tool\.poetry\.group\.[A-Za-z0-9_.-]+\.dependencies$/.test(section)) return "devDependencies";
  return undefined;
}

function readPoetryDependencySpec(value: string): string | undefined {
  const trimmed = stripTomlComment(value).trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    const version = /\bversion\s*=\s*("[^"]*"|'[^']*'|[^,}]+)/.exec(trimmed)?.[1];
    return version ? unquoteTomlScalar(version.trim()) : normalizeInlineToml(trimmed);
  }
  return unquoteTomlScalar(trimmed);
}

function readTomlStringArray(lines: string[], startIndex: number): { items: string[]; endIndex: number } {
  let buffer = stripTomlComment(lines[startIndex] ?? "");
  let endIndex = startIndex;
  while (!buffer.includes("]") && endIndex + 1 < lines.length) {
    endIndex += 1;
    buffer += `\n${stripTomlComment(lines[endIndex] ?? "")}`;
  }
  return { items: readQuotedStrings(buffer), endIndex };
}

function readQuotedStrings(value: string): string[] {
  const items: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'([^']*)'/g;
  for (const match of value.matchAll(pattern)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    items.push(raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return items;
}

function readTomlKeyValue(line: string): { key: string; value: string } | undefined {
  const match = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
  if (!match?.[1] || !match[2]) return undefined;
  return { key: match[1], value: match[2] };
}

function stripTomlComment(value: string): string {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === "#" && !quote) return value.slice(0, index);
  }
  return value;
}

function readPipfileSection(result: Map<string, LockPackage>, section: "default" | "develop", value: unknown): void {
  if (!isRecord(value)) return;
  for (const [rawName, entry] of Object.entries(value)) {
    const version = readPipfileVersion(entry);
    if (!version) continue;
    const name = normalizePythonPackageName(rawName);
    if (!name) continue;
    const path = `${section}.${name}`;
    result.set(path, { name, path, version });
  }
}

function readPipfileVersion(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.version === "string") return value.version;
  return undefined;
}

function readComposerSection(result: Map<string, LockPackage>, section: "packages" | "packages-dev", value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.version !== "string") continue;
    const path = `${section}.${item.name}`;
    result.set(path, { name: item.name, path, version: item.version });
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

function unquoteTomlScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeInlineToml(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readBunPackageVersion(value: unknown): string | undefined {
  const resolution = Array.isArray(value) && typeof value[0] === "string" ? value[0] : typeof value === "string" ? value : undefined;
  if (!resolution) return undefined;
  const npmVersion = /@npm:([^,\s]+)/.exec(resolution);
  if (npmVersion?.[1]) return npmVersion[1];
  const separator = resolution.startsWith("@") ? resolution.indexOf("@", resolution.indexOf("/") + 1) : resolution.lastIndexOf("@");
  if (separator <= 0) return resolution;
  return resolution.slice(separator + 1) || resolution;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
