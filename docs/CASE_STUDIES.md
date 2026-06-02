# Case Studies

These case studies are designed for launch readers who ask, "What does PatchDrill catch that a normal CI green check or model review might not make obvious?"

They are representative and deterministic. Each one maps a patch shape to the Proof Pack evidence PatchDrill emits: risk findings, command plan, report artifacts, and evidence verification.

## Risky Agent PR

Artifact path: [examples/risky-agent-pr](../examples/risky-agent-pr)

Patch shape:

- Privileged `pull_request_target` workflow behavior.
- PR-head checkout inside a privileged workflow.
- Secret-looking environment example.
- package.json lifecycle script addition.
- Required verification commands that should be reviewed before merge.

PatchDrill output:

- Critical workflow trust-boundary finding.
- Secret-looking value finding.
- Package lifecycle script finding.
- SARIF output for GitHub code scanning.
- Compact PR summary for reviewers.
- HTML dashboard for a self-contained Proof Pack.

Why it matters:

Traditional CI can pass while the workflow permission boundary becomes unsafe. PatchDrill makes that boundary visible before a reviewer has to manually audit every workflow line.

## Review-Ready Proof Pack

Artifact path: [examples/demo](../examples/demo)

Patch shape:

- Product source changes.
- Workspace-scoped package impact.
- Required and optional command plan.
- No command failures.

PatchDrill output:

- Markdown report for human review.
- JSON report for bots.
- SARIF report for code scanning.
- HTML dashboard.
- Compact PR summary.

Why it matters:

This is the "normal" case: PatchDrill does not need to invent drama. It gives reviewers a stable bundle that says what changed, what should be tested, and what residual risk remains.

## Dependency Proof Gap

Patch shape:

- Manifest dependency changed without a matching lockfile change.
- Or lockfile resolution changed without a matching manifest intent.

PatchDrill output:

- Dependency diff table with package, section, before, and after.
- Proof-gap finding that explains whether intent or resolution evidence is missing.
- Command plan still derived from the touched ecosystem.

Why it matters:

SCA tools answer vulnerability questions. PatchDrill answers a reviewer question: "Does this dependency change include enough intent and resolution evidence to trust the patch?"

## Package Script Tampering

Patch shape:

- A test/lint/build script is removed, replaced with a no-op, or weakened.
- An install/prepare/pack/publish lifecycle hook is added.
- A script pipes a remote download into a shell or interpreter.

PatchDrill output:

- Structured package script change summary.
- Risk findings for lifecycle hooks, removed verification scripts, no-op checks, and remote shell pipes.
- Human-readable remediation in Markdown and SARIF.

Why it matters:

AI-authored patches can make a PR look green by weakening the command that CI already trusts. PatchDrill treats the command definition itself as review evidence.

## Workflow OIDC Boundary

Patch shape:

- GitHub Actions job grants OIDC permissions.
- Remote reusable workflow receives inherited secrets or caller permissions.
- Environment protection is absent or unclear.

PatchDrill output:

- Trust-boundary findings for OIDC, secrets inheritance, mutable reusable workflow refs, and privileged trigger combinations.
- Local reusable workflow expansion for downstream analysis.
- SARIF and annotation output for review surfaces.

Why it matters:

OIDC and reusable workflow changes are easy to miss in code review because the risky behavior can be spread across several workflow files. PatchDrill loads local reusable workflow references and reports the combined boundary.
