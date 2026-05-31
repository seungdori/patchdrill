# JSON Schemas

PatchDrill ships JSON Schema draft 2020-12 contracts for policy files and machine-readable reports.

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
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

Use `schemas/patchdrill-report.schema.json` for bots and dashboards that consume `patchdrill scan --json`. The report schema covers summary scores, changed files, project signals, workspace package impact, dependency changes, findings, verification plans, and command results.
