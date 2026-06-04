# PatchDrill

[English](README.md) · [한국어](README.ko.md) · **日本語** · [中文](README.zh.md)

[![CI](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml/badge.svg)](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml)
![deterministic](https://img.shields.io/badge/deterministic-yes-2ea44f)
![runs offline](https://img.shields.io/badge/runs-offline-2ea44f)
![no model call](https://img.shields.io/badge/no%20model%20call-%E2%9C%93-2ea44f)
![no telemetry](https://img.shields.io/badge/no%20telemetry-%E2%9C%93-2ea44f)
![read-only by default](https://img.shields.io/badge/read--only-by%20default-2ea44f)
![license MIT](https://img.shields.io/badge/license-MIT-blue)

## AI レビュアーは LGTM と言い、CI もグリーン。それでもこの PR はマージすべきではありません。

PatchDrill は、AI が生成したパッチと人間が書いたパッチのどちらにも使える、**コードレビューと CI のあいだに立つ決定論的な証明レイヤー**です。git の差分を読み取り、マージ前にどんな証跡をそろえておくべきかをはっきり示します。**モデル呼び出しなし、ネットワークなし、毎回まったく同じ答えを返します。**

**Linter でも、SAST でも、AI レビュアーでもありません。** これらのツールが決して問わない、たった一つの問いに答えます。すなわち、*この差分に対してマージ前にどんな証跡があるべきで、いま何が欠けているのか?* です。

[![リスクの高い AI エージェントの PR に対する PatchDrill Proof Pack — FAIL、リスク 94/100](docs/media/patchdrill-demo.gif)](docs/media/patchdrill-dashboard.png)

*ある AI エージェントが作成した PR です。PatchDrill はこれを **FAIL · 94/100** と評価しました。権限付き `pull_request_target` ワークフローのチェックアウト、漏洩したシークレット、無効化されたテストスクリプトを、オフラインで決定論的な一つのコマンドが検出しています。モデル呼び出しはありません。(クリックで完全な静止画レポート(スクリーンショット)を表示。GIF は `vhs demo/patchdrill.tape` で再生成できます。)*

**差分の中で検出する内容:**

- **漏洩したシークレット** — パッチで追加された `.env` ファイル、秘密鍵、トークン形式の文字列
- **プロンプトインジェクション** — エージェントが読み込む `AGENTS.md`・Issue テンプレート・ドキュメントに仕込まれた指示
- **ワークフローの権限昇格** — 広範なトークン書き込み、`pull_request_target`、OIDC 交換、`secrets: inherit`、ピン留めされていないアクション、リモートスクリプトのパイプ
- **欠けている証跡** — ソースを変更したのにテストは変えていない、必須チェックを計画したのに一度も実行していない
- **依存関係のドリフト** — マニフェストを変更したのに対応するロックファイルがない(逆に、マニフェストの意図がないロックファイルのドリフトも)
- **その差分が示唆する検証** — *変更した* パッケージと、約 25 のエコシステムにまたがる下流の依存パッケージに対する実際のコマンド。ルートレベルのデフォルトだけでは終わりません

> **AI やエージェントが書いた PR を、差分を一つずつ目視しきれない速さでマージしているチームのために作りました。** 設定も CI の変更も API キーも不要。ローカルで 30 秒です。
>
> ```bash
> npx --yes patchdrill demo --scenario risky-agent-pr
> ```

出力は、ポータブルな **Proof Pack(証跡パック)** です。Markdown、JSON、SARIF、自己完結型の HTML ダッシュボード、ハッシュで刻印した証跡マニフェストからなり、人間も CI ゲートも監査人もフロンティアモデルも、誰もが検査できます。`--locale ko|ja|zh` で好きな言語で実行できます。

## 30 秒デモ

git リポジトリがなくても、リスクの高い AI エージェントの PR シナリオを生成できます。

```bash
npx --yes patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

次に、レビュアー向けの成果物を確認します。

```bash
cat patchdrill-risky-demo/patchdrill-demo-summary.md
open patchdrill-risky-demo/patchdrill-demo.html
```

PatchDrill は、権限付きワークフローの境界、シークレットらしき内容、パッケージのライフサイクルスクリプトのリスク、そしてマージ前にレビュアーが求めるべき検証計画を示します。

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

## PatchDrill を選ぶ理由

- 別のモデルに最終判断を委ねなくても、AI 時代の PR をレビューできるようにします。
- パッチごとに Proof Pack を組み立てます。人間向けの Markdown、必須の構造化された検証ステータスを備えたボット向けの JSON、GitHub コードスキャン向けの SARIF、自己完結型の HTML ダッシュボード、コンパクトな PR サマリー、そしてレポート・成果物・コマンド出力のハッシュを含む、後から検証できる監査マニフェストです。
- まずローカルで、続いて CI で動きます。`scan` はリポジトリを一切変更せず、コマンドは `--run` を指定したときだけ実行します。
- 回帰がよく潜むレビュー領域にフラグを立てます。認証、課金、マイグレーション、シークレット、CI ワークフローのサプライチェーン、パッケージ自動化スクリプト、インフラ、ロックファイル、大きな差分、プロンプトインジェクションの内容、欠けたテスト変更、そして計画したのに実行されなかった必須チェックです。
- ルートレベルのデフォルトを流すだけでなく、パッチそのものから実行すべきコマンドを推論します。
- すでに手元にあるツールと連携します。git、npm、pnpm、yarn、bun、pytest、Django、FastAPI、cargo、Go、Maven、Gradle、Spring Boot、Android Gradle、Ruby、Rails、RSpec、PHP、Composer、Laravel、dotnet、ASP.NET Core、Swift、Xcode、Terraform、Docker、Kubernetes、Helm、Bazel、Buck2 です。
- `.patchdrill.yml` でポリシー・アズ・コードに対応します。default、regulated、agentic のスターターパックを同梱します。
- 本格的なオープンソースのセキュリティ姿勢を備えています。CodeQL、OpenSSF Scorecard、Dependabot、厳格なテスト、パッケージの dry-run 検証です。
- Node、Cargo、Go、Pants のワークスペースに加え、ネストした Python プロジェクト、ネストした Cargo・Go のワークスペース、Turborepo、Nx も理解します。ルートレベルのコマンドを闇雲に流すのではなく、実際に変更したパッケージと、それに依存する下流パッケージを狙い撃ちします。
- Node/Turborepo、Next.js、Python、uv 管理の Python、Django、FastAPI、Rails、PHP/Composer、Terraform、Docker/Compose、Kubernetes/Helm/Kustomize、Java/Maven/Gradle、Spring Boot Maven/Gradle、Android Gradle、.NET、ASP.NET Core、SwiftPM、Xcode、Bazel、Buck2、Pants、Cargo、Go の各リポジトリ形態向けに、ファーストパーティのスタックフィクスチャを同梱しています。
- 依存関係のマニフェストとロックファイルの変更を、ただ「ロックファイルが変わった」で済ませません。package.json・go.mod・Cargo.toml・pyproject.toml など十数種類の形式について、何が追加・削除・バージョン更新されたかを具体的に説明します。(全ファイルの一覧は[依存関係のレビュー](#依存関係のレビュー)を参照してください。)
- マニフェストだけの依存変更や、ロックファイルだけの解決ドリフトといった、依存関係の証跡ギャップにフラグを立てます。
- 変更したファイルに CODEOWNERS の所有者ヒントを添え、レビュアーが担当チームを把握できるようにします。
- ローンチ向けのケーススタディ、公開のスタックカバレッジマトリクス、コマンドごとの検証ステータスを同梱し、PatchDrill が実際にどんな証跡を出すのかをチームが見極められるようにします。

## 何をするか

PatchDrill は、どんなレビュアーも必ず問う 4 つの質問に答えます。

1. 何が変わったか?
2. スタックのどの部分に影響するか?
3. このパッチを証明するには何を実行すべきか?
4. ドリルを終えた後、どんなリスクが残るか?

PatchDrill は、ありがちな AI コードレビュアーではありません。差分が「問題なさそうか」をモデルに尋ねたりはせず、決定論的な証跡を組み立てます。

| レイヤー | 主な問い | 決定論的か? | コマンドを実行するか? | 出力 |
| --- | --- | --- | --- | --- |
| AI PR レビュアー | この差分は正しそうか? | いいえ | 通常は実行しない | コメント、提案、設計フィードバック |
| 従来の CI | 設定済みのチェックが通ったか? | はい | はい | ログと合否ステータス |
| SAST/SCA スキャナー | 既知のセキュリティ・依存関係ルールに一致するか? | はい | 場合による | アラートと脆弱性の検出結果 |
| レビュー自動化 | 設定したレビュー自動化が発火したか? | はい | 場合による | PR コメントとアノテーション |
| PatchDrill | この差分にどんな証跡があるべきか? | はい | `--run` 指定時のみ | Proof Pack、リスク検出結果、コマンド計画、ポリシーゲート |

この境界は意図的なものです。判断はモデルが得意とし、同じパッチから毎回同じ、レビュー可能な安全性の証跡を出すのは PatchDrill が得意とします。まず PatchDrill を実行し、その Proof Pack を人間のレビュアー、CI ゲート、監査証跡、あるいはフロンティアモデルに渡してください。

## Proof Pack

Proof Pack は、パッチごとに生成するポータブルな証跡バンドルです。

- PR コメントやステップサマリー向けのコンパクトな Markdown サマリー。
- 人間がレビューするための完全な Markdown レポート。
- ボット、ダッシュボード、ポリシーゲート向けの JSON レポート。
- GitHub コードスキャン向けの SARIF レポート。
- トレンド履歴も載せられる、自己完結型の HTML ダッシュボード。
- レポート・成果物・コマンド出力のダイジェストを記録した証跡マニフェスト。

マニフェストの検証は [docs/EVIDENCE.md](docs/EVIDENCE.md) を、レビューワークフローでの Proof Pack の使い方は [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md) を参照してください。

境界と、最初に試すべきコマンドは CLI から表示できます。

```bash
patchdrill explain
```

サマリーの例:

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

## インストール

インストール不要で、すぐに実行できます。[npm](https://www.npmjs.com/package/patchdrill) で公開しています。

```bash
npx --yes patchdrill scan --base origin/main
```

あるいはグローバルにインストールします。

```bash
npm install -g patchdrill
patchdrill scan --base origin/main
```

未リリースの最新ビルドをソースから直接実行するには、`github:` プレフィックスを使います。

```bash
npx --yes github:seungdori/patchdrill scan --base origin/main
```

以下の例では、読みやすさのために `patchdrill` と表記します。

## クイックスタート

git リポジトリなしで出力を試せます。

```bash
patchdrill demo --output patchdrill-demo
```

エージェントが書いた PR で PatchDrill が何を検出するか、その失敗ケースを試せます。

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

CI を変える前に、PatchDrill がリポジトリから何を推論できるかを確かめます。

```bash
patchdrill doctor
```

自動化のために:

```bash
patchdrill doctor --format json
```

未コミットの作業を解析します。

```bash
patchdrill scan
```

ブランチを `main` と比較して解析します。

```bash
patchdrill scan --base origin/main
```

推論した必須コマンドを実行します。

```bash
patchdrill scan --base origin/main --run
```

ブラウザ/e2e や静的解析の計画といった任意チェックも含めます。

```bash
patchdrill scan --base origin/main --run --run-optional
```

Proof Pack を書き出し、検証します。

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

保存済みの JSON レポートから静的なダッシュボードを作ります。

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

`patchdrill dashboard` はレンダリング前に保存済み JSON レポートの契約を一つずつ検証します。そのため、古かったり不完全だったりするレポートから、見栄えだけ整ったダッシュボードができてしまうことはありません。

証跡マニフェストを、生成元の成果物と突き合わせて検証します。

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

このリポジトリが npm/GitHub Action のリリースに耐えるかを確認します。

```bash
patchdrill release-check
patchdrill release-check --format json
```

リリースワークフローは必須の PatchDrill 検証も実行し、ローカルの Proof Pack スモークバンドルを生成して、`npm pack --dry-run` の前にその証跡マニフェストを検証します。

成果物を最終的に後処理した後で、証跡マニフェストを再生成します。

```bash
patchdrill evidence --json patchdrill-report.json --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

`patchdrill evidence` は、マニフェストを書き出す前に、必須の構造化された検証ステータスを含め、保存済みの JSON レポート契約をまず検証します。

コミット済みのデモ出力は [examples/demo](examples/demo) で確認できます。PR コメントのプレビュー用に `patchdrill-demo-summary.md` も入っています。

ローンチ向けのケーススタディは [docs/CASE_STUDIES.md](docs/CASE_STUDIES.md)、フィクスチャに裏付けられたサポートマトリクスは [docs/STACK_COVERAGE.md](docs/STACK_COVERAGE.md) で読めます。

実行トレンドを表示するには、古いものから新しいものの順に JSON レポートを複数並べます。

```bash
patchdrill dashboard --json previous-report.json --json patchdrill-report.json --output patchdrill-dashboard.html
```

PR コメント付きで GitHub Action を使います。

```yaml
- uses: seungdori/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    pr-comment: "true"
```

Action はデフォルトで GitHub Checks のアノテーションを発行します。[docs/ANNOTATIONS.md](docs/ANNOTATIONS.md) を参照してください。

ポリシー・アズ・コードを使います。

```bash
patchdrill scan --config .patchdrill.yml
```

エディターやボット向けに JSON スキーマを書き出します。

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
patchdrill schema evidence > patchdrill-evidence.schema.json
patchdrill schema doctor > patchdrill-doctor.schema.json
patchdrill schema release-check > patchdrill-release-check.schema.json
```

以前のレポートと比較します。

```bash
patchdrill scan --baseline previous-patchdrill-report.json --max-risk-delta 0 --json patchdrill-report.json
```

GitHub Actions ワークフローを追加します。

```bash
patchdrill init
```

ワークフローとスターターポリシーを追加します。

```bash
patchdrill init --policy
```

より厳格なスターターポリシーパックを使います。

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

オプション:

| オプション | 説明 |
| --- | --- |
| `--base <ref>` | ベース ref と比較します。例: `origin/main`。 |
| `--head <ref>` | `--base` 使用時の Head ref。デフォルトは `HEAD`。 |
| `--config <path>` | `.patchdrill.yml/json` または指定したパスからポリシーを読み込みます。 |
| `--baseline <path>` | 以前の PatchDrill JSON レポートと比較します。 |
| `--evidence <path>` | `scan`/`evidence` の実行中に Proof Pack の証跡マニフェストを書き出すか、`verify` 用に一つ選びます。`scan --evidence` は、マニフェストがレポート契約を検証できるよう `--json` が必要です。 |
| `--run` | 推論した必須の検証コマンドを実行します。 |
| `--run-optional` | `--run` と併用し、任意の検証コマンドも実行します。 |
| `--github-annotations` | 検出結果を GitHub Actions のログアノテーションとして発行します。 |
| `--summary-markdown <path>` | PR コメントやステップサマリー向けのコンパクトな Markdown サマリーを書き出します。 |
| `--markdown <path>` | Markdown レポートを書き出します。 |
| `--json <path>` | JSON レポートを書き出します。 |
| `--sarif <path>` | GitHub コードスキャン向けの SARIF レポートを書き出します。 |
| `--html <path>` | 自己完結型の静的 HTML ダッシュボードを書き出します。 |
| `--fail-on <level>` | 検出結果が次の重大度に達したら失敗します: `info`、`low`、`medium`、`high`、`critical`。 |
| `--max-risk <score>` | リスクスコアが 0〜100 のしきい値を超えたら失敗します。デフォルトは `69`。 |
| `--max-risk-delta <score>` | ベースラインからのリスク増加が 0〜100 のしきい値を超えたら失敗します。`--baseline` が必要です。 |
| `--max-output-chars <n>` | 各コマンド出力ストリームの末尾 `n` 文字を残します。デフォルトは `20000`。 |
| `--command-timeout-ms <n>` | 各検証コマンドを `n` ミリ秒で打ち切ります。 |
| `--quiet` | 終了コードだけを使います。 |
| `--locale <lang>` | 人間向けレポート(markdown、サマリー、HTML、コンソール)の言語: `en`、`ko`、`ja`、`zh`。デフォルトはシステムロケール(`LC_ALL`/`LANG`)、なければ英語です。JSON と SARIF は英語のままです。 |
| `--policy` | `patchdrill init` と併用したとき `.patchdrill.yml` を作成します。 |
| `--policy-pack <name>` | `patchdrill init` 用のスターターポリシーパック: `default`、`regulated`、`agentic`。 |
| `--scenario <name>` | `patchdrill demo` 用のデモシナリオ: `review-ready`、`risky-agent-pr`。 |
| `--format <format>` | `doctor` と `release-check` の出力形式: `text`、`json`。 |
| `--list` | `patchdrill schema` と併用したとき、使えるスキーマを一覧表示します。 |
| `--output <path>` | スキーマ/ダッシュボードファイル、またはデモ成果物ディレクトリを書き出します。 |

ブール型フラグは、`--run=false`、`--quiet=true`、`--github-annotations=off` のように明示的な値も受け付けます。

## サポートするシグナル

PatchDrill はリポジトリのマニフェストからプロジェクトの形態を見分けます。

| エコシステム | シグナル | 典型的なコマンド |
| --- | --- | --- |
| Node | `package.json`、ロックファイル、スクリプト | `npm run typecheck`、`npm run check:types`、`npm run lint`、`npm run test`、`npm run test:unit`、`npm run build`、任意で `npm run test:e2e` |
| Python | `pyproject.toml`、`uv.lock`、`requirements.txt`、`setup.py`、`manage.py`、ネストされた Python パッケージルート、`FastAPI()`、FastAPI のルーター/依存性、Ruff/mypy/Pyright の設定 | `uv run pytest tests/test_module.py`、`cd packages/api && uv run pytest`、`python -m pytest`、`python manage.py test`、`python -m compileall .`、任意で `uv run ruff check .`、任意で `uv run mypy .`、任意で `uv run pyright`、FastAPI アプリと変更モジュールのインポートのスモーク |
| Rust | `Cargo.toml`、ルートおよびネストされた Cargo ワークスペース | `cargo test --all-targets`、`cargo test -p crate --all-targets`、`cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`、`cargo clippy -p crate --all-targets -- -D warnings` |
| Go | `go.mod`、`go.work`、ネストされた Go モジュールおよびワークスペースルート | `go test ./...`、`cd services/api && go test ./...`、`go test ./module/...`、`cd services/go && go test ./module/...`、`go vet ./module/...` |
| Java/Kotlin | `pom.xml`、`build.gradle`、ラッパー | `mvn test`、`gradle test`、`./gradlew test`、`./gradlew bootJar` |
| Android | `com.android.application`、`com.android.library`、`AndroidManifest.xml`、ビルドタイプ、プロダクトフレーバー、`variantFilter`、バリアントのソースセット、生成されたソースのパス | `./gradlew testDebugUnitTest`、`./gradlew testReleaseUnitTest`、`./gradlew testFreeDebugUnitTest`、`./gradlew testMinApi24DemoDebugUnitTest`、`./gradlew assemble<Variant>`、`./gradlew lint<Variant>` |
| Ruby/Rails | `Gemfile`、`Gemfile.lock`、`config/application.rb`、RSpec メタデータ | `bin/rails test`、`bundle exec rails test`、`bundle exec rspec`、`bundle exec rake test` |
| PHP/Laravel | `composer.json`、`composer.lock`、`artisan`、`phpunit.xml` | `composer validate --strict`、`composer test`、`php artisan test`、`vendor/bin/phpunit`、PHP 構文 lint のフォールバック |
| .NET | `global.json`、`.slnf`、`.sln`、`.csproj`、`ProjectReference` | `dotnet test App.slnf`、`dotnet test tests/Api.Tests/Api.Tests.csproj`、`dotnet build src/Api/Api.csproj --no-restore`、`dotnet publish src/Api/Api.csproj --no-restore` |
| Swift | `Package.swift`、`Package.resolved`、`*.swift` | `swift test`、`swift build` |
| Xcode | `.xcworkspace`、`.xcodeproj`、共有 `.xcscheme`、`.xctestplan`、Apple アプリのソース/リソース、スキームのターゲットプラットフォーム | `xcodebuild -workspace App.xcworkspace -scheme App -testPlan AppTests test`、`xcodebuild -project App.xcodeproj -scheme App -destination generic/platform=iOS build`、`xcodebuild -project App.xcodeproj -scheme App -showdestinations` |
| Terraform | `*.tf`、`*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`、Compose ファイル | `docker build .`、`docker compose -f compose.yaml config` |
| Kubernetes | `Chart.yaml`、`kustomization.yaml`、`k8s/`、`kubernetes/`、`manifests/` | `helm lint .`、`kubectl kustomize .`、`kubectl apply --dry-run=client -f k8s` |
| Bazel | `MODULE.bazel`、`WORKSPACE`、`BUILD.bazel`、`.bazelrc` | `bazel test //path/...`、`bazel build //path/...`、`bazel query 'rdeps(//..., set(//path/...))'`、任意で下流の `tests(rdeps(...))` への昇格、ルートメタデータにはグラフ全体へのフォールバック |
| Buck2 | `.buckconfig`、`BUCK`、`BUCK.v2` | `buck2 test //path/...`、`buck2 build //path/...`、`buck2 uquery 'rdeps(//..., set(//path/...))'`、任意で下流の `testsof(rdeps(...))` への昇格、ルートメタデータにはグラフ全体へのフォールバック |
| Pants | `pants.toml` | `pants --changed-since=HEAD --changed-dependents=transitive test` |
| GitHub Actions | `.github/workflows/*` | ワークフロー差分のレビュー |

Node ワークスペースでは、PatchDrill が `package.json` の workspaces と `pnpm-workspace.yaml` を検出し、直接変更したパッケージと下流の依存パッケージに対して `pnpm --filter @acme/api run test` や `npm --workspace @acme/api run build` といったパッケージスコープのコマンドを発行します。`turbo.json` や `nx.json` があれば、`pnpm exec turbo run test --filter=@acme/api` や `npx nx run api:test` のようなネイティブのタスクランナーコマンドを計画します。[docs/MONOREPOS.md](docs/MONOREPOS.md) を参照してください。

ネストした Python プロジェクトでは、検出した `pyproject.toml`、`uv.lock`、`requirements.txt`、`manage.py` の各パッケージルートを、それぞれ独立した検証スコープとして扱います。そのためモノレポでも、すべての Python 変更を誤ってルートコマンドにまとめず、`cd packages/pine-engine && uv run pytest` を計画できます。

Cargo ワークスペースでは、JavaScript やポリグロットのモノレポルートの下にネストしたものも含め、`[workspace].members`、crate 名、ワークスペース内部の依存関係を読み取ります。そして変更した crate と下流の依存 crate に対して `cargo test -p crate --all-targets` や `cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`、さらに任意で clippy 計画を発行します。

ネストした Go モジュールと Go ワークスペースでは、検出した `go.mod` または `go.work` の各ルートを、それぞれ独立した検証スコープとして扱います。Go ワークスペースなら `go.work` の `use` エントリ、モジュール名、ワークスペース内部の `require` 依存関係を読み取り、変更したモジュールと下流の依存モジュールに対して `go test ./module/...` や `cd services/go && go test ./module/...`、さらに任意で `go vet` 計画を発行します。

Pants リポジトリでは、`--changed-since` と `--changed-dependents=transitive` を用いた Pants ネイティブの Git 対応な変更ターゲット選択を使います。これにより、言語をまたいだターゲットグラフの展開は Pants が引き続き受け持ちます。

## リスクモデル

PatchDrill はパッチを 0 から 100 で採点します。高いほどリスクが大きいということです。

現在の決定論的なルールが探すのは、次のものです。

- レビューと検証の証跡を必要とする、変更されたファイル。
- `.env` や秘密鍵など、シークレットを含むファイル。
- 差分の中に追加された、秘密鍵や一般的なトークン形式といったシークレットらしき値。
- `AGENTS.md`、Issue テンプレート、Markdown ドキュメントなど、エージェントが目にするファイルに加えられたプロンプトインジェクションの指示。
- 影響度の高いパス: 認証、課金、セッション、マイグレーション、セキュリティ、暗号、権限。
- インフラとリリースの挙動: Docker、Terraform、Kubernetes、GitHub Actions。
- ワークフローのサプライチェーンリスク: 広範なトークン書き込み、`pull_request_target`、継承されたシークレット、ローカルの再利用可能ワークフローから可変なリモート再利用可能ワークフローへのファンアウト、継承されたシークレットや呼び出し元の OIDC 権限を受け取る可変な再利用可能ワークフロー、環境スコープの OIDC デプロイジョブ、環境保護のないクラウド OIDC 認証情報の交換、ピン留めされていないアクション、可変な `docker://` アクションイメージ、リモートスクリプトのパイプ、信頼できない PR メタデータの埋め込み、権限付き PR-head チェックアウトの組み合わせ。
- パッケージ自動化スクリプトのリスク: install/prepare/pack/publish のライフサイクルスクリプト、削除されたり no-op コマンドに置き換えられたりした検証スクリプト、リモートダウンロードをインタープリターにパイプするパッケージスクリプト。
- 依存関係のマニフェストとロックファイルの変更。
- package.json、pyproject.toml、requirements.txt、NuGet の PackageReference および集中管理の PackageVersion ファイル、Maven の pom.xml、Gradle のビルドファイルおよびバージョンカタログ、Gemfile、composer.json、go.mod、Cargo.toml、npm の package-lock、pnpm-lock、yarn.lock、bun.lock、go.sum、Cargo.lock、poetry.lock、uv.lock、Pipfile.lock、Gemfile.lock、composer.lock における依存関係の追加・削除・更新。
- 依存関係の証跡ギャップ: 対応するロックファイルの証跡を伴わない直接的な依存マニフェストの変更、および対応するマニフェストの依存意図を伴わないロックファイルの解決変更。
- レガシーバイナリ `bun.lockb` の変更(テキスト形式の `bun.lock` への移行を促すガイダンス付き)。
- 近接・ミラー・フレームワーク規約のいずれかに一致するテスト変更を伴わないソース変更。
- 大きな行差分とバイナリファイル。
- 推論または設定されたものの実行されなかった必須の検証コマンド。
- 失敗した検証コマンド。
- `.patchdrill.yml` のカスタムポリシールール。

リスクモデルは、あえて説明可能にしてあります。スコアが上がる理由は、すべてレポート内の検出結果として表れます。

組み込みのルール ID と各ルールの意味は [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md) を参照してください。

## ポリシー・アズ・コード

PatchDrill はリポジトリのルートにある `.patchdrill.yml`、`.patchdrill.yaml`、`.patchdrill.json` を読み込みます。

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

[docs/POLICY.md](docs/POLICY.md) を参照してください。

## GitHub Actions

ワークフローを生成します。

```bash
patchdrill init
```

あるいは手動で追加します。

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

Action のブール型入力は、明示的な値を受け付けます: `"true"`、`"false"`、`"1"`、`"0"`、`"yes"`、`"no"`、`"on"`、`"off"`。実行とアノテーションのトグルは同じ CLI のブールパーサーを通すので、`run: "false"` がリポジトリのコマンドを実行することは決してありません。

## レポートの例

[examples/report.md](examples/report.md) を参照してください。
Proof Pack のレビューワークフローについては [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md) を参照してください。
コードスキャンの統合については [docs/SARIF.md](docs/SARIF.md) を参照してください。
リポジトリのセキュリティ姿勢については [docs/SECURITY_POSTURE.md](docs/SECURITY_POSTURE.md) を参照してください。
プルリクエストのコメントについては [docs/PR_COMMENTS.md](docs/PR_COMMENTS.md) を参照してください。
静的 HTML ダッシュボードについては [docs/DASHBOARD.md](docs/DASHBOARD.md) を参照してください。
証跡マニフェストの検証については [docs/EVIDENCE.md](docs/EVIDENCE.md) を参照してください。
機械可読なスキーマについては [docs/SCHEMAS.md](docs/SCHEMAS.md) を参照してください。
所有者ヒントについては [docs/CODEOWNERS.md](docs/CODEOWNERS.md) を参照してください。
リスクデルタについては [docs/BASELINES.md](docs/BASELINES.md) を参照してください。
組み込みのリスクルールについては [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md) を参照してください。

## リリースのプロベナンス

PatchDrill には、npm の信頼された公開とプロベナンスのためのリリースワークフローが付属します。npm でパッケージを信頼された公開者として設定し、GitHub Release から公開してください。[docs/RELEASE.md](docs/RELEASE.md) を参照してください。

公開前に、次を実行します。

```bash
patchdrill release-check
```

## 依存関係のレビュー

PatchDrill は、変更された `package.json`、`pyproject.toml`、`requirements.txt`、NuGet の `PackageReference` / `PackageVersion` マニフェスト、Maven の `pom.xml`、Gradle の `build.gradle` / `build.gradle.kts` / `libs.versions.toml`、`Gemfile`、`composer.json`、`go.mod`、`Cargo.toml`、npm の `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`、`go.sum`、`Cargo.lock`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Gemfile.lock`、`composer.lock` から依存関係の変更を要約します。パッケージ、依存関係セクションまたはロックファイルのパス、変更種別、変更前のバージョン、変更後のバージョンを、Markdown と JSON のレポートに一覧表示します。対応するロックファイルの証跡を伴わない直接的なマニフェスト変更や、マニフェストの意図を伴わないロックファイルだけの解決ドリフトといった、依存関係の証跡ギャップにもフラグを立てます。レビュアーに見える形で依存関係の意図を明示し、より重量級の SCA ツールを補完します。

## パッケージスクリプトのレビュー

PatchDrill は、`package.json` のスクリプトの追加・削除・更新も Markdown、JSON、HTML のレポートに要約します。リスク検出結果は、install/prepare/pack/publish のライフサイクルフック、no-op の検証スクリプト、削除された test/lint/build スクリプト、リモートダウンロードをインタープリターにパイプするパッケージスクリプトを指摘します。

## 設計原則

- まず決定論的であること。有用な答えを得るのにモデル呼び出しは要りません。検出結果、リスクスコア、コマンド計画は、同じ差分なら再現できます。意図的に可変なのはレポートの `generatedAt` タイムスタンプだけで、これも `SOURCE_DATE_EPOCH` を尊重します。だからキャッシュ、スナップショット、再現可能な監査のために、レポートをバイト単位で同一にできます。
- 感覚頼みより Proof Pack。レビュアーは、正確なコマンド、検出結果、成果物、ダイジェストを見られるべきです。
- デフォルトでローカル。ソースコードは手元のチェックアウトから出ません。
- 保守的な採点。PatchDrill は、リスクのあるパッチを黙って承認するくらいなら、証跡を求めます。
- 後から拡張できる。ルールエンジンは、コントリビューターがエコシステムやポリシーを追加できる程度に小さく保っています。
- 信頼できる配布。CI がビルド、テスト、SARIF 生成、npm パッケージの内容を検証します。

## ロードマップ

- 一般的なオープンソーススタックに対する、より広いファーストパーティのフィクスチャカバレッジ。
- Turborepo、Nx、Pants、Cargo、Go、Bazel、Buck の各ワークスペースにとどまらない、より多くのネイティブな影響タスク統合。
- 推論した検証コマンドをインタラクティブに採否できるローカル TUI。
- 決定論的な検出結果を決して置き換えない、任意の LLM サマリーモード。

## FAQ

**これは AI ツールですか?** いいえ。PatchDrill は **モデル呼び出しをゼロ回** しか行わず、API キーも要らず、完全にオフラインで動きます。同じ差分を入力すれば、バイト単位で同一の Proof Pack が返ります(`SOURCE_DATE_EPOCH` を尊重します)。いまや AI がコードを書く *からこそ* 存在する決定論的なレイヤーであって、AI を一つ増やすものではありません。

**結局のところ Linter や SAST では?** いいえ。Linter は固定されたルールでコードをチェックし、SAST は既知の脆弱性パターンに一致させます。PatchDrill は、*この特定の差分* がどんな検証を意味するかを推論し、*あるべきなのに* ない証跡を報告します。計画したのに一度も実行されなかった必須チェックも含みます。そのギャップを追える Linter も SAST もありません。

**結局また CI ゲートを一つ増やすのでは?** その必要はありません。設定なしで(`npx --yes patchdrill demo`)、ローカルで 30 秒で実行できます。差分に対して、既存のレビューと CI がそれぞれ何をカバーすべきかを示すツールです。`scan` はリポジトリを一切変更せず、コマンドは `--run` 指定時だけ実行します。

**勝手に外部と通信しませんか?** ネットワーク呼び出しも、テレメトリも、アカウントもありません。ソースが手元のチェックアウトから外に出ることはありません。

**この新しいプロジェクトを、なぜ信頼できるのですか?** メンテナーもスター数も信頼する必要はありません。どの Proof Pack も再実行すればバイト単位で同一の出力が得られ、すべての成果物のハッシュを自分の手で検証できます。CI は、約 25 のスタック形態のファーストパーティフィクスチャに対してツールを証明します。

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。最初のコントリビューションには、新しいエコシステム検出器、リスクルール、実世界のレポートフィクスチャが向いています。

## セキュリティ

PatchDrill は、`--run` を渡したときだけコマンドを実行します。推論した必須コマンドをリポジトリのシェルで実行し、任意コマンドには `--run` と `--run-optional` の両方が必要です。必須チェックを計画したのに実行しなかった場合、PatchDrill は黙ってパッチを証明済み扱いせず、検証の証跡が欠けていると報告します。Markdown、コンパクトなサマリー、HTML ダッシュボード、コンソール出力は、計画した各コマンドに passed、failed、timed out、not run、skipped optional のいずれかのラベルを付けます。`patchdrill init` が書き出す CI ワークフローには `run: "true"` とコマンドごとのタイムアウトが入っているので、プルリクエストはデフォルトでコマンドの証跡を残します。信頼できないリポジトリをスキャンするときは、まず検証計画を確認してください。[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MIT
