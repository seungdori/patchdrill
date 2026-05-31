import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDependencyChanges } from "../src/dependency.js";

const tempDirs: string[] = [];

describe("analyzeDependencyChanges", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports package.json dependency additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-deps-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePackage(root, {
      dependencies: {
        react: "^18.2.0",
        zod: "^3.0.0"
      },
      devDependencies: {
        vitest: "^2.0.0"
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackage(root, {
      dependencies: {
        react: "^19.0.0",
        yaml: "^2.0.0"
      },
      devDependencies: {
        vitest: "^2.0.0"
      }
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "package.json", status: "modified", additions: 4, deletions: 3, binary: false }]
    );

    expect(changes).toEqual([
      { file: "package.json", packageName: "react", dependencyType: "dependencies", changeType: "updated", before: "^18.2.0", after: "^19.0.0" },
      { file: "package.json", packageName: "yaml", dependencyType: "dependencies", changeType: "added", after: "^2.0.0" },
      { file: "package.json", packageName: "zod", dependencyType: "dependencies", changeType: "removed", before: "^3.0.0" }
    ]);
  });

  it("reports requirements.txt dependency additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-requirements-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeRequirements(
      root,
      `
# Base application dependencies
FastAPI>=0.100,<1
old-package==0.1.0
requests==2.31.0
uvicorn[standard]==0.29.0 ; python_version >= "3.10"
-r constraints.txt
--index-url https://example.invalid/simple
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeRequirements(
      root,
      `
fastapi>=0.100,<1
requests==2.32.0
rich==13.7.0
uvicorn[standard]==0.29.0 ; python_version >= "3.10"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "requirements.txt", status: "modified", additions: 4, deletions: 7, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "requirements.txt",
        packageName: "old-package",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "==0.1.0"
      },
      {
        file: "requirements.txt",
        packageName: "requests",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "==2.31.0",
        after: "==2.32.0"
      },
      {
        file: "requirements.txt",
        packageName: "rich",
        dependencyType: "dependencies",
        changeType: "added",
        after: "==13.7.0"
      }
    ]);
  });

  it("reports npm package-lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePackageLock(root, {
      lockfileVersion: 3,
      packages: {
        "": {
          dependencies: {
            react: "^18.2.0",
            zod: "^3.0.0"
          }
        },
        "node_modules/react": { version: "18.2.0" },
        "node_modules/zod": { version: "3.0.0" }
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackageLock(root, {
      lockfileVersion: 3,
      packages: {
        "": {
          dependencies: {
            react: "^19.0.0",
            yaml: "^2.0.0"
          }
        },
        "node_modules/react": { version: "19.0.0" },
        "node_modules/yaml": { version: "2.0.0" }
      }
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "package-lock.json", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "package-lock.json",
        packageName: "react",
        packagePath: "node_modules/react",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "package-lock.json",
        packageName: "yaml",
        packagePath: "node_modules/yaml",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "package-lock.json",
        packageName: "zod",
        packagePath: "node_modules/zod",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "3.0.0"
      }
    ]);
  });

  it("reports pnpm lockfile additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-pnpm-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePnpmLock(
      root,
      `
lockfileVersion: '9.0'
packages:
  '@scope/pkg@1.0.0':
    resolution: {integrity: sha512-scope-old}
  react@18.2.0:
    resolution: {integrity: sha512-react-old}
  /zod@3.0.0:
    resolution: {integrity: sha512-zod-old}
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePnpmLock(
      root,
      `
lockfileVersion: '9.0'
packages:
  '@scope/pkg@1.1.0':
    resolution: {integrity: sha512-scope-new}
  react@19.0.0:
    resolution: {integrity: sha512-react-new}
  yaml@2.0.0:
    resolution: {integrity: sha512-yaml-new}
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "pnpm-lock.yaml", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "pnpm-lock.yaml",
        packageName: "@scope/pkg",
        packagePath: "@scope/pkg@1.0.0 -> @scope/pkg@1.1.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.0.0",
        after: "1.1.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "react",
        packagePath: "react@18.2.0 -> react@19.0.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "yaml",
        packagePath: "yaml@2.0.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "zod",
        packagePath: "/zod@3.0.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "3.0.0"
      }
    ]);
  });

  it("reports yarn lockfile additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-yarn-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeYarnLock(
      root,
      `
"@scope/pkg@npm:^1.0.0":
  version "1.0.0"
react@^18.2.0:
  version "18.2.0"
zod@^3.0.0:
  version "3.0.0"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeYarnLock(
      root,
      `
"@scope/pkg@npm:^1.1.0":
  version: 1.1.0
react@^19.0.0:
  version "19.0.0"
yaml@^2.0.0:
  version "2.0.0"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "yarn.lock", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "yarn.lock",
        packageName: "@scope/pkg",
        packagePath: "@scope/pkg@npm:^1.0.0 -> @scope/pkg@npm:^1.1.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.0.0",
        after: "1.1.0"
      },
      {
        file: "yarn.lock",
        packageName: "react",
        packagePath: "react@^18.2.0 -> react@^19.0.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "yarn.lock",
        packageName: "yaml",
        packagePath: "yaml@^2.0.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "yarn.lock",
        packageName: "zod",
        packagePath: "zod@^3.0.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "3.0.0"
      }
    ]);
  });

  it("reports go.sum additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-go-sum-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeGoSum(
      root,
      `
github.com/acme/old v0.1.0 h1:old
github.com/acme/old v0.1.0/go.mod h1:oldmod
github.com/gin-gonic/gin v1.9.0 h1:ginold
github.com/gin-gonic/gin v1.9.0/go.mod h1:ginoldmod
golang.org/x/crypto v0.20.0 h1:cryptoold
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeGoSum(
      root,
      `
github.com/gin-gonic/gin v1.10.0 h1:ginnew
github.com/gin-gonic/gin v1.10.0/go.mod h1:ginnewmod
golang.org/x/crypto v0.20.0 h1:cryptoold
golang.org/x/sync v0.7.0 h1:syncnew
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "go.sum", status: "modified", additions: 4, deletions: 5, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "go.sum",
        packageName: "github.com/acme/old",
        packagePath: "github.com/acme/old@v0.1.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "v0.1.0"
      },
      {
        file: "go.sum",
        packageName: "github.com/gin-gonic/gin",
        packagePath: "github.com/gin-gonic/gin@v1.9.0 -> github.com/gin-gonic/gin@v1.10.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "v1.9.0",
        after: "v1.10.0"
      },
      {
        file: "go.sum",
        packageName: "golang.org/x/sync",
        packagePath: "golang.org/x/sync@v0.7.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "v0.7.0"
      }
    ]);
  });

  it("reports Cargo.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-cargo-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeCargoLock(
      root,
      `
# This file is automatically @generated by Cargo.
version = 3

[[package]]
name = "anyhow"
version = "1.0.80"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "old-anyhow"

[[package]]
name = "old-crate"
version = "0.1.0"

[[package]]
name = "serde"
version = "1.0.190"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "old-serde"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeCargoLock(
      root,
      `
# This file is automatically @generated by Cargo.
version = 3

[[package]]
name = "anyhow"
version = "1.0.81"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "new-anyhow"

[[package]]
name = "serde"
version = "1.0.190"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "old-serde"

[[package]]
name = "tokio"
version = "1.37.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "new-tokio"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Cargo.lock", status: "modified", additions: 12, deletions: 11, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Cargo.lock",
        packageName: "anyhow",
        packagePath: "anyhow@1.0.80 -> anyhow@1.0.81",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.0.80",
        after: "1.0.81"
      },
      {
        file: "Cargo.lock",
        packageName: "old-crate",
        packagePath: "old-crate@0.1.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "0.1.0"
      },
      {
        file: "Cargo.lock",
        packageName: "tokio",
        packagePath: "tokio@1.37.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "1.37.0"
      }
    ]);
  });

  it("reports poetry.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-poetry-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePoetryLock(
      root,
      `
# This file is automatically @generated by Poetry.

[[package]]
name = "black"
version = "24.1.0"
description = "The uncompromising code formatter."

[[package]]
name = "oldlib"
version = "0.1.0"

[[package]]
name = "pydantic"
version = "2.6.0"

[metadata]
lock-version = "2.0"
python-versions = ">=3.10"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePoetryLock(
      root,
      `
# This file is automatically @generated by Poetry.

[[package]]
name = "black"
version = "24.2.0"
description = "The uncompromising code formatter."

[[package]]
name = "pydantic"
version = "2.6.0"

[[package]]
name = "rich"
version = "13.7.0"

[metadata]
lock-version = "2.0"
python-versions = ">=3.10"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "poetry.lock", status: "modified", additions: 11, deletions: 11, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "poetry.lock",
        packageName: "black",
        packagePath: "black@24.1.0 -> black@24.2.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "24.1.0",
        after: "24.2.0"
      },
      {
        file: "poetry.lock",
        packageName: "oldlib",
        packagePath: "oldlib@0.1.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "0.1.0"
      },
      {
        file: "poetry.lock",
        packageName: "rich",
        packagePath: "rich@13.7.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "13.7.0"
      }
    ]);
  });

  it("reports Pipfile.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-pipfile-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePipfileLock(root, {
      _meta: {
        hash: {
          sha256: "old"
        }
      },
      default: {
        oldlib: {
          version: "==0.1.0"
        },
        requests: {
          version: "==2.31.0"
        }
      },
      develop: {
        pytest: {
          version: "==8.0.0"
        }
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePipfileLock(root, {
      _meta: {
        hash: {
          sha256: "new"
        }
      },
      default: {
        requests: {
          version: "==2.32.0"
        }
      },
      develop: {
        pytest: {
          version: "==8.0.0"
        },
        rich: {
          version: "==13.7.0"
        }
      }
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Pipfile.lock", status: "modified", additions: 12, deletions: 12, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Pipfile.lock",
        packageName: "oldlib",
        packagePath: "default.oldlib",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "==0.1.0"
      },
      {
        file: "Pipfile.lock",
        packageName: "requests",
        packagePath: "default.requests",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "==2.31.0",
        after: "==2.32.0"
      },
      {
        file: "Pipfile.lock",
        packageName: "rich",
        packagePath: "develop.rich",
        dependencyType: "lockfile",
        changeType: "added",
        after: "==13.7.0"
      }
    ]);
  });
});

function writePackage(root: string, contents: unknown): void {
  writeFileSync(join(root, "package.json"), JSON.stringify(contents, null, 2));
}

function writePackageLock(root: string, contents: unknown): void {
  writeFileSync(join(root, "package-lock.json"), JSON.stringify(contents, null, 2));
}

function writeRequirements(root: string, contents: string): void {
  writeFileSync(join(root, "requirements.txt"), contents.trimStart());
}

function writePnpmLock(root: string, contents: string): void {
  writeFileSync(join(root, "pnpm-lock.yaml"), contents.trimStart());
}

function writeYarnLock(root: string, contents: string): void {
  writeFileSync(join(root, "yarn.lock"), contents.trimStart());
}

function writeGoSum(root: string, contents: string): void {
  writeFileSync(join(root, "go.sum"), contents.trimStart());
}

function writeCargoLock(root: string, contents: string): void {
  writeFileSync(join(root, "Cargo.lock"), contents.trimStart());
}

function writePoetryLock(root: string, contents: string): void {
  writeFileSync(join(root, "poetry.lock"), contents.trimStart());
}

function writePipfileLock(root: string, contents: unknown): void {
  writeFileSync(join(root, "Pipfile.lock"), JSON.stringify(contents, null, 2));
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
