# JSON Schemas

PatchDrill ships JSON Schema draft 2020-12 contracts for policy files, machine-readable reports, and audit evidence manifests.

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
patchdrill schema evidence > patchdrill-evidence.schema.json
```

Write a schema to a file:

```bash
patchdrill schema report --output schemas/patchdrill-report.schema.json
```

List available schemas:

```bash
patchdrill schema --list
```

## Policy Schema

Use `schemas/patchdrill-policy.schema.json` to validate `.patchdrill.yml`, `.patchdrill.yaml`, or `.patchdrill.json`. The schema covers ignored paths, risk gates, policy commands, and path-matched rules.

For editor completion in YAML, add a language-server schema comment:

```yaml
# yaml-language-server: $schema=./schemas/patchdrill-policy.schema.json
```

## Report Schema

Use `schemas/patchdrill-report.schema.json` for bots and dashboards that consume `patchdrill scan --json`. The report includes `schemaVersion: "1"` and the schema covers summary scores, changed files, project signals, workspace package impact, dependency changes, package script changes, findings, verification plans, and command results. `patchdrill verify --evidence` also checks report summary consistency that JSON Schema cannot express, such as changed-file totals and failed-command counts.

## Evidence Schema

Use `schemas/patchdrill-evidence.schema.json` for audit storage that consumes `patchdrill scan --evidence`. The manifest records the PatchDrill tool version, report digest, generated artifact digests, command-output digests, command result metadata, and local git refs without embedding raw stdout or stderr. `patchdrill verify` cross-checks those command digests and the JSON report's internal summary counts against the JSON report artifact when it is present.
