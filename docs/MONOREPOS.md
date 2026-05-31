# Monorepo Targeting

PatchDrill detects Node, Cargo, and Go workspaces and reports the affected packages for a diff.

Supported Node workspace metadata:

- `package.json` with `workspaces: []`
- `package.json` with `workspaces.packages`
- `pnpm-workspace.yaml`

When a changed file sits under a workspace package, PatchDrill emits package-scoped verification commands for that package and downstream workspace packages that depend on it:

| Package manager | Example |
| --- | --- |
| npm | `npm --workspace @acme/api run test` |
| pnpm | `pnpm --filter @acme/api run test` |
| yarn | `yarn workspace @acme/api test` |
| bun | `bun --filter @acme/api run test` |

PatchDrill reads workspace `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`, keeps only dependencies that point to other workspace packages, and expands affected packages transitively. If `@acme/web` depends on `@acme/api` and `@acme/api` depends on `@acme/shared`, a change in `@acme/shared` marks all three packages as affected.

Root-wide files such as lockfiles, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and `nx.json` still mark all workspace packages as affected.

## Native Task Runners

PatchDrill detects `turbo.json`, `nx.json`, root `turbo`/`nx` dependencies, and root scripts that invoke `turbo` or `nx`. When a supported task runner is present, workspace plans use the native task graph:

| Runner | Example |
| --- | --- |
| Turborepo | `pnpm exec turbo run test --filter=@acme/api` |
| Nx | `npx nx run api:test` |

Turborepo plans still use package names from `package.json`. Nx plans use `project.json` names when present, otherwise the package name. If a package has no script but `project.json` declares a matching target, PatchDrill can still plan `test`, `build`, `lint`, or `typecheck` through Nx.

## Cargo Workspaces

PatchDrill reads `[workspace].members` from root `Cargo.toml`, expands member globs, reads each member crate name, and keeps workspace-internal crate dependencies. A change under `crates/core` marks that crate as affected and also marks downstream workspace crates that depend on it.

| Change | Example command |
| --- | --- |
| Direct crate change | `cargo test -p core-lib --all-targets` |
| Downstream dependent crate | `cargo test -p api-server --all-targets` |
| Optional lint plan | `cargo clippy -p core-lib --all-targets -- -D warnings` |

## Go Workspaces

PatchDrill reads `go.work` `use` entries, each module's `module` path, and workspace-internal `require` dependencies. A change under `modules/core` marks that module as affected and also marks downstream workspace modules that require it.

| Change | Example command |
| --- | --- |
| Direct module change | `go test ./modules/core/...` |
| Downstream dependent module | `go test ./modules/api/...` |
| Optional static check | `go vet ./modules/core/...` |

## Why This Matters

Large repositories need targeted evidence. Running only root commands can hide which package proved the change, while running every package wastes CI time. PatchDrill keeps the plan explicit: affected package, command, and reason appear in Markdown and JSON reports.

## Current Scope

PatchDrill builds workspace impact from package manifests, then hands Node task execution to Turborepo or Nx when those runners are detected. Native affected integration for Pants remains a roadmap item.
