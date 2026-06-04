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

PatchDrill は、AI が生成したパッチと人間が書いたパッチの両方を対象とする、**コードレビューと CI のあいだに位置する決定論的な証明レイヤー**です。git の差分を読み取り、マージ前にどんな証跡をそろえておくべきかをはっきり示します。**モデル呼び出しなし、ネットワークなし、毎回まったく同じ答えを返します。**

**Linter でも、SAST でも、AI レビュアーでもありません。** これらのツールが決して問わない、たった一つの問いに答えます。それは、*この差分に対してマージ前にどんな証跡が存在すべきか、そして何が欠けているのか?* という問いです。

[![リスクの高い AI エージェントの PR に対する PatchDrill Proof Pack — FAIL、リスク 94/100](docs/media/patchdrill-demo.gif)](docs/media/patchdrill-dashboard.png)

*ある AI エージェントがこの PR を作成しました。PatchDrill はこれを **FAIL · 94/100** と評価しました。権限付きの `pull_request_target` ワークフローによるチェックアウト、漏洩したシークレット、無効化されたテストスクリプトを、オフラインかつ決定論的な単一コマンドで検出したのです。モデル呼び出しはありません。(クリックすると完全な静止画レポート(スクリーンショット)を表示できます。GIF は `vhs demo/patchdrill.tape` で再生成できます。)*

**差分の中で検出する内容:**

- **漏洩したシークレット** — パッチで追加された `.env` ファイル、秘密鍵、トークン形式の文字列
- **プロンプトインジェクション** — エージェントが読み込む `AGENTS.md`・Issue テンプレート・ドキュメントに仕込まれた指示
- **ワークフローの権限昇格** — 広範なトークン書き込み、`pull_request_target`、OIDC 交換、`secrets: inherit`、ピン留めされていないアクション、リモートスクリプトのパイプ
- **欠けている証跡** — ソースが変更されたのにテストが変更されていない、必須チェックが計画されたのに一度も実行されていない
- **依存関係のドリフト** — マニフェストが変更されたのに対応するロックファイルがない(およびマニフェストの意図がないロックファイルのドリフト)
- **その差分が示唆する検証** — *変更された* パッケージと、約 25 のエコシステムにまたがる下流の依存パッケージに対する、ルートレベルのデフォルトだけにとどまらない実際のコマンド

> **AI/エージェントが作成した PR をマージするものの、もはや一つひとつの差分を目視しきれない — そんなチームのために作りました。** 設定不要、CI の変更不要、API キー不要で、ローカルで 30 秒で実行できます。
>
> ```bash
> npx --yes patchdrill demo --scenario risky-agent-pr
> ```

出力は、ポータブルな **Proof Pack(証跡パック)** です。Markdown、JSON、SARIF、自己完結型の HTML ダッシュボード、ハッシュで刻印された証跡マニフェストからなり、人間も、CI ゲートも、監査人も、フロンティアモデルも、いずれもこれを検査できます。`--locale ko|ja|zh` でお好みの言語で実行できます。

## 30 秒デモ

git リポジトリを用意することなく、リスクの高い AI エージェントの PR シナリオを生成します。

```bash
npx --yes patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

次に、レビュアー向けの成果物を確認します。

```bash
cat patchdrill-risky-demo/patchdrill-demo-summary.md
open patchdrill-risky-demo/patchdrill-demo.html
```

PatchDrill は、権限付きワークフローの境界、シークレットらしき内容、パッケージのライフサイクルスクリプトのリスク、そしてマージ前にレビュアーが求めるべき検証計画を示すはずです。

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

- 別のモデルに最終判断を委ねることなく、AI 時代の PR をレビュー可能にします。
- パッチごとに Proof Pack を構築します。人間向けの Markdown、必須の構造化された検証ステータスを備えたボット向けの JSON、GitHub コードスキャン向けの SARIF、自己完結型の HTML ダッシュボード、コンパクトな PR サマリー、そしてレポート・成果物・コマンド出力のハッシュを含む後から検証可能な監査マニフェストです。
- まずローカルで、その後 CI で動作します。`scan` はリポジトリを決して変更せず、コマンドは `--run` を指定したときにのみ実行されます。
- 回帰がよく潜むレビュー領域にフラグを立てます。認証、課金、マイグレーション、シークレット、CI ワークフローのサプライチェーン、パッケージ自動化スクリプト、インフラ、ロックファイル、大きな差分、プロンプトインジェクションの内容、欠けているテスト変更、そして計画されたのに実行されなかった必須チェックです。
- ルートレベルのデフォルトを実行するだけでなく、パッチからレビュー可能なコマンドを推論します。
- すでに手元にあるツールと連携します。git、npm、pnpm、yarn、bun、pytest、Django、FastAPI、cargo、Go、Maven、Gradle、Spring Boot、Android Gradle、Ruby、Rails、RSpec、PHP、Composer、Laravel、dotnet、ASP.NET Core、Swift、Xcode、Terraform、Docker、Kubernetes、Helm、Bazel、Buck2 です。
- `.patchdrill.yml` を通じてポリシー・アズ・コードをサポートします。default、regulated、agentic のスターターパックを含みます。
- 本格的なオープンソースのセキュリティ姿勢を備えて出荷されます。CodeQL、OpenSSF Scorecard、Dependabot、厳格なテスト、パッケージの dry-run 検証です。
- Node、Cargo、Go、Pants のワークスペースに加え、ネストされた Python プロジェクト、ネストされた Cargo および Go のワークスペース、Turborepo、Nx を理解し、ルートレベルのコマンドだけを盲目的に実行するのではなく、変更されたパッケージと下流の依存パッケージを対象とします。
- Node/Turborepo、Next.js、Python、uv で管理された Python、Django、FastAPI、Rails、PHP/Composer、Terraform、Docker/Compose、Kubernetes/Helm/Kustomize、Java/Maven/Gradle、Spring Boot Maven/Gradle、Android Gradle、.NET、ASP.NET Core、SwiftPM、Xcode、Bazel、Buck2、Pants、Cargo、Go の各リポジトリ形態に対するファーストパーティのスタックフィクスチャを同梱しています。
- 依存関係のマニフェストとロックファイルの変更を、単に「ロックファイルが変更された」と言うのではなく、package.json・go.mod・Cargo.toml・pyproject.toml など十数種類の形式について、何が追加・削除・バージョン更新されたかを具体的に説明します。（全ファイルの一覧は[依存関係のレビュー](#依存関係のレビュー)を参照してください。）
- マニフェストのみの依存関係変更や、ロックファイルのみの解決ドリフトといった、依存関係の証跡ギャップにフラグを立てます。
- 変更されたファイルに CODEOWNERS の所有者ヒントを付加し、レビュアーが責任を持つチームを確認できるようにします。
- ローンチに役立つケーススタディ、公開のスタックカバレッジマトリクス、コマンドごとの検証ステータスを含み、チームが PatchDrill が実際にどのような証跡を出力するかを評価できるようにします。

## 何をするか

PatchDrill は、すべてのレビュアーが問う 4 つの質問に答えます。

1. 何が変更されたか?
2. スタックのどの部分が影響を受けるか?
3. このパッチを証明するには何を実行すべきか?
4. ドリル実行後にどのリスクが残るか?

PatchDrill は、数ある AI コードレビュアーの一つではありません。差分が「問題なさそうか」をモデルに尋ねることはしません。決定論的な証跡を構築します。

| レイヤー | 主な問い | 決定論的か? | コマンドを実行するか? | 出力 |
| --- | --- | --- | --- | --- |
| AI PR レビュアー | この差分は正しそうか? | いいえ | 通常は実行しない | コメント、提案、設計フィードバック |
| 従来の CI | 事前設定されたチェックが通ったか? | はい | はい | ログと合否ステータス |
| SAST/SCA スキャナー | 既知のセキュリティまたは依存関係ルールに一致するか? | はい | 場合による | アラートと脆弱性の検出結果 |
| レビュー自動化 | 設定されたレビュー自動化が発火したか? | はい | 場合による | PR コメントとアノテーション |
| PatchDrill | この差分に対してどんな証跡が存在すべきか? | はい | `--run` 指定時のみ | Proof Pack、リスク検出結果、コマンド計画、ポリシーゲート |

この境界は意図的なものです。判断はモデルが得意とする領域ですが、同じパッチから毎回同じ、安全性に関するレビュー可能な証跡を生成するのは PatchDrill の役割です。まず PatchDrill を実行し、その後 Proof Pack を人間のレビュアー、CI ゲート、監査証跡、またはフロンティアモデルに引き渡してください。

## Proof Pack

Proof Pack は、パッチに対して生成されるポータブルな証跡バンドルです。

- PR コメントやステップサマリー向けのコンパクトな Markdown サマリー。
- 人間によるレビュー向けの完全な Markdown レポート。
- ボット、ダッシュボード、ポリシーゲート向けの JSON レポート。
- GitHub コードスキャン向けの SARIF レポート。
- 任意のトレンド履歴を含む、自己完結型の HTML ダッシュボード。
- レポート・成果物・コマンド出力のダイジェストを記録する証跡マニフェスト。

マニフェストの検証については [docs/EVIDENCE.md](docs/EVIDENCE.md) を、レビューワークフローでの Proof Pack の使い方については [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md) を参照してください。

CLI から境界と推奨される最初のコマンドを表示します。

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

インストール不要で即座に実行できます。[npm](https://www.npmjs.com/package/patchdrill) で公開されています。

```bash
npx --yes patchdrill scan --base origin/main
```

あるいはグローバルにインストールします。

```bash
npm install -g patchdrill
patchdrill scan --base origin/main
```

未リリースの最新ビルドをソースから直接実行するには、代わりに `github:` プレフィックスを使用します。

```bash
npx --yes github:seungdori/patchdrill scan --base origin/main
```

以下の例では、読みやすさのために `patchdrill` を使用しています。

## クイックスタート

git リポジトリなしで出力を試します。

```bash
patchdrill demo --output patchdrill-demo
```

エージェントが作成した PR で PatchDrill が何を検出するかを示す失敗ケースを試します。

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

CI を変更する前に、PatchDrill がリポジトリから何を推論できるかを診断します。

```bash
patchdrill doctor
```

自動化のために:

```bash
patchdrill doctor --format json
```

コミットされていない作業を解析します。

```bash
patchdrill scan
```

ブランチを `main` と比較して解析します。

```bash
patchdrill scan --base origin/main
```

推論された必須コマンドを実行します。

```bash
patchdrill scan --base origin/main --run
```

ブラウザ/e2e や静的解析の計画などの任意チェックを含めます。

```bash
patchdrill scan --base origin/main --run --run-optional
```

Proof Pack を書き出して検証します。

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

保存済みの JSON レポートから静的ダッシュボードを作成します。

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

`patchdrill dashboard` はレンダリング前に各保存済み JSON レポートの契約を検証するため、古い、または不完全なレポートから、見栄えだけ整ったダッシュボードが生成されることはありません。

証跡マニフェストを、それが生成した成果物に対して検証します。

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

このリポジトリが npm/GitHub Action のリリース準備ができているかを確認します。

```bash
patchdrill release-check
patchdrill release-check --format json
```

リリースワークフローは、必須の PatchDrill 検証も実行し、ローカルの Proof Pack スモークバンドルを生成して、`npm pack --dry-run` の前にその証跡マニフェストを検証します。

最終的な成果物の後処理後に、証跡マニフェストを再生成します。

```bash
patchdrill evidence --json patchdrill-report.json --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

`patchdrill evidence` は、マニフェストを書き出す前に、必須の構造化された検証ステータスを含め、保存済みの JSON レポート契約をまず検証します。

コミット済みのデモ出力は [examples/demo](examples/demo) で確認できます。PR コメントのプレビューとして `patchdrill-demo-summary.md` を含みます。

ローンチ向けのケーススタディは [docs/CASE_STUDIES.md](docs/CASE_STUDIES.md) で、フィクスチャに裏付けられたサポートマトリクスは [docs/STACK_COVERAGE.md](docs/STACK_COVERAGE.md) で読めます。

実行トレンドを表示するには、古いものから新しいものの順に複数の JSON レポートを追加します。

```bash
patchdrill dashboard --json previous-report.json --json patchdrill-report.json --output patchdrill-dashboard.html
```

PR コメント付きで GitHub Action を使用します。

```yaml
- uses: seungdori/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    pr-comment: "true"
```

Action はデフォルトで GitHub Checks のアノテーションを発行します。[docs/ANNOTATIONS.md](docs/ANNOTATIONS.md) を参照してください。

ポリシー・アズ・コードを使用します。

```bash
patchdrill scan --config .patchdrill.yml
```

エディターやボット向けに JSON スキーマをエクスポートします。

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

より厳格なスターターポリシーパックを使用します。

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
| `--head <ref>` | `--base` を使用する際の Head ref。デフォルトは `HEAD`。 |
| `--config <path>` | `.patchdrill.yml/json` または指定したパスからポリシーを読み込みます。 |
| `--baseline <path>` | 以前の PatchDrill JSON レポートと比較します。 |
| `--evidence <path>` | `scan`/`evidence` の実行中に Proof Pack の証跡マニフェストを書き出すか、`verify` 用に一つ選択します。`scan --evidence` は、マニフェストがレポート契約を検証できるよう `--json` を必要とします。 |
| `--run` | 推論された必須の検証コマンドを実行します。 |
| `--run-optional` | `--run` と併用して、任意の検証コマンドも実行します。 |
| `--github-annotations` | 検出結果に対する GitHub Actions のログアノテーションを発行します。 |
| `--summary-markdown <path>` | PR コメントやステップサマリー向けのコンパクトな Markdown サマリーを書き出します。 |
| `--markdown <path>` | Markdown レポートを書き出します。 |
| `--json <path>` | JSON レポートを書き出します。 |
| `--sarif <path>` | GitHub コードスキャン向けの SARIF レポートを書き出します。 |
| `--html <path>` | 自己完結型の静的 HTML ダッシュボードを書き出します。 |
| `--fail-on <level>` | 検出結果が次の重大度に達したとき失敗します: `info`、`low`、`medium`、`high`、`critical`。 |
| `--max-risk <score>` | リスクスコアが 0〜100 のしきい値を超えたとき失敗します。デフォルトは `69`。 |
| `--max-risk-delta <score>` | ベースラインからのリスク増加が 0〜100 のしきい値を超えたとき失敗します。`--baseline` が必要です。 |
| `--max-output-chars <n>` | 各コマンド出力ストリームから末尾の `n` 文字を保持します。デフォルトは `20000`。 |
| `--command-timeout-ms <n>` | 各検証コマンドを `n` ミリ秒後に停止します。 |
| `--quiet` | 終了コードのみを使用します。 |
| `--locale <lang>` | 人間向けレポート(markdown、サマリー、HTML、コンソール)の言語: `en`、`ko`、`ja`、`zh`。システムロケール(`LC_ALL`/`LANG`)、次に英語の順でデフォルトとなります。JSON と SARIF は英語のままです。 |
| `--policy` | `patchdrill init` と併用したとき `.patchdrill.yml` を作成します。 |
| `--policy-pack <name>` | `patchdrill init` 用のスターターポリシーパック: `default`、`regulated`、`agentic`。 |
| `--scenario <name>` | `patchdrill demo` 用のデモシナリオ: `review-ready`、`risky-agent-pr`。 |
| `--format <format>` | `doctor` と `release-check` の出力形式: `text`、`json`。 |
| `--list` | `patchdrill schema` と併用したとき、利用可能なスキーマを一覧表示します。 |
| `--output <path>` | スキーマ/ダッシュボードファイルまたはデモ成果物ディレクトリを書き出します。 |

ブール型フラグは、`--run=false`、`--quiet=true`、`--github-annotations=off` のような明示的な値を受け付けます。

## サポートするシグナル

PatchDrill はリポジトリのマニフェストからプロジェクトの形態を検出します。

| エコシステム | シグナル | 典型的なコマンド |
| --- | --- | --- |
| Node | `package.json`、ロックファイル、スクリプト | `npm run typecheck`、`npm run check:types`、`npm run lint`、`npm run test`、`npm run test:unit`、`npm run build`、任意で `npm run test:e2e` |
| Python | `pyproject.toml`、`uv.lock`、`requirements.txt`、`setup.py`、`manage.py`、ネストされた Python パッケージルート、`FastAPI()`、FastAPI のルーター/依存性、Ruff/mypy/Pyright の設定 | `uv run pytest tests/test_module.py`、`cd packages/api && uv run pytest`、`python -m pytest`、`python manage.py test`、`python -m compileall .`、任意で `uv run ruff check .`、任意で `uv run mypy .`、任意で `uv run pyright`、FastAPI アプリと変更モジュールのインポートのスモーク |
| Rust | `Cargo.toml`、ルートおよびネストされた Cargo ワークスペース | `cargo test --all-targets`、`cargo test -p crate --all-targets`、`cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`、`cargo clippy -p crate --all-targets -- -D warnings` |
| Go | `go.mod`、`go.work`、ネストされた Go モジュールおよびワークスペースルート | `go test ./...`、`cd services/api && go test ./...`、`go test ./module/...`、`cd services/go && go test ./module/...`、`go vet ./module/...` |
| Java/Kotlin | `pom.xml`、`build.gradle`、ラッパー | `mvn test`、`gradle test`、`./gradlew test`、`./gradlew bootJar` |
| Android | `com.android.application`、`com.android.library`、`AndroidManifest.xml`、ビルドタイプ、プロダクトフレーバー、`variantFilter`、バリアントのソースセット、生成されたソースパス | `./gradlew testDebugUnitTest`、`./gradlew testReleaseUnitTest`、`./gradlew testFreeDebugUnitTest`、`./gradlew testMinApi24DemoDebugUnitTest`、`./gradlew assemble<Variant>`、`./gradlew lint<Variant>` |
| Ruby/Rails | `Gemfile`、`Gemfile.lock`、`config/application.rb`、RSpec メタデータ | `bin/rails test`、`bundle exec rails test`、`bundle exec rspec`、`bundle exec rake test` |
| PHP/Laravel | `composer.json`、`composer.lock`、`artisan`、`phpunit.xml` | `composer validate --strict`、`composer test`、`php artisan test`、`vendor/bin/phpunit`、PHP 構文 lint のフォールバック |
| .NET | `global.json`、`.slnf`、`.sln`、`.csproj`、`ProjectReference` | `dotnet test App.slnf`、`dotnet test tests/Api.Tests/Api.Tests.csproj`、`dotnet build src/Api/Api.csproj --no-restore`、`dotnet publish src/Api/Api.csproj --no-restore` |
| Swift | `Package.swift`、`Package.resolved`、`*.swift` | `swift test`、`swift build` |
| Xcode | `.xcworkspace`、`.xcodeproj`、共有 `.xcscheme`、`.xctestplan`、Apple アプリのソース/リソース、スキームのターゲットプラットフォーム | `xcodebuild -workspace App.xcworkspace -scheme App -testPlan AppTests test`、`xcodebuild -project App.xcodeproj -scheme App -destination generic/platform=iOS build`、`xcodebuild -project App.xcodeproj -scheme App -showdestinations` |
| Terraform | `*.tf`、`*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`、Compose ファイル | `docker build .`、`docker compose -f compose.yaml config` |
| Kubernetes | `Chart.yaml`、`kustomization.yaml`、`k8s/`、`kubernetes/`、`manifests/` | `helm lint .`、`kubectl kustomize .`、`kubectl apply --dry-run=client -f k8s` |
| Bazel | `MODULE.bazel`、`WORKSPACE`、`BUILD.bazel`、`.bazelrc` | `bazel test //path/...`、`bazel build //path/...`、`bazel query 'rdeps(//..., set(//path/...))'`、任意で下流の `tests(rdeps(...))` への昇格、ルートメタデータに対するグラフ全体のフォールバック |
| Buck2 | `.buckconfig`、`BUCK`、`BUCK.v2` | `buck2 test //path/...`、`buck2 build //path/...`、`buck2 uquery 'rdeps(//..., set(//path/...))'`、任意で下流の `testsof(rdeps(...))` への昇格、ルートメタデータに対するグラフ全体のフォールバック |
| Pants | `pants.toml` | `pants --changed-since=HEAD --changed-dependents=transitive test` |
| GitHub Actions | `.github/workflows/*` | ワークフロー差分のレビュー |

Node ワークスペースの場合、PatchDrill は `package.json` の workspaces と `pnpm-workspace.yaml` を検出し、直接変更されたパッケージと下流の依存パッケージに対して `pnpm --filter @acme/api run test` や `npm --workspace @acme/api run build` といったパッケージスコープのコマンドを発行します。`turbo.json` または `nx.json` が存在する場合は、`pnpm exec turbo run test --filter=@acme/api` や `npx nx run api:test` のようなネイティブのタスクランナーコマンドを計画します。[docs/MONOREPOS.md](docs/MONOREPOS.md) を参照してください。

ネストされた Python プロジェクトの場合、PatchDrill は検出された各 `pyproject.toml`、`uv.lock`、`requirements.txt`、`manage.py` のパッケージルートをそれぞれ独自の検証スコープとして扱います。そのため、モノレポはすべての Python 変更を誤ってルートコマンドにまとめるのではなく、`cd packages/pine-engine && uv run pytest` を計画できます。

Cargo ワークスペースの場合、JavaScript やポリグロットのモノレポルートの下にネストされたワークスペースを含め、PatchDrill は `[workspace].members`、crate 名、ワークスペース内部の依存関係を読み取り、変更された crate と下流の依存 crate に対して `cargo test -p crate --all-targets` や `cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets` に加え、任意で clippy 計画を発行します。

ネストされた Go モジュールと Go ワークスペースの場合、PatchDrill は検出された各 `go.mod` または `go.work` のルートをそれぞれ独自の検証スコープとして扱います。Go ワークスペースの場合、PatchDrill は `go.work` の `use` エントリ、モジュール名、ワークスペース内部の `require` 依存関係を読み取り、変更されたモジュールと下流の依存モジュールに対して `go test ./module/...` や `cd services/go && go test ./module/...` に加え、任意で `go vet` 計画を発行します。

Pants リポジトリの場合、PatchDrill は `--changed-since` と `--changed-dependents=transitive` を用いた Pants ネイティブの Git 対応の変更ターゲット選択を使用するため、Pants が言語をまたいだターゲットグラフの展開の所有権を保持します。

## リスクモデル

PatchDrill はパッチを 0 から 100 で採点します。高いほどリスクが大きいことを意味します。

現在の決定論的なルールは、次のものを探します。

- レビューと検証の証跡を必要とする、変更されたファイル。
- `.env` や秘密鍵などのシークレットを含むファイル。
- 差分の中に追加された、秘密鍵や一般的なトークン形式を含むシークレットらしき値。
- `AGENTS.md`、Issue テンプレート、Markdown ドキュメントなど、エージェントに見えるファイルに追加されたプロンプトインジェクションの指示。
- 影響度の高いパス: 認証、課金、セッション、マイグレーション、セキュリティ、暗号、権限。
- インフラとリリースの挙動: Docker、Terraform、Kubernetes、GitHub Actions。
- ワークフローのサプライチェーンリスク: 広範なトークン書き込み、`pull_request_target`、継承されたシークレット、ローカルの再利用可能ワークフローから可変なリモート再利用可能ワークフローへのファンアウト、継承されたシークレットや呼び出し元の OIDC 権限を受け取る可変な再利用可能ワークフロー、環境スコープの OIDC デプロイジョブ、環境保護のないクラウド OIDC 認証情報の交換、ピン留めされていないアクション、可変な `docker://` アクションイメージ、リモートスクリプトのパイプ、信頼できない PR メタデータの埋め込み、権限付きの PR-head チェックアウトの組み合わせ。
- パッケージ自動化スクリプトのリスク: install/prepare/pack/publish のライフサイクルスクリプト、削除されたり no-op コマンドに置き換えられたりした検証スクリプト、リモートダウンロードをインタープリターにパイプするパッケージスクリプト。
- 依存関係のマニフェストとロックファイルの変更。
- package.json、pyproject.toml、requirements.txt、NuGet の PackageReference および集中管理の PackageVersion ファイル、Maven の pom.xml、Gradle のビルドファイルおよびバージョンカタログ、Gemfile、composer.json、go.mod、Cargo.toml、npm の package-lock、pnpm-lock、yarn.lock、bun.lock、go.sum、Cargo.lock、poetry.lock、uv.lock、Pipfile.lock、Gemfile.lock、composer.lock における依存関係の追加・削除・更新。
- 依存関係の証跡ギャップ: 対応するロックファイルの証跡を伴わない直接的な依存関係マニフェストの変更、および対応するマニフェストの依存意図を伴わないロックファイルの解決変更。
- レガシーバイナリ `bun.lockb` の変更（テキスト形式の `bun.lock` への移行を促すガイダンス付き）。
- 近接・ミラー・フレームワーク規約に一致するテスト変更を伴わないソース変更。
- 大きな行差分とバイナリファイル。
- 推論または設定されたが実行されなかった必須の検証コマンド。
- 失敗した検証コマンド。
- `.patchdrill.yml` のカスタムポリシールール。

リスクモデルは意図的に説明可能です。すべてのスコア増加は、レポート内の検出結果として表されます。

組み込みのルール ID と各ルールの意味については [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md) を参照してください。

## ポリシー・アズ・コード

PatchDrill はリポジトリのルートから `.patchdrill.yml`、`.patchdrill.yaml`、または `.patchdrill.json` を読み込みます。

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

Action のブール型入力は、明示的な値を受け付けます: `"true"`、`"false"`、`"1"`、`"0"`、`"yes"`、`"no"`、`"on"`、`"off"`。実行とアノテーションのトグルは同じ CLI のブールパーサーを通じて渡されるため、`run: "false"` がリポジトリのコマンドを実行することは決してありません。

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

PatchDrill には、npm の信頼された公開とプロベナンスのためのリリースワークフローが含まれています。npm でパッケージを信頼された公開者として設定し、その後 GitHub Release から公開してください。[docs/RELEASE.md](docs/RELEASE.md) を参照してください。

公開前に、次を実行します。

```bash
patchdrill release-check
```

## 依存関係のレビュー

PatchDrill は、変更された `package.json`、`pyproject.toml`、`requirements.txt`、NuGet の `PackageReference` / `PackageVersion` マニフェスト、Maven の `pom.xml`、Gradle の `build.gradle` / `build.gradle.kts` / `libs.versions.toml`、`Gemfile`、`composer.json`、`go.mod`、`Cargo.toml`、npm の `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`、`go.sum`、`Cargo.lock`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Gemfile.lock`、`composer.lock` の各ファイルから依存関係の変更を要約し、パッケージ、依存関係セクションまたはロックファイルのパス、変更種別、以前のバージョン、新しいバージョンを Markdown および JSON レポートに一覧表示します。また、対応するロックファイルの証跡を伴わない直接的なマニフェスト変更や、マニフェストの意図を伴わないロックファイルのみの解決ドリフトといった、依存関係の証跡ギャップにもフラグを立てます。これは、レビュアーに見える依存関係の意図を明示することで、より重量級の SCA ツールを補完します。

## パッケージスクリプトのレビュー

PatchDrill は、`package.json` のスクリプトの追加・削除・更新も Markdown、JSON、HTML レポートに要約します。リスク検出結果は、install/prepare/pack/publish のライフサイクルフック、no-op の検証スクリプト、削除された test/lint/build スクリプト、リモートダウンロードをインタープリターにパイプするパッケージスクリプトを指摘します。

## 設計原則

- まず決定論的であること。有用な答えを得るのにモデル呼び出しは不要です。検出結果、リスクスコア、コマンド計画は、同じ差分に対して再現可能です。レポートの `generatedAt` タイムスタンプだけが意図的に可変なフィールドであり、`SOURCE_DATE_EPOCH` を尊重するため、キャッシュ、スナップショット、再現可能な監査のためにレポートをバイト単位で同一にできます。
- 感覚頼みより Proof Pack。レビュアーは、正確なコマンド、検出結果、成果物、ダイジェストを見られるべきです。
- デフォルトでローカル。ソースコードはあなたのチェックアウト内にとどまります。
- 保守的な採点。PatchDrill は、リスクのあるパッチを黙って承認するよりも、証跡を求めることを選びます。
- 後から拡張可能。ルールエンジンは、コントリビューターがエコシステムやポリシーを追加できる程度に小さく保たれています。
- 信頼できる配布。CI がビルド、テスト、SARIF 生成、npm パッケージの内容を検証します。

## ロードマップ

- 一般的なオープンソーススタックに対する、より広範なファーストパーティのフィクスチャカバレッジ。
- Turborepo、Nx、Pants、Cargo、Go、Bazel、Buck の各ワークスペースを超えた、より多くのネイティブな影響タスク統合。
- 推論された検証コマンドをインタラクティブに受け入れ/拒否するためのローカル TUI。
- 決定論的な検出結果を決して置き換えない、任意の LLM サマリーモード。

## FAQ

**これは AI ツールですか?** いいえ。PatchDrill は **モデル呼び出しをゼロ回** 行い、API キーを必要とせず、完全にオフラインで動作します。同じ差分を入力すると、バイト単位で同一の Proof Pack が出力されます(`SOURCE_DATE_EPOCH` を尊重します)。これは、いまや AI がコードを書く *からこそ* 存在する決定論的なレイヤーであって、AI を一つ増やすものではありません。

**これは単なる Linter や SAST ではないのですか?** いいえ。Linter は固定されたルールに照らしてコードをチェックし、SAST は既知の脆弱性パターンに一致させます。PatchDrill は、*この特定の差分* がどんな検証を意味するかを推論し、*存在すべきなのに* 存在しない証跡を報告します。計画されたのに一度も実行されなかった必須チェックも含みます。そのギャップを追跡する Linter や SAST はありません。

**追加しなければならない、もう一つの CI ゲートですか?** そうである必要はありません。設定なしで(`npx --yes patchdrill demo`)ローカルで 30 秒で実行できます。これは、既存のレビューと CI が差分に対してそれぞれ何をカバーすべきかを示します。`scan` はリポジトリを決して変更せず、コマンドは `--run` 指定時にのみ実行されます。

**勝手に外部と通信したりしませんか?** ネットワーク呼び出しも、テレメトリも、アカウントもありません。あなたのソースはチェックアウトから決して外に出ません。

**この新しいプロジェクトは、なぜ信頼できるのですか?** メンテナーやスター数を信頼する必要はありません。任意の Proof Pack を再実行すればバイト単位で同一の出力が得られ、すべての成果物のハッシュを自分自身で検証できます。CI は、約 25 のスタック形態のファーストパーティフィクスチャに対してツールを証明します。

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。最初のコントリビューションとして良いのは、新しいエコシステム検出器、リスクルール、実世界のレポートフィクスチャです。

## セキュリティ

PatchDrill は、`--run` を渡したときにのみコマンドを実行します。推論された必須コマンドをリポジトリのシェルで実行します。任意コマンドには `--run` と `--run-optional` の両方が必要です。必須チェックが計画されたが実行されなかった場合、PatchDrill は、黙ってパッチを証明済みとして扱うのではなく、それを欠けている検証の証跡として報告します。Markdown、コンパクトなサマリー、HTML ダッシュボード、コンソール出力は、計画された各コマンドを passed、failed、timed out、not run、または skipped optional とラベル付けします。`patchdrill init` は、`run: "true"` とコマンドごとのタイムアウトを備えた CI ワークフローを書き出すため、プルリクエストはデフォルトでコマンドの証跡を生成します。信頼できないリポジトリをスキャンする際は、まず検証計画を確認してください。[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MIT
