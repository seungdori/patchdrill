# PatchDrill

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **中文**

[![CI](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml/badge.svg)](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml)
![deterministic](https://img.shields.io/badge/deterministic-yes-2ea44f)
![runs offline](https://img.shields.io/badge/runs-offline-2ea44f)
![no model call](https://img.shields.io/badge/no%20model%20call-%E2%9C%93-2ea44f)
![no telemetry](https://img.shields.io/badge/no%20telemetry-%E2%9C%93-2ea44f)
![read-only by default](https://img.shields.io/badge/read--only-by%20default-2ea44f)
![license MIT](https://img.shields.io/badge/license-MIT-blue)

## 你的 AI 评审说 LGTM,CI 也是绿的。但这个 PR 仍然不该合并。

PatchDrill 是夹在代码评审和 CI 之间的**确定性证明层**,既管 AI 生成的补丁,也管人工补丁。它读取 git diff,告诉你合并前应当存在哪些证明——**不调用模型,不联网,每次答案都一样。**

**它不是 linter,不是 SAST,也不是 AI 评审工具。** 它回答那些工具从不过问的唯一问题:*合并前,当前这个 diff 该有哪些证明——又缺了哪些?*

[![针对高风险 AI 智能体 PR 的 PatchDrill Proof Pack——FAIL,风险 94/100](docs/media/patchdrill-demo.gif)](docs/media/patchdrill-dashboard.png)

*一个 AI 智能体开了这个 PR。PatchDrill 评分 **FAIL · 94/100**——特权 `pull_request_target` 工作流检出、一处泄露的密钥、一个被禁用的测试脚本——一条离线、确定性的命令就跑完了。不调用模型。(点击查看完整的静态报告;用 `vhs demo/patchdrill.tape` 重新生成 GIF。)*

**它能在 diff 中捕获什么:**

- **泄露的密钥**——补丁中新增的 `.env` 文件、私钥以及形似 token 的字符串
- **提示注入**——藏进 `AGENTS.md`、issue 模板和智能体会读到的文档里的指令
- **工作流权限提升**——宽泛的 token 写权限、`pull_request_target`、OIDC 凭据交换、`secrets: inherit`、未锁版本的 actions、远程脚本管道
- **缺失的证明**——改了源码却没改测试;计划中必跑的检查却从未运行
- **依赖漂移**——清单(manifest)变了却没动锁文件(以及锁文件漂移却没有清单层面的意图)
- **隐含的验证动作**——为*发生变更的*包及其下游依赖方推断出的具体命令,覆盖约 25 个生态系统,而不只是根级别的默认命令

> **专为这样的团队打造:合并 AI / 智能体写的 PR 太快,快到没法逐个 diff 肉眼过。** 本地 30 秒跑完——无需配置、无需改 CI、无需 API key:
>
> ```bash
> npx --yes patchdrill demo --scenario risky-agent-pr
> ```

输出是一个可移植的 **Proof Pack(证据包)**——含 Markdown、JSON、SARIF、一个自包含的 HTML 仪表盘,以及一份带哈希戳记的证据清单(evidence manifest)——人工评审者、CI 门禁、审计人员或前沿模型都能查看。加上 `--locale ko|ja|zh` 就能用你的语言运行。

## 30 秒演示

无需 git 仓库即可生成一个高风险 AI 智能体 PR 场景:

```bash
npx --yes patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

然后查看给评审者看的产物:

```bash
cat patchdrill-risky-demo/patchdrill-demo-summary.md
open patchdrill-risky-demo/patchdrill-demo.html
```

PatchDrill 会标出一处特权工作流边界、形似密钥的内容、包生命周期脚本风险,以及评审者在合并前该要求的验证计划。

```bash
npx --yes patchdrill scan --base origin/main --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html \
  --fail-on high \
  --max-risk 69
npx --yes patchdrill verify --evidence patchdrill-evidence.json
```

## 为什么选择 PatchDrill

- 让 AI 写的 PR 变得可评审,不必把另一个模型当作最终裁决。
- 为每个补丁构建 Proof Pack:给人看的 Markdown、给机器人用的 JSON(内含必需的结构化验证状态)、给 GitHub 代码扫描用的 SARIF、自包含的 HTML 仪表盘、精简的 PR 摘要,以及一份可事后验证的审计清单(记录报告、产物与命令输出的哈希)。
- 先在本地用,之后再进 CI。`scan` 从不改动仓库,命令只有在 `--run` 时才会运行。
- 盯住 diff 里最容易漏掉回归的地方:认证、计费、迁移、密钥、CI 工作流及其供应链、包自动化脚本、基础设施、锁文件、大型 diff、提示注入内容、缺失的测试变更,以及计划了却没跑的必需检查。
- 从补丁本身推断该跑哪些命令,而不是退而求其次只跑根级别的默认命令。
- 跟你现有的工具配合:git、npm、pnpm、yarn、bun、pytest、Django、FastAPI、cargo、Go、Maven、Gradle、Spring Boot、Android Gradle、Ruby、Rails、RSpec、PHP、Composer、Laravel、dotnet、ASP.NET Core、Swift、Xcode、Terraform、Docker、Kubernetes、Helm、Bazel 与 Buck2。
- 通过 `.patchdrill.yml` 支持策略即代码(policy-as-code),内含 default、regulated 和 agentic 入门策略包。
- 自带扎实的开源安全态势:CodeQL、OpenSSF Scorecard、Dependabot、严格的测试,以及包的 dry-run 验证。
- 看得懂 Node、Cargo、Go 和 Pants 工作区,以及嵌套的 Python 项目、嵌套的 Cargo 和 Go 工作区、Turborepo 和 Nx,从而精准定位你真正改动的包以及依赖它们的包,而不只是运行根级别命令。
- 内置第一方测试夹具(fixtures),覆盖 Node/Turborepo、Next.js、Python、uv 管理的 Python、Django、FastAPI、Rails、PHP/Composer、Terraform、Docker/Compose、Kubernetes/Helm/Kustomize、Java/Maven/Gradle、Spring Boot Maven/Gradle、Android Gradle、.NET、ASP.NET Core、SwiftPM、Xcode、Bazel、Buck2、Pants、Cargo 和 Go 等仓库形态。
- 不只是丢一句"锁文件变了",而是讲清 package.json、go.mod、Cargo.toml、pyproject.toml 等十多种格式里依赖的新增、移除和版本更新。(完整文件列表见[依赖评审](#依赖评审)。)
- 标记依赖证明缺口,例如只改了清单的依赖变更,或只有锁文件层面的解析漂移。
- 给变更文件补上 CODEOWNERS 负责人提示,评审者一眼就能看到对应的负责团队。
- 附带便于上手的案例研究、一份公开的技术栈覆盖矩阵,以及逐命令的验证状态,方便团队评估 PatchDrill 究竟产出了哪些证据。

## 它做了什么

PatchDrill 回答每个评审者都会问的四个问题:

1. 改了什么?
2. 触及了技术栈的哪些部分?
3. 应该运行什么来证明这个补丁?
4. 完成这次演练(drill)后还剩多少风险?

PatchDrill 不是又一个 AI 代码评审工具,不会去问模型某个 diff "看着行不行"。它构建确定性的证据:

| 层 | 主要问题 | 确定性? | 会运行命令? | 输出 |
| --- | --- | --- | --- | --- |
| AI PR 评审工具 | 这个 diff 看起来对吗? | 否 | 通常不会 | 评论、建议、设计反馈 |
| 传统 CI | 预先配置的检查通过了吗? | 是 | 是 | 日志与通过/失败状态 |
| SAST/SCA 扫描器 | 它是否匹配某条已知的安全或依赖规则? | 是 | 有时 | 告警与漏洞发现 |
| 评审自动化 | 配置的评审自动化触发了吗? | 是 | 有时 | PR 评论与注释 |
| PatchDrill | 针对这个 diff 应该存在哪些证明? | 是 | 仅在 `--run` 时 | Proof Pack、风险发现、命令计划、策略门禁 |

这条边界是刻意划定的:模型擅长判断,PatchDrill 擅长为同一个补丁每次都产出相同的可评审安全证据。先跑 PatchDrill,再把 Proof Pack 交给人工评审者、CI 门禁、审计轨迹或前沿模型。

## Proof Pack

Proof Pack 是为补丁生成的可移植证据包:

- 给 PR 评论和步骤摘要用的精简 Markdown 摘要。
- 给人工评审用的完整 Markdown 报告。
- 给机器人、仪表盘和策略门禁用的 JSON 报告。
- 给 GitHub 代码扫描用的 SARIF 报告。
- 自包含的 HTML 仪表盘,可选附带趋势历史。
- 记录报告、产物和命令输出摘要(digest)的证据清单。

清单验证见 [docs/EVIDENCE.md](docs/EVIDENCE.md);如何在评审流程中用 Proof Pack 见 [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md)。

从 CLI 打印这条边界和建议的初始命令:

```bash
patchdrill explain
```

摘要示例:

```text
PatchDrill Gate PASS - assessment WARN, risk 42/100, confidence 58/100
Gate policy: fail-on critical, max-risk 69
Changed files: 4, +121/-18
Required commands: 3, optional commands: 1
Verification evidence: 0 run, 0 passed, 0 failed, 0 timed out, 3 missing required, 1 optional skipped
Added lines inspected: 121
Top findings:
- [high] High-impact product area changed (src/auth/session.ts)
- [medium] Source changed without test changes
Run with --run to execute required verification commands. Add --run-optional to include optional checks.
```

## 安装

无需安装即可立即运行——它已发布在 [npm](https://www.npmjs.com/package/patchdrill) 上:

```bash
npx --yes patchdrill scan --base origin/main
```

或者全局安装:

```bash
npm install -g patchdrill
patchdrill scan --base origin/main
```

想直接从源码跑还没发布的最新构建,改用 `github:` 前缀:

```bash
npx --yes github:seungdori/patchdrill scan --base origin/main
```

为便于阅读,下面的示例使用 `patchdrill`。

## 快速上手

无需 git 仓库就能试一下输出:

```bash
patchdrill demo --output patchdrill-demo
```

看看这个失败案例,它展示了 PatchDrill 能在智能体写的 PR 里捕获什么:

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

改动 CI 之前,先看看 PatchDrill 能从你的仓库推断出什么:

```bash
patchdrill doctor
```

用于自动化:

```bash
patchdrill doctor --format json
```

分析未提交的改动:

```bash
patchdrill scan
```

把某个分支跟 `main` 对比分析:

```bash
patchdrill scan --base origin/main
```

运行推断出的必需命令:

```bash
patchdrill scan --base origin/main --run
```

包含可选检查,例如浏览器/e2e 和静态分析计划:

```bash
patchdrill scan --base origin/main --run --run-optional
```

写入并验证一个 Proof Pack:

```bash
patchdrill scan --base origin/main --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
patchdrill verify --evidence patchdrill-evidence.json
```

从已保存的 JSON 报告创建静态仪表盘:

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

`patchdrill dashboard` 会在渲染前校验每份已保存 JSON 报告的契约,这样过期或残缺的报告就不会被包装成精美的仪表盘。

对照生成的产物来验证证据清单:

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

检查本仓库是否已经可以发布为 npm / GitHub Action:

```bash
patchdrill release-check
patchdrill release-check --format json
```

发布工作流还会运行必需的 PatchDrill 验证、生成一个本地 Proof Pack 冒烟包,并在 `npm pack --dry-run` 之前验证其证据清单。

产物后处理全部完成后,重新生成证据清单:

```bash
patchdrill evidence --json patchdrill-report.json --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

`patchdrill evidence` 会先校验已保存的 JSON 报告契约(包括必需的结构化验证状态),再写入清单。

已提交的演示输出见 [examples/demo](examples/demo),其中 `patchdrill-demo-summary.md` 就是 PR 评论预览。

发布案例研究见 [docs/CASE_STUDIES.md](docs/CASE_STUDIES.md);由夹具支撑的支持矩阵见 [docs/STACK_COVERAGE.md](docs/STACK_COVERAGE.md)。

按从旧到新的顺序加入多份 JSON 报告,展示运行趋势:

```bash
patchdrill dashboard --json previous-report.json --json patchdrill-report.json --output patchdrill-dashboard.html
```

配合 PR 评论使用 GitHub Action:

```yaml
- uses: seungdori/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    pr-comment: "true"
```

该 Action 默认输出 GitHub Checks 注释。参见 [docs/ANNOTATIONS.md](docs/ANNOTATIONS.md)。

使用策略即代码:

```bash
patchdrill scan --config .patchdrill.yml
```

为编辑器和机器人导出 JSON Schema:

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
patchdrill schema evidence > patchdrill-evidence.schema.json
patchdrill schema doctor > patchdrill-doctor.schema.json
patchdrill schema release-check > patchdrill-release-check.schema.json
```

跟先前的报告对比:

```bash
patchdrill scan --baseline previous-patchdrill-report.json --max-risk-delta 0 --json patchdrill-report.json
```

添加一个 GitHub Actions 工作流:

```bash
patchdrill init
```

添加工作流及入门策略:

```bash
patchdrill init --policy
```

使用更严格的入门策略包:

```bash
patchdrill init --policy-pack regulated
```

## CLI

```text
patchdrill scan [options]
patchdrill dashboard --json <report.json> [--json <report.json>...] [--output <dashboard.html>]
patchdrill demo [--scenario <name>] [--output <directory>]
patchdrill doctor [--format text|json]
patchdrill evidence --json <report.json> --evidence <evidence.json> [artifact options]
patchdrill init [--force] [--policy] [--policy-pack <name>]
patchdrill explain
patchdrill release-check [--format text|json]
patchdrill schema [policy|report|evidence|doctor|release-check] [--output <path>]
patchdrill verify --evidence <patchdrill-evidence.json>
```

选项:

| 选项 | 说明 |
| --- | --- |
| `--base <ref>` | 与某个基准 ref 对比,例如 `origin/main`。 |
| `--head <ref>` | 使用 `--base` 时的 head ref,默认 `HEAD`。 |
| `--config <path>` | 从 `.patchdrill.yml/json` 或指定路径读取策略。 |
| `--baseline <path>` | 与先前的 PatchDrill JSON 报告进行对比。 |
| `--evidence <path>` | 在 `scan`/`evidence` 期间写入 Proof Pack 证据清单,或为 `verify` 指定一份清单。`scan --evidence` 需要 `--json`,清单才能验证报告契约。 |
| `--run` | 执行推断出的必需验证命令。 |
| `--run-optional` | 配合 `--run`,同时执行可选验证命令。 |
| `--github-annotations` | 为发现项输出 GitHub Actions 日志注释。 |
| `--summary-markdown <path>` | 写入用于 PR 评论或步骤摘要的精简 Markdown 摘要。 |
| `--markdown <path>` | 写入 Markdown 报告。 |
| `--json <path>` | 写入 JSON 报告。 |
| `--sarif <path>` | 写入用于 GitHub 代码扫描的 SARIF 报告。 |
| `--html <path>` | 写入自包含的静态 HTML 仪表盘。 |
| `--fail-on <level>` | 当发现项达到严重级别时失败:`info`、`low`、`medium`、`high`、`critical`。 |
| `--max-risk <score>` | 当风险评分高于 0-100 阈值时失败,默认 `69`。 |
| `--max-risk-delta <score>` | 当相对基准的风险增量高于 0-100 阈值时失败。需要 `--baseline`。 |
| `--max-output-chars <n>` | 保留每个命令输出流的最后 `n` 个字符,默认 `20000`。 |
| `--command-timeout-ms <n>` | 在 `n` 毫秒后停止每个验证命令。 |
| `--quiet` | 仅使用退出码。 |
| `--locale <lang>` | 面向人类的报告(markdown、摘要、HTML、控制台)语言:`en`、`ko`、`ja`、`zh`。默认使用系统区域设置(`LC_ALL`/`LANG`),其次为英文。JSON 与 SARIF 始终为英文。 |
| `--policy` | 与 `patchdrill init` 一起使用时创建 `.patchdrill.yml`。 |
| `--policy-pack <name>` | `patchdrill init` 的入门策略包:`default`、`regulated`、`agentic`。 |
| `--scenario <name>` | `patchdrill demo` 的演示场景:`review-ready`、`risky-agent-pr`。 |
| `--format <format>` | `doctor` 和 `release-check` 的输出格式:`text`、`json`。 |
| `--list` | 与 `patchdrill schema` 一起使用时列出可用的 schema。 |
| `--output <path>` | 写入 schema/仪表盘文件或演示产物目录。 |

布尔型标志接受显式取值,例如 `--run=false`、`--quiet=true` 和 `--github-annotations=off`。

## 支持的信号

PatchDrill 从仓库清单中检测项目形态:

| 生态系统 | 信号 | 典型命令 |
| --- | --- | --- |
| Node | `package.json`、锁文件、脚本 | `npm run typecheck`、`npm run check:types`、`npm run lint`、`npm run test`、`npm run test:unit`、`npm run build`,可选 `npm run test:e2e` |
| Python | `pyproject.toml`、`uv.lock`、`requirements.txt`、`setup.py`、`manage.py`、嵌套 Python 包根、`FastAPI()`、FastAPI 路由/依赖、Ruff/mypy/Pyright 配置 | `uv run pytest tests/test_module.py`、`cd packages/api && uv run pytest`、`python -m pytest`、`python manage.py test`、`python -m compileall .`,可选 `uv run ruff check .`、可选 `uv run mypy .`、可选 `uv run pyright`、FastAPI 应用与变更模块的导入冒烟测试 |
| Rust | `Cargo.toml`、根级与嵌套 Cargo 工作区 | `cargo test --all-targets`、`cargo test -p crate --all-targets`、`cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`、`cargo clippy -p crate --all-targets -- -D warnings` |
| Go | `go.mod`、`go.work`、嵌套 Go 模块与工作区根 | `go test ./...`、`cd services/api && go test ./...`、`go test ./module/...`、`cd services/go && go test ./module/...`、`go vet ./module/...` |
| Java/Kotlin | `pom.xml`、`build.gradle`、wrapper | `mvn test`、`gradle test`、`./gradlew test`、`./gradlew bootJar` |
| Android | `com.android.application`、`com.android.library`、`AndroidManifest.xml`、构建类型、产品风味(product flavor)、`variantFilter`、变体源集、生成的源路径 | `./gradlew testDebugUnitTest`、`./gradlew testReleaseUnitTest`、`./gradlew testFreeDebugUnitTest`、`./gradlew testMinApi24DemoDebugUnitTest`、`./gradlew assemble<Variant>`、`./gradlew lint<Variant>` |
| Ruby/Rails | `Gemfile`、`Gemfile.lock`、`config/application.rb`、RSpec 元数据 | `bin/rails test`、`bundle exec rails test`、`bundle exec rspec`、`bundle exec rake test` |
| PHP/Laravel | `composer.json`、`composer.lock`、`artisan`、`phpunit.xml` | `composer validate --strict`、`composer test`、`php artisan test`、`vendor/bin/phpunit`、PHP 语法 lint 回退 |
| .NET | `global.json`、`.slnf`、`.sln`、`.csproj`、`ProjectReference` | `dotnet test App.slnf`、`dotnet test tests/Api.Tests/Api.Tests.csproj`、`dotnet build src/Api/Api.csproj --no-restore`、`dotnet publish src/Api/Api.csproj --no-restore` |
| Swift | `Package.swift`、`Package.resolved`、`*.swift` | `swift test`、`swift build` |
| Xcode | `.xcworkspace`、`.xcodeproj`、共享的 `.xcscheme`、`.xctestplan`、Apple 应用源码/资源、scheme 目标平台 | `xcodebuild -workspace App.xcworkspace -scheme App -testPlan AppTests test`、`xcodebuild -project App.xcodeproj -scheme App -destination generic/platform=iOS build`、`xcodebuild -project App.xcodeproj -scheme App -showdestinations` |
| Terraform | `*.tf`、`*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`、Compose 文件 | `docker build .`、`docker compose -f compose.yaml config` |
| Kubernetes | `Chart.yaml`、`kustomization.yaml`、`k8s/`、`kubernetes/`、`manifests/` | `helm lint .`、`kubectl kustomize .`、`kubectl apply --dry-run=client -f k8s` |
| Bazel | `MODULE.bazel`、`WORKSPACE`、`BUILD.bazel`、`.bazelrc` | `bazel test //path/...`、`bazel build //path/...`、`bazel query 'rdeps(//..., set(//path/...))'`、可选的下游 `tests(rdeps(...))` 提升、根级元数据的全图回退 |
| Buck2 | `.buckconfig`、`BUCK`、`BUCK.v2` | `buck2 test //path/...`、`buck2 build //path/...`、`buck2 uquery 'rdeps(//..., set(//path/...))'`、可选的下游 `testsof(rdeps(...))` 提升、根级元数据的全图回退 |
| Pants | `pants.toml` | `pants --changed-since=HEAD --changed-dependents=transitive test` |
| GitHub Actions | `.github/workflows/*` | 工作流 diff 评审 |

Node 工作区方面,PatchDrill 检测 `package.json` workspaces 和 `pnpm-workspace.yaml`,再为直接变更的包及其下游依赖方生成包级命令,例如 `pnpm --filter @acme/api run test` 或 `npm --workspace @acme/api run build`。一旦存在 `turbo.json` 或 `nx.json`,它会改用原生任务运行器命令,例如 `pnpm exec turbo run test --filter=@acme/api` 或 `npx nx run api:test`。参见 [docs/MONOREPOS.md](docs/MONOREPOS.md)。

嵌套的 Python 项目方面,PatchDrill 把发现的每个 `pyproject.toml`、`uv.lock`、`requirements.txt` 或 `manage.py` 包根都当作独立的验证作用域,这样 monorepo 就能规划 `cd packages/pine-engine && uv run pytest`,而不会错误地把所有 Python 变更挤成一条根级命令。

Cargo 工作区方面(包括嵌套在 JavaScript 或多语言 monorepo 根之下的工作区),PatchDrill 读取 `[workspace].members`、crate 名称和工作区内部依赖,再为变更的 crate 及其下游依赖 crate 生成 `cargo test -p crate --all-targets` 或 `cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`,并附带可选的 clippy 计划。

嵌套的 Go 模块和 Go 工作区方面,PatchDrill 把发现的每个 `go.mod` 或 `go.work` 根都当作独立的验证作用域。Go 工作区方面,PatchDrill 读取 `go.work` 的 `use` 条目、模块名称和工作区内部的 `require` 依赖,再为变更的模块及其下游依赖模块生成 `go test ./module/...` 或 `cd services/go && go test ./module/...`,并附带可选的 `go vet` 计划。

Pants 仓库方面,PatchDrill 借助 Pants 原生的、感知 Git 的变更目标选择,配合 `--changed-since` 和 `--changed-dependents=transitive`,因此目标图(target graph)的跨语言展开仍由 Pants 掌控。

## 风险模型

PatchDrill 为补丁打出 0 到 100 的分数。分数越高越危险。

当前的确定性规则会查找:

- 任何需要评审和验证证据的变更文件。
- 携带密钥的文件,例如 `.env` 和私钥。
- diff 里新增的形似密钥的值,包括私钥和常见的 token 格式。
- 写进智能体可见文件(例如 `AGENTS.md`、issue 模板和 Markdown 文档)的提示注入指令。
- 高影响路径:认证、计费、会话、迁移、安全、加密、权限。
- 基础设施与发布行为:Docker、Terraform、Kubernetes、GitHub Actions。
- 工作流供应链风险:宽泛的 token 写权限、`pull_request_target`、继承的密钥、本地可复用工作流扇出到可变的远程可复用工作流、接收继承密钥或调用方 OIDC 权限的可变可复用工作流、环境作用域的 OIDC 部署作业、缺乏环境保护的云端 OIDC 凭据交换、未锁版本的 actions、可变的 `docker://` action 镜像、远程脚本管道、不可信 PR 元数据插值,以及特权 PR-head 检出的组合。
- 包自动化脚本风险:install/prepare/pack/publish 生命周期脚本、被删掉或被换成空操作的验证脚本,以及把远程下载内容管道传给解释器的包脚本。
- 依赖清单和锁文件变更。
- package.json、pyproject.toml、requirements.txt、NuGet PackageReference 与集中式 PackageVersion 文件、Maven pom.xml、Gradle 构建文件与版本目录、Gemfile、composer.json、go.mod、Cargo.toml、npm package-lock、pnpm-lock、yarn.lock、bun.lock、go.sum、Cargo.lock、poetry.lock、uv.lock、Pipfile.lock、Gemfile.lock 与 composer.lock 里依赖的新增、移除和更新。
- 依赖证明缺口:直接依赖清单变了却没有匹配的锁文件证据,以及锁文件解析变了却没有匹配的清单依赖意图。
- 遗留的二进制 `bun.lockb` 变更,并附上迁移到文本格式 `bun.lock` 的指引。
- 改了源码却没有邻近、对应或符合框架约定的测试变更。
- 大幅的行数增减以及二进制文件。
- 已推断或已配置、但没跑的必需验证命令。
- 失败的验证命令。
- 来自 `.patchdrill.yml` 的自定义策略规则。

风险模型刻意做到可解释。每一次分数上升,报告里都对应一个发现项。

内置规则 ID 及各自的含义见 [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md)。

## 策略即代码

PatchDrill 从仓库根目录读取 `.patchdrill.yml`、`.patchdrill.yaml` 或 `.patchdrill.json`。

```yaml
failOn: high
maxRisk: 69

ignoredPaths:
  - generated/**

requiredCommands:
  - id: contract-tests
    command: npm run test:contracts
    reason: API surfaces changed.

rules:
  - id: payments-owner-review
    title: Payments owner review required
    severity: critical
    path: src/payments/**
```

参见 [docs/POLICY.md](docs/POLICY.md)。

## GitHub Actions

生成一个工作流:

```bash
patchdrill init
```

或手动添加:

```yaml
name: PatchDrill

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  patchdrill:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: seungdori/patchdrill@v0
        id: patchdrill
        with:
          base: origin/${{ github.base_ref }}
          evidence: patchdrill-evidence.json
          summary: patchdrill-summary.md
          markdown: patchdrill-report.md
          json: patchdrill-report.json
          sarif: patchdrill.sarif
          html: patchdrill-dashboard.html
          fail-on: high
          max-risk: "69"
          run: "true"
          command-timeout-ms: "600000"
          annotations: "true"
          step-summary: "true"
          pr-comment: "true"
          # Optional: newline-separated previous JSON reports downloaded from earlier artifacts.
          # dashboard-history: |
          #   reports/patchdrill-previous.json
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: ${{ steps.patchdrill.outputs.report-sarif }}
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: patchdrill-report
          path: |
            ${{ steps.patchdrill.outputs.report-evidence }}
            ${{ steps.patchdrill.outputs.report-markdown }}
            ${{ steps.patchdrill.outputs.report-summary }}
            ${{ steps.patchdrill.outputs.report-json }}
            ${{ steps.patchdrill.outputs.report-html }}
            ${{ steps.patchdrill.outputs.report-sarif }}
```

Action 的布尔输入接受显式取值:`"true"`、`"false"`、`"1"`、`"0"`、`"yes"`、`"no"`、`"on"` 和 `"off"`。执行与注释开关会通过同一个 CLI 布尔解析器传递,因此 `run: "false"` 绝不会执行仓库命令。

## 报告示例

参见 [examples/report.md](examples/report.md)。
Proof Pack 评审流程见 [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md)。
代码扫描集成见 [docs/SARIF.md](docs/SARIF.md)。
仓库安全态势见 [docs/SECURITY_POSTURE.md](docs/SECURITY_POSTURE.md)。
拉取请求评论见 [docs/PR_COMMENTS.md](docs/PR_COMMENTS.md)。
静态 HTML 仪表盘见 [docs/DASHBOARD.md](docs/DASHBOARD.md)。
证据清单验证见 [docs/EVIDENCE.md](docs/EVIDENCE.md)。
机器可读的 schema 见 [docs/SCHEMAS.md](docs/SCHEMAS.md)。
负责人提示见 [docs/CODEOWNERS.md](docs/CODEOWNERS.md)。
风险增量见 [docs/BASELINES.md](docs/BASELINES.md)。
内置风险规则见 [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md)。

## 发布溯源

PatchDrill 自带一个发布工作流,用于 npm 可信发布(trusted publishing)与溯源(provenance)。先在 npm 里把该包配置为可信发布者,再从 GitHub Release 发布。参见 [docs/RELEASE.md](docs/RELEASE.md)。

发布前,运行:

```bash
patchdrill release-check
```

## 依赖评审

PatchDrill 会汇总以下变更文件里的依赖变化:`package.json`、`pyproject.toml`、`requirements.txt`、NuGet `PackageReference` / `PackageVersion` 清单、Maven `pom.xml`、Gradle `build.gradle` / `build.gradle.kts` / `libs.versions.toml`、`Gemfile`、`composer.json`、`go.mod`、`Cargo.toml`、npm `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`、`go.sum`、`Cargo.lock`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Gemfile.lock` 与 `composer.lock`,并在 Markdown 和 JSON 报告里列出包、依赖区段或锁文件路径、变更类型、旧版本和新版本。它还会标记依赖证明缺口,例如只改了清单却没有匹配的锁文件证据,或只有锁文件层面的解析漂移却没有清单意图。它让依赖变更的意图对评审者一目了然,从而补足更重量级的 SCA 工具。

## 包脚本评审

PatchDrill 还会在 Markdown、JSON 和 HTML 报告里汇总 `package.json` 脚本的新增、移除和更新。风险发现会点出 install/prepare/pack/publish 生命周期钩子、空操作的验证脚本、被删掉的 test/lint/build 脚本,以及把远程下载内容管道传给解释器的包脚本。

## 设计原则

- 确定性优先。不调用模型也能拿到有用的答案。同一个 diff 下,发现项、风险评分和命令计划都可复现;报告里的 `generatedAt` 时间戳是唯一刻意可变的字段,且它遵循 `SOURCE_DATE_EPOCH`,因此报告可以做到逐字节一致,便于缓存、快照和可复现审计。
- 重证据,不凭感觉。评审者应当看到确切的命令、发现项、产物和摘要。
- 默认本地。源码留在你的检出目录里。
- 保守评分。PatchDrill 宁可要求补证明,也不愿默默放行一个高风险补丁。
- 可后续扩展。规则引擎足够小,贡献者能轻松添加生态系统和策略。
- 可信分发。CI 会验证构建、测试、SARIF 生成和 npm 包内容。

## 路线图

- 为常见开源技术栈提供更广的第一方夹具覆盖。
- 在 Turborepo、Nx、Pants、Cargo、Go、Bazel 和 Buck 工作区之外,接入更多原生的受影响任务(affected-task)集成。
- 本地 TUI,用于交互式接受或拒绝推断出的验证命令。
- 可选的 LLM 摘要模式,但绝不替代确定性发现。

## 常见问题

**这是个 AI 工具吗?** 不是。PatchDrill **零模型调用**,无需 API key,完全离线运行。同样的 diff 喂进去,吐出来的 Proof Pack 逐字节一致(它遵循 `SOURCE_DATE_EPOCH`)。正因为如今代码越来越多由 AI 编写,才需要这样一个确定性层——它本身并不是又一个 AI。

**这不就是个 linter 或 SAST 吗?** 不是。linter 按固定规则检查代码,SAST 匹配已知的漏洞模式。PatchDrill 推断*这个特定 diff* 隐含哪些验证,并报告那些*应该*存在却不存在的证明——包括计划了却从未运行的必需检查。没有哪个 linter 或 SAST 会盯住这个缺口。

**这又是个我得加的 CI 门禁吗?** 不一定。本地 30 秒、零配置就能跑(`npx --yes patchdrill demo`)。它会理清针对一个 diff,你现有的评审和 CI 各该覆盖什么;`scan` 从不改动你的仓库,命令只有在 `--run` 时才会运行。

**它会回传数据吗?** 没有网络调用,没有遥测,没有账户。你的源码绝不会离开你的检出目录。

**为什么要信任一个新项目?** 你不必信任维护者,也不必看星标数——重跑任何一个 Proof Pack 都会得到逐字节一致的输出,每一个产物哈希你都能自己验证。CI 会拿约 25 种技术栈形态的第一方夹具来印证这个工具。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。最适合上手的贡献是新的生态系统检测器、风险规则,以及真实场景的报告夹具。

## 安全

只有当你传入 `--run` 时,PatchDrill 才会执行命令。它会在你的仓库 shell 里运行推断出的必需命令;可选命令则需同时加上 `--run` 和 `--run-optional`。必需检查计划了却没执行时,PatchDrill 会把它报告为缺失的验证证据,而不是默默把补丁当成已证明。Markdown、精简摘要、HTML 仪表盘和控制台输出会把每个计划中的命令标注为已通过、失败、超时、未运行或已跳过的可选项。`patchdrill init` 写入的 CI 工作流带有 `run: "true"` 和逐命令超时,因此拉取请求默认就会产出命令证据。扫描不可信仓库时,请先审查验证计划。参见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT
