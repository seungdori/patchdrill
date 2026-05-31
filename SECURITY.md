# Security Policy

## Reporting a Vulnerability

Please open a private security advisory on GitHub or email the maintainers once a public contact is listed.

Include:

- PatchDrill version or commit.
- Operating system and Node version.
- A minimal repo or diff that reproduces the issue.
- Whether `--run` was used.

## Execution Model

PatchDrill has two modes:

- `scan`: reads git metadata and local files, then emits a plan and risk report.
- `scan --run`: executes inferred required verification commands in the repository shell.

Do not use `--run` on untrusted repositories until you have reviewed the verification plan.

## Data Handling

PatchDrill does not send source code or reports to a network service. Reports are written only to paths you request.
