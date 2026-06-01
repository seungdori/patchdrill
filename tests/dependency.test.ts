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

  it("reports .NET PackageReference additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-dotnet-deps-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeFileSync(
      join(root, "Api.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />',
        '    <PackageReference Include="xunit">',
        "      <Version>2.5.0</Version>",
        "    </PackageReference>",
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(
      join(root, "Api.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="FluentAssertions" Version="6.12.0" />',
        '    <PackageReference Include="xunit">',
        "      <Version>2.6.0</Version>",
        "    </PackageReference>",
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Api.csproj", status: "modified", additions: 3, deletions: 3, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Api.csproj",
        packageName: "FluentAssertions",
        packagePath: "PackageReference",
        dependencyType: "dependencies",
        changeType: "added",
        after: "6.12.0"
      },
      {
        file: "Api.csproj",
        packageName: "Newtonsoft.Json",
        packagePath: "PackageReference",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "13.0.1"
      },
      {
        file: "Api.csproj",
        packageName: "xunit",
        packagePath: "PackageReference",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "2.5.0",
        after: "2.6.0"
      }
    ]);
  });

  it("reports .NET central PackageVersion additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-dotnet-central-deps-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeFileSync(
      join(root, "Directory.Packages.props"),
      [
        "<Project>",
        "  <ItemGroup>",
        '    <PackageVersion Include="Microsoft.Extensions.Hosting" Version="8.0.0" />',
        '    <PackageVersion Include="Serilog" Version="3.1.1" />',
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(
      join(root, "Directory.Packages.props"),
      [
        "<Project>",
        "  <ItemGroup>",
        '    <PackageVersion Include="Microsoft.Extensions.Hosting" Version="8.0.1" />',
        '    <PackageVersion Include="Npgsql" Version="8.0.3" />',
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Directory.Packages.props", status: "modified", additions: 2, deletions: 2, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Directory.Packages.props",
        packageName: "Microsoft.Extensions.Hosting",
        packagePath: "PackageVersion",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "8.0.0",
        after: "8.0.1"
      },
      {
        file: "Directory.Packages.props",
        packageName: "Npgsql",
        packagePath: "PackageVersion",
        dependencyType: "dependencies",
        changeType: "added",
        after: "8.0.3"
      },
      {
        file: "Directory.Packages.props",
        packageName: "Serilog",
        packagePath: "PackageVersion",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "3.1.1"
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

  it("reports bun.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-bun-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeBunLock(
      root,
      `
{
  "lockfileVersion": 0,
  "packages": {
    "@scope/pkg": ["@scope/pkg@npm:1.0.0", {}, "scope-old"],
    "react": ["react@npm:18.2.0", {}, "react-old"],
    "zod": ["zod@npm:3.0.0", {}, "zod-old"],
  },
}
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeBunLock(
      root,
      `
{
  "lockfileVersion": 0,
  "packages": {
    "@scope/pkg": ["@scope/pkg@npm:1.1.0", {}, "scope-new"],
    "react": ["react@npm:19.0.0", {}, "react-new"],
    "yaml": ["yaml@npm:2.0.0", {}, "yaml-new"],
  },
}
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "bun.lock", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "bun.lock",
        packageName: "@scope/pkg",
        packagePath: "@scope/pkg",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.0.0",
        after: "1.1.0"
      },
      {
        file: "bun.lock",
        packageName: "react",
        packagePath: "react",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "bun.lock",
        packageName: "yaml",
        packagePath: "yaml",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "bun.lock",
        packageName: "zod",
        packagePath: "zod",
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

  it("reports Gemfile.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-gemfile-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeGemfileLock(
      root,
      `
GEM
  remote: https://rubygems.org/
  specs:
    oldgem (0.1.0)
    puma (6.4.2)
    rails (7.1.3)
      actionpack (= 7.1.3)

PLATFORMS
  ruby
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeGemfileLock(
      root,
      `
GEM
  remote: https://rubygems.org/
  specs:
    puma (6.4.2)
    rack (3.0.9)
    rails (7.2.0)
      actionpack (= 7.2.0)

PLATFORMS
  ruby
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Gemfile.lock", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Gemfile.lock",
        packageName: "oldgem",
        packagePath: "oldgem@0.1.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "0.1.0"
      },
      {
        file: "Gemfile.lock",
        packageName: "rack",
        packagePath: "rack@3.0.9",
        dependencyType: "lockfile",
        changeType: "added",
        after: "3.0.9"
      },
      {
        file: "Gemfile.lock",
        packageName: "rails",
        packagePath: "rails@7.1.3 -> rails@7.2.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "7.1.3",
        after: "7.2.0"
      }
    ]);
  });

  it("reports composer.lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-composer-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writeComposerLock(root, {
      packages: [
        { name: "monolog/monolog", version: "3.5.0" },
        { name: "old/vendor", version: "1.0.0" }
      ],
      "packages-dev": [{ name: "phpunit/phpunit", version: "10.5.0" }]
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeComposerLock(root, {
      packages: [
        { name: "monolog/monolog", version: "3.6.0" },
        { name: "symfony/console", version: "7.0.0" }
      ],
      "packages-dev": [{ name: "phpunit/phpunit", version: "10.5.0" }]
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "composer.lock", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "composer.lock",
        packageName: "monolog/monolog",
        packagePath: "packages.monolog/monolog",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "3.5.0",
        after: "3.6.0"
      },
      {
        file: "composer.lock",
        packageName: "old/vendor",
        packagePath: "packages.old/vendor",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "1.0.0"
      },
      {
        file: "composer.lock",
        packageName: "symfony/console",
        packagePath: "packages.symfony/console",
        dependencyType: "lockfile",
        changeType: "added",
        after: "7.0.0"
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

function writeBunLock(root: string, contents: string): void {
  writeFileSync(join(root, "bun.lock"), contents.trimStart());
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

function writeGemfileLock(root: string, contents: string): void {
  writeFileSync(join(root, "Gemfile.lock"), contents.trimStart());
}

function writeComposerLock(root: string, contents: unknown): void {
  writeFileSync(join(root, "composer.lock"), JSON.stringify(contents, null, 2));
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
