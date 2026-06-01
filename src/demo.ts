import type { PatchReport } from "./types.js";

export const demoScenarioNames = ["review-ready", "risky-agent-pr"] as const;

export type DemoScenario = (typeof demoScenarioNames)[number];

export function isDemoScenario(value: string): value is DemoScenario {
  return demoScenarioNames.includes(value as DemoScenario);
}

export function createDemoReport(scenario: DemoScenario = "review-ready"): PatchReport {
  return scenario === "risky-agent-pr" ? createRiskyAgentPrReport() : createReviewReadyReport();
}

function createReviewReadyReport(): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: "2026-06-01T00:00:00.000Z",
    root: "/demo/checkout",
    base: "origin/main",
    head: "feature/auth-session-hardening",
    summary: {
      status: "warn",
      riskScore: 58,
      confidenceScore: 82,
      changedFileCount: 5,
      additions: 186,
      deletions: 42,
      requiredCommandCount: 3,
      failedCommandCount: 0
    },
    changedFiles: [
      { path: "apps/api/src/auth/session.ts", status: "modified", additions: 54, deletions: 16, binary: false, owners: ["@acme/security"] },
      { path: "apps/api/src/auth/session.test.ts", status: "modified", additions: 48, deletions: 4, binary: false, owners: ["@acme/security"] },
      { path: "packages/db/migrations/20260601090000_add_session_rotation.sql", status: "added", additions: 38, deletions: 0, binary: false, owners: ["@acme/data"] },
      { path: ".github/workflows/deploy.yml", status: "modified", additions: 22, deletions: 12, binary: false, owners: ["@acme/platform"] },
      { path: "package-lock.json", status: "modified", additions: 24, deletions: 10, binary: false }
    ],
    addedLines: 186,
    projectSignals: [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        taskRunner: "turbo",
        scripts: {
          typecheck: "turbo run typecheck",
          test: "turbo run test",
          build: "turbo run build",
          "test:e2e": "playwright test"
        },
        workspacePackages: [
          {
            name: "@acme/api",
            projectName: "api",
            path: "apps/api",
            scripts: {
              typecheck: "tsc --noEmit",
              test: "vitest run",
              build: "tsup"
            },
            targets: ["typecheck", "test", "build"],
            dependencies: ["@acme/db"]
          },
          {
            name: "@acme/db",
            projectName: "db",
            path: "packages/db",
            scripts: {
              test: "vitest run"
            },
            targets: ["test"]
          }
        ]
      },
      {
        ecosystem: "github-actions",
        manifestPath: ".github/workflows/deploy.yml"
      }
    ],
    affectedPackages: [
      {
        name: "@acme/api",
        projectName: "api",
        path: "apps/api",
        scripts: {
          typecheck: "tsc --noEmit",
          test: "vitest run",
          build: "tsup"
        },
        targets: ["typecheck", "test", "build"],
        dependencies: ["@acme/db"]
      }
    ],
    dependencyChanges: [
      {
        file: "package-lock.json",
        packageName: "@acme/session-store",
        packagePath: "node_modules/@acme/session-store",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.8.2",
        after: "1.9.0"
      }
    ],
    packageScriptChanges: [],
    policy: {
      path: ".patchdrill.yml",
      ignoredPaths: ["dist/**", "coverage/**"],
      failOn: "high",
      maxRisk: 69,
      ruleCount: 2,
      requiredCommandCount: 1,
      optionalCommandCount: 1
    },
    codeOwners: {
      path: ".github/CODEOWNERS",
      ruleCount: 3
    },
    baseline: {
      path: "previous-patchdrill-report.json",
      previousStatus: "warn",
      currentStatus: "warn",
      previousRiskScore: 44,
      currentRiskScore: 58,
      riskDelta: 14,
      newFindingCount: 2,
      resolvedFindingCount: 1,
      unchangedFindingCount: 3
    },
    findings: [
      {
        ruleId: "file.high-impact-area",
        severity: "high",
        title: "High-impact product area changed",
        detail: "Authentication/session code changed and needs strong proof before merge.",
        file: "apps/api/src/auth/session.ts",
        remediation: "Require owner review and targeted session regression evidence.",
        tags: ["security", "auth"]
      },
      {
        ruleId: "file.migration-review",
        severity: "high",
        title: "Data migration review required",
        detail: "A database migration can alter production session state.",
        file: "packages/db/migrations/20260601090000_add_session_rotation.sql",
        remediation: "Attach dry-run, rollback, and data-owner approval notes.",
        tags: ["data", "migration"]
      },
      {
        ruleId: "workflow.oidc-environment",
        severity: "medium",
        title: "OIDC deployment job should use a protected environment",
        detail: "A deployment workflow can mint cloud credentials without an explicit GitHub environment gate.",
        file: ".github/workflows/deploy.yml",
        line: 34,
        remediation: "Attach a protected environment or document why this job cannot deploy.",
        tags: ["ci", "oidc", "supply-chain"]
      },
      {
        ruleId: "dependency.lockfile-update",
        severity: "low",
        title: "Dependency lockfile changed",
        detail: "@acme/session-store changed from 1.8.2 to 1.9.0.",
        file: "package-lock.json",
        remediation: "Review release notes and verify transitive dependency impact.",
        tags: ["dependencies"]
      }
    ],
    commandPlan: [
      {
        id: "node-turbo-api-typecheck",
        label: "Typecheck affected API package",
        command: "pnpm exec turbo run typecheck --filter=@acme/api",
        reason: "Auth source changed in @acme/api.",
        ecosystem: "node",
        required: true,
        packageName: "@acme/api",
        packagePath: "apps/api"
      },
      {
        id: "node-turbo-api-test",
        label: "Test affected API package",
        command: "pnpm exec turbo run test --filter=@acme/api",
        reason: "Session behavior changed and matching tests exist.",
        ecosystem: "node",
        required: true,
        packageName: "@acme/api",
        packagePath: "apps/api"
      },
      {
        id: "policy-contract-tests",
        label: "Contract tests",
        command: "pnpm run test:contracts",
        reason: "Repository policy requires contract tests for auth/session changes.",
        ecosystem: "general",
        required: true
      },
      {
        id: "node-e2e",
        label: "Browser e2e",
        command: "pnpm run test:e2e",
        reason: "Optional browser coverage is available for session rotation flows.",
        ecosystem: "node",
        required: false
      }
    ],
    commandResults: [
      {
        id: "node-turbo-api-typecheck",
        command: "pnpm exec turbo run typecheck --filter=@acme/api",
        exitCode: 0,
        durationMs: 8421,
        stdout: "@acme/api:typecheck: cache miss, executing\n@acme/api:typecheck: ok\n",
        stderr: ""
      },
      {
        id: "node-turbo-api-test",
        command: "pnpm exec turbo run test --filter=@acme/api",
        exitCode: 0,
        durationMs: 12544,
        stdout: "@acme/api:test: 42 tests passed\n",
        stderr: ""
      },
      {
        id: "policy-contract-tests",
        command: "pnpm run test:contracts",
        exitCode: 0,
        durationMs: 15038,
        stdout: "contract auth-session passed\ncontract deployment-claims passed\n",
        stderr: ""
      }
    ]
  };
}

function createRiskyAgentPrReport(): PatchReport {
  return {
    schemaVersion: "1",
    generatedAt: "2026-06-01T00:00:00.000Z",
    root: "/demo/checkout",
    base: "origin/main",
    head: "agent/refactor-release-flow",
    summary: {
      status: "fail",
      riskScore: 94,
      confidenceScore: 21,
      changedFileCount: 8,
      additions: 326,
      deletions: 78,
      requiredCommandCount: 4,
      failedCommandCount: 1
    },
    changedFiles: [
      { path: "AGENTS.md", status: "modified", additions: 28, deletions: 4, binary: false, owners: ["@acme/platform"] },
      { path: ".github/workflows/release.yml", status: "modified", additions: 44, deletions: 18, binary: false, owners: ["@acme/platform"] },
      { path: "apps/web/src/billing/checkout.ts", status: "modified", additions: 83, deletions: 21, binary: false, owners: ["@acme/billing"] },
      { path: "apps/web/src/billing/webhook.ts", status: "modified", additions: 39, deletions: 15, binary: false, owners: ["@acme/billing"] },
      { path: "scripts/deploy.sh", status: "modified", additions: 27, deletions: 8, binary: false, owners: ["@acme/platform"] },
      { path: ".env.example", status: "modified", additions: 3, deletions: 0, binary: false, owners: ["@acme/platform"] },
      { path: "package.json", status: "modified", additions: 14, deletions: 4, binary: false, owners: ["@acme/platform"] },
      { path: "package-lock.json", status: "modified", additions: 88, deletions: 8, binary: false }
    ],
    addedLines: 326,
    projectSignals: [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "npm",
        scripts: {
          lint: "eslint .",
          test: "vitest run",
          build: "vite build",
          "test:e2e": "playwright test"
        },
        workspacePackages: [
          {
            name: "@acme/web",
            projectName: "web",
            path: "apps/web",
            scripts: {
              lint: "eslint src",
              test: "vitest run",
              build: "vite build"
            },
            targets: ["lint", "test", "build"],
            dependencies: ["@acme/payments"]
          },
          {
            name: "@acme/payments",
            projectName: "payments",
            path: "packages/payments",
            scripts: {
              test: "vitest run"
            },
            targets: ["test"]
          }
        ]
      },
      {
        ecosystem: "github-actions",
        manifestPath: ".github/workflows/release.yml"
      }
    ],
    affectedPackages: [
      {
        name: "@acme/web",
        projectName: "web",
        path: "apps/web",
        scripts: {
          lint: "eslint src",
          test: "vitest run",
          build: "vite build"
        },
        targets: ["lint", "test", "build"],
        dependencies: ["@acme/payments"]
      }
    ],
    dependencyChanges: [
      {
        file: "package-lock.json",
        packageName: "yaml",
        packagePath: "node_modules/yaml",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "2.8.1",
        after: "2.9.0"
      },
      {
        file: "package-lock.json",
        packageName: "@acme/payments",
        packagePath: "node_modules/@acme/payments",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "4.2.0",
        after: "4.3.0"
      }
    ],
    packageScriptChanges: [
      {
        file: "package.json",
        scriptName: "postinstall",
        changeType: "added",
        after: "node scripts/bootstrap-agent.js"
      },
      {
        file: "package.json",
        scriptName: "test",
        changeType: "updated",
        before: "vitest run",
        after: "true"
      }
    ],
    policy: {
      path: ".patchdrill.yml",
      ignoredPaths: ["dist/**", "coverage/**"],
      failOn: "high",
      maxRisk: 69,
      ruleCount: 4,
      requiredCommandCount: 1,
      optionalCommandCount: 1
    },
    codeOwners: {
      path: ".github/CODEOWNERS",
      ruleCount: 4
    },
    baseline: {
      path: "main-patchdrill-report.json",
      previousStatus: "warn",
      currentStatus: "fail",
      previousRiskScore: 31,
      currentRiskScore: 94,
      riskDelta: 63,
      newFindingCount: 6,
      resolvedFindingCount: 0,
      unchangedFindingCount: 1
    },
    findings: [
      {
        ruleId: "workflow.pull-request-target-head-checkout",
        severity: "critical",
        title: "Privileged workflow checks out pull request code",
        detail: "A pull_request_target workflow can run untrusted pull request code while write tokens or repository secrets are available.",
        file: ".github/workflows/release.yml",
        line: 19,
        remediation: "Use pull_request for untrusted code, remove PR-head checkout, or split the privileged publishing step behind an environment gate.",
        tags: ["ci", "supply-chain", "github-actions"]
      },
      {
        ruleId: "secret.added",
        severity: "critical",
        title: "Secret-looking value added",
        detail: "A newly added environment example contains a value with a live-key shape. The demo redacts the actual token body.",
        file: ".env.example",
        line: 8,
        remediation: "Remove the value, rotate the credential if it was real, and use a non-secret placeholder such as <redacted>.",
        tags: ["secret", "credentials"]
      },
      {
        ruleId: "agent.instructions-changed",
        severity: "high",
        title: "Agent instructions changed",
        detail: "Repository-level coding-agent instructions changed in the same patch as release and billing code.",
        file: "AGENTS.md",
        remediation: "Review instruction changes separately and require maintainer approval before agent-visible rules change.",
        tags: ["agentic-coding", "review"]
      },
      {
        ruleId: "file.high-impact-area",
        severity: "high",
        title: "High-impact product area changed",
        detail: "Billing checkout and webhook code changed, which can affect payment capture, refunds, and entitlement state.",
        file: "apps/web/src/billing/checkout.ts",
        remediation: "Attach targeted billing regression tests and owner approval.",
        tags: ["billing", "payments"]
      },
      {
        ruleId: "package-script.disabled-verification",
        severity: "high",
        title: "Verification script disabled: test",
        detail: "package.json verification script \"test\" now appears to exit successfully without running meaningful checks.",
        file: "package.json",
        remediation: "Restore the real verification command or explain why this repository no longer has that check.",
        tags: ["testing", "ci", "package-script"]
      },
      {
        ruleId: "package-script.lifecycle",
        severity: "high",
        title: "Package lifecycle script changed: postinstall",
        detail: "package.json lifecycle script \"postinstall\" was added, creating code that can run during install, prepare, pack, or publish flows.",
        file: "package.json",
        remediation: "Review the script as executable supply-chain surface. Prefer explicit CI steps or documented commands over implicit install-time behavior.",
        tags: ["dependencies", "supply-chain", "package-script"]
      },
      {
        ruleId: "test.missing-source-match",
        severity: "medium",
        title: "Source changed without matching test changes",
        detail: "Billing source files changed, but no matching checkout or webhook test files changed.",
        file: "apps/web/src/billing/checkout.ts",
        remediation: "Add or update tests covering signed webhook verification, failed payment paths, and entitlement updates.",
        tags: ["tests"]
      },
      {
        ruleId: "dependency.lockfile-update",
        severity: "low",
        title: "Dependency lockfile changed",
        detail: "@acme/payments changed from 4.2.0 to 4.3.0.",
        file: "package-lock.json",
        remediation: "Review release notes and verify transitive dependency impact.",
        tags: ["dependencies"]
      }
    ],
    commandPlan: [
      {
        id: "node-web-lint",
        label: "Lint affected web package",
        command: "npm run lint --workspace @acme/web",
        reason: "Billing and release-adjacent source files changed.",
        ecosystem: "node",
        required: true,
        packageName: "@acme/web",
        packagePath: "apps/web"
      },
      {
        id: "node-web-test",
        label: "Test affected web package",
        command: "npm test --workspace @acme/web",
        reason: "Billing checkout and webhook behavior changed.",
        ecosystem: "node",
        required: true,
        packageName: "@acme/web",
        packagePath: "apps/web"
      },
      {
        id: "node-web-build",
        label: "Build affected web package",
        command: "npm run build --workspace @acme/web",
        reason: "Production web package changed.",
        ecosystem: "node",
        required: true,
        packageName: "@acme/web",
        packagePath: "apps/web"
      },
      {
        id: "policy-release-review",
        label: "Release workflow review",
        command: "gh workflow view release.yml --yaml",
        reason: "Repository policy requires human-readable workflow evidence when privileged release jobs change.",
        ecosystem: "github-actions",
        required: true
      },
      {
        id: "node-web-e2e",
        label: "Billing browser e2e",
        command: "npm run test:e2e -- --grep billing",
        reason: "Optional browser coverage is available for checkout flows.",
        ecosystem: "node",
        required: false,
        packageName: "@acme/web",
        packagePath: "apps/web"
      }
    ],
    commandResults: [
      {
        id: "node-web-lint",
        command: "npm run lint --workspace @acme/web",
        exitCode: 0,
        durationMs: 6240,
        stdout: "@acme/web lint: ok\n",
        stderr: ""
      },
      {
        id: "node-web-test",
        command: "npm test --workspace @acme/web",
        exitCode: 1,
        durationMs: 11982,
        stdout: "CheckoutService.test.ts: 38 passed, 1 failed\nWebhook signature regression: expected 401, received 200\n",
        stderr: "FAIL apps/web/src/billing/webhook.test.ts > rejects unsigned webhook payloads\n"
      },
      {
        id: "node-web-build",
        command: "npm run build --workspace @acme/web",
        exitCode: 0,
        durationMs: 18321,
        stdout: "vite v6.0.0 building for production...\nbuilt in 4.2s\n",
        stderr: ""
      }
    ]
  };
}
