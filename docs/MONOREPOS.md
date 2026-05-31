# Monorepo Targeting

PatchDrill detects Node workspaces and reports the affected packages for a diff.

Supported workspace metadata:

- `package.json` with `workspaces: []`
- `package.json` with `workspaces.packages`
- `pnpm-workspace.yaml`

When a changed file sits under a workspace package, PatchDrill emits package-scoped verification commands:

| Package manager | Example |
| --- | --- |
| npm | `npm --workspace @acme/api run test` |
| pnpm | `pnpm --filter @acme/api run test` |
| yarn | `yarn workspace @acme/api test` |
| bun | `bun --filter @acme/api run test` |

Root-wide files such as lockfiles, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and `nx.json` mark all workspace packages as affected.

## Why This Matters

Large repositories need targeted evidence. Running only root commands can hide which package proved the change, while running every package wastes CI time. PatchDrill keeps the plan explicit: affected package, command, and reason appear in Markdown and JSON reports.

## Current Scope

PatchDrill currently targets directly affected workspace packages. It does not yet build a dependency graph to include downstream dependents. That is a roadmap item for package managers and tools that expose reliable graph metadata.
