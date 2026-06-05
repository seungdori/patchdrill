# JSON Schemas

PatchDrill ships JSON Schema draft 2020-12 contracts for policy files, machine-readable reports, audit evidence manifests, and readiness automation output.

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
patchdrill schema evidence > patchdrill-evidence.schema.json
patchdrill schema doctor > patchdrill-doctor.schema.json
patchdrill schema release-check > patchdrill-release-check.schema.json
```

Write a schema to a file:

```bash
patchdrill schema report --output schemas/patchdrill-report.schema.json
```

List available schemas:

```bash
patchdrill schema --list
```

The local MCP server exposes the same contracts as resources such as `patchdrill://schema/report` and `patchdrill://schema/evidence`, so MCP clients can validate structured tool output before handing it to a model. See [MCP.md](MCP.md).

## Policy Schema

Use `schemas/patchdrill-policy.schema.json` to validate `.patchdrill.yml`, `.patchdrill.yaml`, or `.patchdrill.json`. The schema covers ignored paths, risk gates, policy commands, and path-matched rules.

For editor completion in YAML, add a language-server schema comment:

```yaml
# yaml-language-server: $schema=./schemas/patchdrill-policy.schema.json
```

## Report Schema

Use `schemas/patchdrill-report.schema.json` for bots and dashboards that consume `patchdrill scan --json`. The report includes `schemaVersion: "1"` and the schema covers summary scores, changed files, project signals, workspace package impact, dependency changes, package script changes, findings, verification plans, command results, and the required computed `verification` section that joins plans with results. Human-facing reports render the same verification matrix from the same fields. `patchdrill verify --evidence` also checks report consistency that JSON Schema cannot express, such as changed-file totals, failed-command counts, missing verification status, and verification status drift.

## Evidence Schema

Use `schemas/patchdrill-evidence.schema.json` for audit storage that consumes `patchdrill scan --evidence`. The manifest records the PatchDrill tool version, report digest, generated artifact digests, command-output digests, command result metadata, and local git refs without embedding raw stdout or stderr. `scan --evidence` requires `--json`, and `patchdrill verify` cross-checks those command digests and the JSON report's internal summary counts against the JSON report artifact.

## Doctor Schema

Use `schemas/patchdrill-doctor.schema.json` for onboarding bots and repository bootstrap checks that consume `patchdrill doctor --format json`. The report includes `schemaVersion: "1"`, readiness summary counts, detected project signals, diagnostic checks, and suggested next commands without mutating the repository.

## Release-Check Schema

Use `schemas/patchdrill-release-check.schema.json` for release automation that consumes `patchdrill release-check --format json`. The report includes `schemaVersion: "1"`, a top-level `ok` flag, summary counts, and local release-readiness checks for package metadata, action wiring, provenance workflow settings, launch docs, pull request and README Proof Pack commands, parseable shipped schema contracts, synchronized stack-coverage docs, stack fixture contracts, committed demo artifacts, and Markdown links.
