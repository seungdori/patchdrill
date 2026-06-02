export interface StackCoverageEntry {
  stack: string;
  detects: string;
  commandPlans: string;
  proofSignals: string;
}

export const stackCoverage: StackCoverageEntry[] = [
  {
    stack: "Node, npm, pnpm, Yarn, Bun",
    detects: "package.json scripts, package managers, workspaces, Turborepo, Nx, package automation scripts, JS lockfiles",
    commandPlans: "typecheck, lint, unit, build, optional browser/e2e, package-scoped workspace commands, downstream dependents",
    proofSignals: "dependency intent, lifecycle-script risk, no-op/removed verification scripts, manifest/lockfile proof gaps"
  },
  {
    stack: "Python, uv, Django, FastAPI",
    detects: "pyproject.toml, requirements.txt, uv.lock, manage.py, FastAPI app entrypoints, nested Python roots",
    commandPlans: "scoped pytest, Django test/check, FastAPI import smoke, optional Ruff, mypy, Pyright",
    proofSignals: "changed-test matching, dependency diffs, app entrypoint smoke evidence"
  },
  {
    stack: "Rust and Cargo",
    detects: "Cargo.toml, Cargo.lock, workspaces, nested crates, downstream local dependents",
    commandPlans: "cargo test, cargo clippy, manifest-path scoped crate checks",
    proofSignals: "Cargo dependency diffs, workspace impact, lockfile drift"
  },
  {
    stack: "Go",
    detects: "go.mod, go.sum, go.work, nested modules, local replace/workspace relationships",
    commandPlans: "scoped go test, go vet, downstream module checks",
    proofSignals: "module dependency diffs, go.sum resolution drift"
  },
  {
    stack: "Java, Maven, Gradle, Spring Boot",
    detects: "pom.xml, Gradle build files, version catalogs, Spring Boot manifests",
    commandPlans: "Maven/Gradle tests, Gradle build, Spring Boot packaging",
    proofSignals: "Maven/Gradle dependency diffs, JVM source-set test matching"
  },
  {
    stack: "Android Gradle",
    detects: "Android Gradle plugin projects, product flavors, generated sources, disabled variant filters",
    commandPlans: "debug/flavor unit tests, assemble, lint with disabled-variant avoidance",
    proofSignals: "variant-aware command plans and source-set impact"
  },
  {
    stack: ".NET and ASP.NET Core",
    detects: ".sln, .slnf, .csproj, ProjectReference graphs, central PackageVersion files, ASP.NET Core projects",
    commandPlans: "solution-filter or project-scoped dotnet test, dotnet build, ASP.NET Core publish",
    proofSignals: "NuGet dependency diffs and project-reference impact"
  },
  {
    stack: "Ruby, Rails, PHP, Laravel",
    detects: "Gemfile, Gemfile.lock, Rails apps, composer.json, composer.lock, Laravel artisan",
    commandPlans: "RSpec/Rails tests, Composer scripts, PHPUnit, Laravel unit/feature tests, PHP syntax fallback",
    proofSignals: "Bundler/Composer dependency diffs and framework-specific test matching"
  },
  {
    stack: "SwiftPM and Xcode",
    detects: "Package.swift, Xcode projects/workspaces, shared schemes, xctestplan files, target platforms",
    commandPlans: "swift test, xcodebuild test/build with scheme, test plan, and destination guidance",
    proofSignals: "Apple platform verification planning without running device-only flows by default"
  },
  {
    stack: "Terraform, Docker, Kubernetes, Helm, Kustomize",
    detects: "Terraform files, Dockerfile/compose files, Kubernetes manifests, Helm charts, Kustomize overlays",
    commandPlans: "terraform fmt/validate, docker build, docker compose config, kubectl/helm/kustomize validation",
    proofSignals: "infra review findings and deployment-manifest proof requirements"
  },
  {
    stack: "GitHub Actions and reusable workflows",
    detects: "workflow files, local reusable workflow references, OIDC, secrets inheritance, mutable actions, pull_request_target boundaries",
    commandPlans: "workflow diff review and optional evidence for changed workflow surfaces",
    proofSignals: "trust-boundary findings, SARIF/annotation output, release/OIDC risk evidence"
  },
  {
    stack: "Bazel, Buck2, Pants",
    detects: "workspace metadata, package targets, changed target scopes, reverse-dependency queries",
    commandPlans: "targeted test/build commands plus optional downstream rdeps queries",
    proofSignals: "graph-aware fallback when root metadata changes"
  }
];

export function renderStackCoverageMarkdown(entries: StackCoverageEntry[] = stackCoverage): string {
  const lines = [
    "# Stack Coverage",
    "",
    "PatchDrill coverage is fixture-backed and deterministic. This matrix describes what the current v0.1 engine can detect, plan, and explain before merge.",
    "",
    "| Stack | Detects | Command Plans | Proof Signals |",
    "| --- | --- | --- | --- |"
  ];
  for (const entry of entries) {
    lines.push(`| ${escapePipe(entry.stack)} | ${escapePipe(entry.detects)} | ${escapePipe(entry.commandPlans)} | ${escapePipe(entry.proofSignals)} |`);
  }
  lines.push("");
  lines.push("Use this as a public support matrix, not a claim that PatchDrill replaces stack-specific CI. PatchDrill plans the evidence that should exist; the repository still owns the actual commands and runtime dependencies.");
  return `${lines.join("\n")}\n`;
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|");
}
