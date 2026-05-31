# Monorepo Targeting

PatchDrill detects Node workspaces and reports the affected packages for a diff.

Supported workspace metadata:

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

## Why This Matters

Large repositories need targeted evidence. Running only root commands can hide which package proved the change, while running every package wastes CI time. PatchDrill keeps the plan explicit: affected package, command, and reason appear in Markdown and JSON reports.

## Current Scope

PatchDrill builds its graph from package manifests only. Native task-graph integrations for Turborepo, Nx, Cargo workspaces, Go modules, and Pants remain roadmap items.
