# Stack Coverage

PatchDrill coverage is fixture-backed and deterministic. This matrix describes what the current v0.1 engine can detect, plan, and explain before merge.

| Stack | Detects | Command Plans | Proof Signals |
| --- | --- | --- | --- |
| Node, npm, pnpm, Yarn, Bun | package.json scripts, package managers, workspaces, Turborepo, Nx, package automation scripts, JS lockfiles | typecheck, lint, unit, build, optional browser/e2e, package-scoped workspace commands, downstream dependents | dependency intent, lifecycle-script risk, no-op/removed verification scripts, manifest/lockfile proof gaps |
| Python, uv, Django, FastAPI | pyproject.toml, requirements.txt, uv.lock, manage.py, FastAPI app entrypoints, nested Python roots | scoped pytest, Django test/check, FastAPI import smoke, optional Ruff, mypy, Pyright | changed-test matching, dependency diffs, app entrypoint smoke evidence |
| Rust and Cargo | Cargo.toml, Cargo.lock, workspaces, nested crates, downstream local dependents | cargo test, cargo clippy, manifest-path scoped crate checks | Cargo dependency diffs, workspace impact, lockfile drift |
| Go | go.mod, go.sum, go.work, nested modules, local replace/workspace relationships | scoped go test, go vet, downstream module checks | module dependency diffs, go.sum resolution drift |
| Java, Maven, Gradle, Spring Boot | pom.xml, Gradle build files, version catalogs, Spring Boot manifests | Maven/Gradle tests, Gradle build, Spring Boot packaging | Maven/Gradle dependency diffs, JVM source-set test matching |
| Android Gradle | Android Gradle plugin projects, product flavors, generated sources, disabled variant filters | debug/flavor unit tests, assemble, lint with disabled-variant avoidance | variant-aware command plans and source-set impact |
| .NET and ASP.NET Core | .sln, .slnf, .csproj, ProjectReference graphs, central PackageVersion files, ASP.NET Core projects | solution-filter or project-scoped dotnet test, dotnet build, ASP.NET Core publish | NuGet dependency diffs and project-reference impact |
| Ruby, Rails, PHP, Laravel | Gemfile, Gemfile.lock, Rails apps, composer.json, composer.lock, Laravel artisan | RSpec/Rails tests, Composer scripts, PHPUnit, Laravel unit/feature tests, PHP syntax fallback | Bundler/Composer dependency diffs and framework-specific test matching |
| SwiftPM and Xcode | Package.swift, Xcode projects/workspaces, shared schemes, xctestplan files, target platforms | swift test, xcodebuild test/build with scheme, test plan, and destination guidance | Apple platform verification planning without running device-only flows by default |
| Terraform, Docker, Kubernetes, Helm, Kustomize | Terraform files, Dockerfile/compose files, Kubernetes manifests, Helm charts, Kustomize overlays | terraform fmt/validate, docker compose config, kubectl/helm/kustomize validation | infra review findings and deployment-manifest proof requirements |
| GitHub Actions and reusable workflows | workflow files, local reusable workflow references, OIDC, secrets inheritance, mutable actions, pull_request_target boundaries | workflow diff review and optional evidence for changed workflow surfaces | trust-boundary findings, SARIF/annotation output, release/OIDC risk evidence |
| Bazel, Buck2, Pants | workspace metadata, package targets, changed target scopes, reverse-dependency queries | targeted test/build commands plus optional downstream rdeps queries | graph-aware fallback when root metadata changes |

Use this as a public support matrix, not a claim that PatchDrill replaces stack-specific CI. PatchDrill plans the evidence that should exist; the repository still owns the actual commands and runtime dependencies.
