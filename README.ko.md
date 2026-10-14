# PatchDrill

[English](README.md) · **한국어** · [日本語](README.ja.md) · [中文](README.zh.md)

[![CI](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml/badge.svg)](https://github.com/seungdori/patchdrill/actions/workflows/ci.yml)
![deterministic](https://img.shields.io/badge/deterministic-yes-2ea44f)
![runs offline](https://img.shields.io/badge/runs-offline-2ea44f)
![no model call](https://img.shields.io/badge/no%20model%20call-%E2%9C%93-2ea44f)
![no telemetry](https://img.shields.io/badge/no%20telemetry-%E2%9C%93-2ea44f)
![read-only by default](https://img.shields.io/badge/read--only-by%20default-2ea44f)
![license MIT](https://img.shields.io/badge/license-MIT-blue)

## AI 리뷰어는 LGTM이라고 합니다. CI도 초록불입니다. 그래도 이 PR은 머지하면 안 됩니다.

PatchDrill은 AI가 만든 패치든 사람이 쓴 패치든, **코드 리뷰와 CI 사이를 메우는 결정론적 증명 계층(deterministic proof layer)입니다.** git diff를 읽고 머지 전에 어떤 증거가 있어야 하는지 정확히 짚어 줍니다 — **모델 호출도 네트워크도 없이, 매번 같은 답을 냅니다.**

**린터도, SAST도, AI 리뷰어도 아닙니다.** 그 도구들이 결코 묻지 않는 단 하나의 질문에 답합니다. *이 diff는 머지 전에 어떤 증거가 있어야 하는가 — 그리고 무엇이 빠졌는가?*

[![위험한 AI 에이전트 PR에 대한 PatchDrill Proof Pack — FAIL, 위험도 94/100](docs/media/patchdrill-demo.gif)](docs/media/patchdrill-dashboard.png)

*AI 에이전트가 올린 PR입니다. PatchDrill은 이를 **FAIL · 94/100**으로 매겼습니다 — 권한이 과한 `pull_request_target` 워크플로 체크아웃, 유출된 시크릿, 꺼버린 테스트 스크립트를 오프라인 결정론적 명령 하나로 잡아냈습니다. 모델 호출 없음. (전체 리포트 스크린샷은 클릭하세요. GIF는 `vhs demo/patchdrill.tape`로 다시 만들 수 있습니다.)*

**diff에서 잡아내는 것:**

- **유출된 시크릿** — 패치에 추가된 `.env` 파일, 개인 키, 토큰 형태의 문자열
- **프롬프트 인젝션** — 에이전트가 읽게 될 `AGENTS.md`, 이슈 템플릿, 문서에 슬쩍 끼워 넣은 지시문
- **워크플로 권한 상승** — 광범위한 토큰 쓰기 권한, `pull_request_target`, OIDC 교환, `secrets: inherit`, 버전 고정 안 한 액션, 원격 스크립트 파이프
- **빠진 증거** — 소스는 바뀌었는데 테스트는 그대로. 필수 체크가 계획만 되고 실행은 안 됨
- **의존성 드리프트** — 매니페스트는 바뀌었는데 짝이 되는 락파일이 없음(반대로 매니페스트 의도 없이 움직인 락파일도)
- **이 diff에 필요한 검증** — 루트 수준 기본값만이 아니라, *변경된* 패키지와 거기에 의존하는 다운스트림 패키지까지 약 25개 생태계 전반의 실제 명령

> **AI와 에이전트가 만든 PR이 일일이 눈으로 보기엔 너무 빨리 쏟아지는 팀을 위해 만들었습니다.** 로컬에서 30초면 됩니다 — 설정도, CI 변경도, API 키도 필요 없습니다:
>
> ```bash
> npx --yes patchdrill demo --scenario risky-agent-pr
> ```

출력물은 어디서나 가져가 들여다볼 수 있는 **Proof Pack(증거 묶음)입니다** — Markdown, JSON, SARIF, 자체 완결형 HTML 대시보드, 해시가 찍힌 증거 매니페스트로 구성됩니다. 사람도, CI 게이트도, 감사자도, 프런티어 모델도 모두 확인할 수 있습니다. `--locale ko|ja|zh`로 원하는 언어로 실행하세요.

## 30초 데모

git 저장소 없이도 위험한 AI 에이전트 PR 시나리오를 만들어 봅니다:

```bash
npx --yes patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

그런 다음 리뷰어용 산출물을 열어 보세요:

```bash
cat patchdrill-risky-demo/patchdrill-demo-summary.md
open patchdrill-risky-demo/patchdrill-demo.html
```

권한이 과한 워크플로 경계, 시크릿처럼 보이는 내용, 패키지 라이프사이클 스크립트 위험, 그리고 머지 전에 리뷰어가 요구해야 할 검증 계획을 보여줍니다.

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

## PatchDrill을 쓰는 이유

- 또 다른 모델을 최종 판단자로 믿지 않고도 AI가 쓴 PR을 리뷰할 수 있게 합니다.
- 패치마다 Proof Pack을 만듭니다: 사람용 Markdown, 구조화된 필수 검증 상태를 담은 봇용 JSON, GitHub 코드 스캐닝용 SARIF, 자체 완결형 HTML 대시보드, 간결한 PR 요약, 그리고 리포트·산출물·명령 출력 해시를 담아 나중에 검증할 수 있는 감사 매니페스트.
- 같은 결정론적 증거 엔진을 로컬 MCP 서버로 노출합니다. AI 코딩 도구가 `patchdrill_scan`을 호출하고, 스키마/문서 리소스와 프롬프트 템플릿을 사용할 수 있지만 PatchDrill 자체가 확률적 도구가 되지는 않습니다.
- 먼저 로컬에서 쓰고, 나중에 CI에서 씁니다. `scan`은 저장소를 절대 건드리지 않으며, 명령은 `--run`을 줄 때만 실행됩니다.
- 회귀가 자주 새어 나가는 곳을 짚어냅니다: 인증, 결제, 마이그레이션, 시크릿, CI 워크플로 공급망, 패키지 자동화 스크립트, 인프라, 락파일, 대규모 diff, 프롬프트 인젝션 내용, 빠진 테스트 변경, 계획만 되고 실행 안 된 필수 체크.
- 루트 수준 기본값으로 때우지 않고, 패치 자체에서 실행할 명령을 추론합니다.
- 이미 쓰고 있는 도구와 그대로 맞물립니다: git, npm, pnpm, yarn, bun, pytest, Django, FastAPI, cargo, Go, Maven, Gradle, Spring Boot, Android Gradle, Ruby, Rails, RSpec, PHP, Composer, Laravel, dotnet, ASP.NET Core, Swift, Xcode, Terraform, Docker, Kubernetes, Helm, Bazel, Buck2.
- `.patchdrill.yml`로 정책을 코드화(policy-as-code)하며, default, regulated, agentic 스타터 팩을 제공합니다.
- 탄탄한 오픈소스 보안 태세를 갖추고 나옵니다: CodeQL, OpenSSF Scorecard, Dependabot, 엄격한 테스트, 패키지 드라이런 검증.
- Node, Cargo, Go, Pants 워크스페이스는 물론 중첩된 Python 프로젝트, 중첩된 Cargo·Go 워크스페이스, Turborepo, Nx까지 이해합니다. 그래서 루트 명령으로 뭉뚱그리지 않고 실제로 바뀐 패키지와 거기에 의존하는 다운스트림 패키지를 겨냥합니다.
- Node/Turborepo, Next.js, Python, uv로 관리하는 Python, Django, FastAPI, Rails, PHP/Composer, Terraform, Docker/Compose, Kubernetes/Helm/Kustomize, Java/Maven/Gradle, Spring Boot Maven/Gradle, Android Gradle, .NET, ASP.NET Core, SwiftPM, Xcode, Bazel, Buck2, Pants, Cargo, Go 저장소 형태에 대한 자체(first-party) 스택 픽스처를 갖췄습니다.
- 의존성 매니페스트와 락파일 변경을 "락파일이 바뀜"이라고만 하지 않습니다. package.json, go.mod, Cargo.toml, pyproject.toml 등 십수 가지 형식에서 무엇이 추가·제거·버전 변경됐는지 구체적으로 설명합니다. (전체 파일 목록은 [의존성 리뷰](#의존성-리뷰)를 참고하세요.)
- 매니페스트만 바뀐 의존성 변경이나 락파일만 움직인 해소 드리프트 같은 의존성 증거 공백을 표시합니다.
- 바뀐 파일에 CODEOWNERS 소유자 힌트를 붙여 리뷰어가 책임 팀을 바로 알 수 있게 합니다.
- 출시용으로 다듬은 사례 연구, 공개 스택 커버리지 매트릭스, 명령별 검증 상태를 담아, PatchDrill이 실제로 어떤 증거를 내놓는지 팀이 직접 따져 볼 수 있게 합니다.

## 무엇을 하는가

PatchDrill은 모든 리뷰어가 묻는 네 가지 질문에 답합니다:

1. 무엇이 바뀌었는가?
2. 스택의 어느 부분이 영향을 받는가?
3. 이 패치를 증명하려면 무엇을 실행해야 하는가?
4. 검증 드릴을 거치고 나서 어떤 위험이 남는가?

PatchDrill은 또 다른 AI 코드 리뷰어가 아닙니다. diff가 "괜찮아 보이는지" 모델에게 묻지 않습니다. 대신 결정론적 증거를 만듭니다:

| 계층 | 핵심 질문 | 결정론적인가? | 명령을 실행하는가? | 출력 |
| --- | --- | --- | --- | --- |
| AI PR 리뷰어 | 이 diff가 괜찮아 보이는가? | 아니오 | 보통 아니오 | 코멘트, 제안, 설계 피드백 |
| 전통적 CI | 미리 정해 둔 체크가 통과했는가? | 예 | 예 | 로그와 통과/실패 상태 |
| SAST/SCA 스캐너 | 알려진 보안·의존성 규칙에 걸리는가? | 예 | 경우에 따라 | 경고와 취약점 발견 |
| 리뷰 자동화 | 설정해 둔 리뷰 자동화가 돌았는가? | 예 | 경우에 따라 | PR 코멘트와 주석 |
| PatchDrill | 이 diff에 어떤 증거가 있어야 하는가? | 예 | `--run` 줄 때만 | Proof Pack, 위험 발견, 명령 계획, 정책 게이트 |

이 경계는 일부러 그어 둔 것입니다. 모델은 판단을 잘하고, PatchDrill은 같은 패치에서 매번 똑같은, 리뷰할 수 있는 안전성 증거를 뽑아내는 데 능합니다. PatchDrill을 먼저 돌린 다음, 그 Proof Pack을 사람 리뷰어든 CI 게이트든 감사 추적이든 프런티어 모델이든 원하는 곳에 넘기세요.

## MCP 서버

PatchDrill은 에이전트형 코딩 도구를 위한 로컬 MCP 서버로도 실행할 수 있습니다:

```bash
patchdrill mcp --workspace-root /path/to/repository
```

MCP 서버는 읽기 전용 스캔, 명시적 Proof Pack 생성, 증거 검증, 출시 점검, 스키마, 문서, 리뷰 프롬프트를 노출합니다. 결정론적 경계는 그대로입니다: 모델 호출 없음, 기본 네트워크 호출 없음, 그리고 클라이언트가 `patchdrill_run_verification`을 `allowCommandExecution: true`와 함께 호출하지 않는 한 저장소 명령 실행 없음.

도구 계약, 리소스, 프롬프트, 클라이언트 설정은 [docs/MCP.md](docs/MCP.md)를 참고하세요.

## Proof Pack

Proof Pack은 패치마다 만들어지는, 어디서나 공유할 수 있는 증거 묶음입니다:

- PR 코멘트와 스텝 요약용 간결한 Markdown 요약.
- 사람이 읽을 전체 Markdown 리포트.
- 봇, 대시보드, 정책 게이트용 JSON 리포트.
- GitHub 코드 스캐닝용 SARIF 리포트.
- 추이 이력을 선택적으로 담는 자체 완결형 HTML 대시보드.
- 리포트·산출물·명령 출력 다이제스트를 기록하는 증거 매니페스트.

매니페스트 검증은 [docs/EVIDENCE.md](docs/EVIDENCE.md)를, 리뷰 워크플로에서 Proof Pack을 쓰는 방법은 [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md)를 참고하세요.

CLI에서 경계와 권장 첫 명령을 확인하세요:

```bash
patchdrill explain
```

요약 예시:

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

## 설치

설치 없이 바로 실행하세요 — [npm](https://www.npmjs.com/package/patchdrill)에 올라가 있습니다:

```bash
npx --yes patchdrill scan --base origin/main
```

또는 전역으로 설치하세요:

```bash
npm install -g patchdrill
patchdrill scan --base origin/main
```

아직 출시 전인 최신 빌드를 소스에서 바로 돌리려면 `github:` 접두사를 쓰세요:

```bash
npx --yes github:seungdori/patchdrill scan --base origin/main
```

아래 예시는 읽기 편하도록 `patchdrill`로 적습니다.

## 빠른 시작

git 저장소 없이 출력물부터 확인해 보세요:

```bash
patchdrill demo --output patchdrill-demo
```

PatchDrill이 에이전트가 작성한 PR에서 무엇을 잡아내는지 보여주는 실패 사례를 시도해 보세요:

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
```

CI를 손대기 전에 PatchDrill이 저장소에서 무엇을 추론하는지 진단하세요:

```bash
patchdrill doctor
```

자동화용:

```bash
patchdrill doctor --format json
```

커밋되지 않은 작업을 분석하세요:

```bash
patchdrill scan
```

브랜치를 `main`과 비교해 분석하세요:

```bash
patchdrill scan --base origin/main
```

추론된 필수 명령을 실행하세요:

```bash
patchdrill scan --base origin/main --run
```

브라우저/e2e 및 정적 분석 계획 같은 선택적 체크를 포함하세요:

```bash
patchdrill scan --base origin/main --run --run-optional
```

Proof Pack을 작성하고 검증하세요:

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

저장된 JSON 리포트로부터 정적 대시보드를 생성하세요:

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

`patchdrill dashboard`는 렌더링 전에 저장된 JSON 리포트 계약을 하나씩 검증합니다. 그래서 오래됐거나 불완전한 리포트가 그럴듯한 대시보드로 둔갑하지 않습니다.

증거 매니페스트를 생성된 산출물과 대조하여 검증하세요:

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

이 저장소가 npm/GitHub Action 출시 준비를 마쳤는지 확인하세요:

```bash
patchdrill release-check
patchdrill release-check --format json
```

출시 워크플로는 필수 PatchDrill 검증도 함께 돌리고, 로컬 Proof Pack 스모크 번들을 만든 뒤 `npm pack --dry-run` 전에 그 증거 매니페스트를 검증합니다.

최종 산출물 후처리를 마친 다음 증거 매니페스트를 다시 만드세요:

```bash
patchdrill evidence --json patchdrill-report.json --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

`patchdrill evidence`는 매니페스트를 쓰기 전에, 필수 구조화 검증 상태까지 들어 있는 저장된 JSON 리포트 계약을 먼저 검증합니다.

코딩 에이전트용 로컬 MCP 서버로 실행하세요:

```bash
patchdrill mcp --workspace-root /path/to/repository
```

MCP 서버는 `patchdrill_scan`, `patchdrill_proof_pack`, `patchdrill_run_verification`, `patchdrill_doctor`, `patchdrill_verify_evidence`, `patchdrill_release_check`를 노출합니다. [docs/MCP.md](docs/MCP.md)를 참고하세요.

커밋된 데모 출력물은 [examples/demo](examples/demo)에서 확인하세요. PR 코멘트 미리보기용으로 `patchdrill-demo-summary.md`도 들어 있습니다.

출시 사례 연구는 [docs/CASE_STUDIES.md](docs/CASE_STUDIES.md)에서, 픽스처로 뒷받침하는 지원 매트릭스는 [docs/STACK_COVERAGE.md](docs/STACK_COVERAGE.md)에서 읽어 보세요.

실행 추이를 보려면 JSON 리포트를 오래된 것부터 최신 순으로 이어서 추가하세요:

```bash
patchdrill dashboard --json previous-report.json --json patchdrill-report.json --output patchdrill-dashboard.html
```

PR 코멘트와 함께 GitHub Action을 사용하세요:

```yaml
- uses: seungdori/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    pr-comment: "true"
```

이 Action은 기본으로 GitHub Checks 주석을 내보냅니다. [docs/ANNOTATIONS.md](docs/ANNOTATIONS.md)를 참고하세요.

정책을 코드로 적용하세요:

```bash
patchdrill scan --config .patchdrill.yml
```

에디터와 봇용 JSON Schema를 내보내세요:

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
patchdrill schema evidence > patchdrill-evidence.schema.json
patchdrill schema doctor > patchdrill-doctor.schema.json
patchdrill schema release-check > patchdrill-release-check.schema.json
```

이전 리포트와 비교하세요:

```bash
patchdrill scan --baseline previous-patchdrill-report.json --max-risk-delta 0 --json patchdrill-report.json
```

GitHub Actions 워크플로를 추가하세요:

```bash
patchdrill init
```

워크플로와 스타터 정책을 추가하세요:

```bash
patchdrill init --policy
```

더 엄격한 스타터 정책 팩을 사용하세요:

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
patchdrill mcp [--transport stdio] [--workspace-root <path>]
patchdrill explain
patchdrill release-check [--format text|json]
patchdrill schema [policy|report|evidence|doctor|release-check] [--output <path>]
patchdrill verify --evidence <patchdrill-evidence.json>
```

옵션:

| 옵션 | 설명 |
| --- | --- |
| `--base <ref>` | 베이스 ref와 비교합니다. 예: `origin/main`. |
| `--head <ref>` | `--base` 사용 시의 헤드 ref. 기본값 `HEAD`. |
| `--config <path>` | `.patchdrill.yml/json` 또는 특정 경로에서 정책을 읽습니다. |
| `--baseline <path>` | 이전 PatchDrill JSON 리포트와 비교합니다. |
| `--evidence <path>` | `scan`/`evidence` 중에 Proof Pack 증거 매니페스트를 쓰거나, `verify`로 검증할 매니페스트를 고릅니다. `scan --evidence`는 매니페스트가 리포트 계약을 검증할 수 있도록 `--json`이 있어야 합니다. |
| `--run` | 추론된 필수 검증 명령을 실행합니다. |
| `--run-optional` | `--run`과 함께 쓰면 선택적 검증 명령도 실행합니다. |
| `--github-annotations` | 발견 사항을 GitHub Actions 로그 주석으로 내보냅니다. |
| `--summary-markdown <path>` | PR 코멘트나 스텝 요약용 간결한 Markdown 요약을 씁니다. |
| `--markdown <path>` | Markdown 리포트를 씁니다. |
| `--json <path>` | JSON 리포트를 씁니다. |
| `--sarif <path>` | GitHub 코드 스캐닝용 SARIF 리포트를 씁니다. |
| `--html <path>` | 자체 완결형 정적 HTML 대시보드를 씁니다. |
| `--fail-on <level>` | 발견 사항이 해당 심각도에 이르면 실패 처리합니다: `info`, `low`, `medium`, `high`, `critical`. |
| `--max-risk <score>` | 위험 점수가 0-100 임계값을 넘으면 실패 처리합니다. 기본값 `69`. |
| `--max-risk-delta <score>` | 베이스라인 대비 위험 증가가 0-100 임계값을 넘으면 실패 처리합니다. `--baseline`이 있어야 합니다. |
| `--max-output-chars <n>` | 각 명령 출력 스트림에서 마지막 `n`개 문자만 남깁니다. 기본값 `20000`. |
| `--command-timeout-ms <n>` | 각 검증 명령을 `n` 밀리초 뒤에 중단합니다. |
| `--quiet` | 종료 코드만 씁니다. |
| `--locale <lang>` | 사람이 읽는 리포트(markdown, summary, HTML, 콘솔)의 언어: `en`, `ko`, `ja`, `zh`. 시스템 로캘(`LC_ALL`/`LANG`)을, 없으면 영어를 기본으로 씁니다. JSON과 SARIF는 영어로 유지합니다. |
| `--transport <name>` | `patchdrill mcp`용 MCP 전송 방식입니다. 현재는 `stdio`. |
| `--workspace-root <path>` | `patchdrill mcp`의 작업 루트입니다. 기본값은 현재 디렉터리입니다. |
| `--policy` | `patchdrill init`과 함께 쓰면 `.patchdrill.yml`을 만듭니다. |
| `--policy-pack <name>` | `patchdrill init`용 스타터 정책 팩: `default`, `regulated`, `agentic`. |
| `--scenario <name>` | `patchdrill demo`용 데모 시나리오: `review-ready`, `risky-agent-pr`. |
| `--format <format>` | `doctor`와 `release-check`의 출력 형식: `text`, `json`. |
| `--list` | `patchdrill schema`와 함께 쓰면 사용 가능한 스키마를 나열합니다. |
| `--output <path>` | 스키마/대시보드 파일이나 데모 산출물 디렉터리를 씁니다. |

불리언 플래그는 `--run=false`, `--quiet=true`, `--github-annotations=off`처럼 값을 명시해 줄 수 있습니다.

## 지원 시그널

PatchDrill은 저장소 매니페스트를 보고 프로젝트 형태를 알아냅니다:

| 생태계 | 시그널 | 대표 명령 |
| --- | --- | --- |
| Node | `package.json`, 락파일, 스크립트 | `npm run typecheck`, `npm run check:types`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run build`, optional `npm run test:e2e` |
| Python | `pyproject.toml`, `uv.lock`, `requirements.txt`, `setup.py`, `manage.py`, 중첩된 Python 패키지 루트, `FastAPI()`, FastAPI 라우터/의존성, Ruff/mypy/Pyright 설정 | `uv run pytest tests/test_module.py`, `cd packages/api && uv run pytest`, `python -m pytest`, `python manage.py test`, `python -m compileall .`, optional `uv run ruff check .`, optional `uv run mypy .`, optional `uv run pyright`, FastAPI app and changed-module import smoke |
| Rust | `Cargo.toml`, 루트 및 중첩 Cargo 워크스페이스 | `cargo test --all-targets`, `cargo test -p crate --all-targets`, `cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`, `cargo clippy -p crate --all-targets -- -D warnings` |
| Go | `go.mod`, `go.work`, 중첩된 Go 모듈 및 워크스페이스 루트 | `go test ./...`, `cd services/api && go test ./...`, `go test ./module/...`, `cd services/go && go test ./module/...`, `go vet ./module/...` |
| Java/Kotlin | `pom.xml`, `build.gradle`, 래퍼 | `mvn test`, `gradle test`, `./gradlew test`, `./gradlew bootJar` |
| Android | `com.android.application`, `com.android.library`, `AndroidManifest.xml`, 빌드 타입, 프로덕트 플레이버, `variantFilter`, 배리언트 소스 세트, 생성된 소스 경로 | `./gradlew testDebugUnitTest`, `./gradlew testReleaseUnitTest`, `./gradlew testFreeDebugUnitTest`, `./gradlew testMinApi24DemoDebugUnitTest`, `./gradlew assemble<Variant>`, `./gradlew lint<Variant>` |
| Ruby/Rails | `Gemfile`, `Gemfile.lock`, `config/application.rb`, RSpec 메타데이터 | `bin/rails test`, `bundle exec rails test`, `bundle exec rspec`, `bundle exec rake test` |
| PHP/Laravel | `composer.json`, `composer.lock`, `artisan`, `phpunit.xml` | `composer validate --strict`, `composer test`, `php artisan test`, `vendor/bin/phpunit`, PHP syntax lint fallback |
| .NET | `global.json`, `.slnf`, `.sln`, `.csproj`, `ProjectReference` | `dotnet test App.slnf`, `dotnet test tests/Api.Tests/Api.Tests.csproj`, `dotnet build src/Api/Api.csproj --no-restore`, `dotnet publish src/Api/Api.csproj --no-restore` |
| Swift | `Package.swift`, `Package.resolved`, `*.swift` | `swift test`, `swift build` |
| Xcode | `.xcworkspace`, `.xcodeproj`, 공유 `.xcscheme`, `.xctestplan`, Apple 앱 소스/리소스, 스킴 타깃 플랫폼 | `xcodebuild -workspace App.xcworkspace -scheme App -testPlan AppTests test`, `xcodebuild -project App.xcodeproj -scheme App -destination generic/platform=iOS build`, `xcodebuild -project App.xcodeproj -scheme App -showdestinations` |
| Terraform | `*.tf`, `*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`, Compose 파일 | `docker build .`, `docker compose -f compose.yaml config` |
| Kubernetes | `Chart.yaml`, `kustomization.yaml`, `k8s/`, `kubernetes/`, `manifests/` | `helm lint .`, `kubectl kustomize .`, `kubectl apply --dry-run=client -f k8s` |
| Bazel | `MODULE.bazel`, `WORKSPACE`, `BUILD.bazel`, `.bazelrc` | `bazel test //path/...`, `bazel build //path/...`, `bazel query 'rdeps(//..., set(//path/...))'`, optional downstream `tests(rdeps(...))` promotion, graph-wide fallback for root metadata |
| Buck2 | `.buckconfig`, `BUCK`, `BUCK.v2` | `buck2 test //path/...`, `buck2 build //path/...`, `buck2 uquery 'rdeps(//..., set(//path/...))'`, optional downstream `testsof(rdeps(...))` promotion, graph-wide fallback for root metadata |
| Pants | `pants.toml` | `pants --changed-since=HEAD --changed-dependents=transitive test` |
| GitHub Actions | `.github/workflows/*` | workflow diff review |

Node 워크스페이스에서는 `package.json` 워크스페이스와 `pnpm-workspace.yaml`을 감지한 다음, 직접 바뀐 패키지와 거기에 의존하는 다운스트림 패키지를 겨냥해 `pnpm --filter @acme/api run test`나 `npm --workspace @acme/api run build` 같은 패키지 단위 명령을 내보냅니다. `turbo.json`이나 `nx.json`이 있으면 `pnpm exec turbo run test --filter=@acme/api`나 `npx nx run api:test` 같은 네이티브 태스크 러너 명령을 짭니다. [docs/MONOREPOS.md](docs/MONOREPOS.md)를 참고하세요.

중첩된 Python 프로젝트에서는 발견한 `pyproject.toml`, `uv.lock`, `requirements.txt`, `manage.py` 패키지 루트를 저마다 별도의 검증 범위로 다룹니다. 덕분에 모노레포의 모든 Python 변경을 루트 명령 하나로 뭉뚱그리지 않고 `cd packages/pine-engine && uv run pytest`를 계획할 수 있습니다.

Cargo 워크스페이스에서는, JavaScript나 다중 언어 모노레포 루트 아래에 중첩된 워크스페이스까지 포함해, `[workspace].members`, 크레이트 이름, 워크스페이스 내부 의존성을 읽은 다음, 바뀐 크레이트와 거기에 의존하는 다운스트림 크레이트를 겨냥해 `cargo test -p crate --all-targets`나 `cargo test --manifest-path packages/wasm/Cargo.toml -p crate --all-targets`와 함께 선택적 clippy 계획을 내보냅니다.

중첩된 Go 모듈과 Go 워크스페이스에서는 발견한 `go.mod` 또는 `go.work` 루트를 저마다 별도의 검증 범위로 다룹니다. Go 워크스페이스에서는 `go.work`의 `use` 항목, 모듈 이름, 워크스페이스 내부 `require` 의존성을 읽은 다음, 바뀐 모듈과 거기에 의존하는 다운스트림 모듈을 겨냥해 `go test ./module/...`나 `cd services/go && go test ./module/...`와 함께 선택적 `go vet` 계획을 내보냅니다.

Pants 저장소에서는 Pants의 네이티브 Git 인지 변경 타깃 선택을 `--changed-since`와 `--changed-dependents=transitive`로 활용합니다. 그래서 여러 언어에 걸친 타깃 그래프 확장은 계속 Pants가 직접 맡습니다.

## 위험 모델

PatchDrill은 패치를 0에서 100까지로 점수화합니다. 높을수록 위험합니다.

현재 결정론적 규칙이 검사하는 항목은 다음과 같습니다:

- 리뷰와 검증 증거가 필요한 모든 변경 파일.
- `.env`와 개인 키처럼 시크릿을 담은 파일.
- diff 안에 추가된, 시크릿처럼 보이는 값(개인 키와 흔한 토큰 형식 포함).
- `AGENTS.md`, 이슈 템플릿, Markdown 문서처럼 에이전트가 읽는 파일에 끼워 넣은 프롬프트 인젝션 지시문.
- 영향이 큰 경로: 인증, 결제, 세션, 마이그레이션, 보안, 암호, 권한.
- 인프라와 출시 동작: Docker, Terraform, Kubernetes, GitHub Actions.
- 워크플로 공급망 위험: 광범위한 토큰 쓰기 권한, `pull_request_target`, 상속된 시크릿, 로컬 재사용 가능 워크플로가 가변 원격 재사용 가능 워크플로로 갈라지는 경우, 상속된 시크릿이나 호출자 OIDC 권한을 받는 가변 재사용 가능 워크플로, 환경 범위 OIDC 배포 잡, 환경 보호 없는 클라우드 OIDC 자격 증명 교환, 버전 고정 안 한 액션, 가변 `docker://` 액션 이미지, 원격 스크립트 파이프, 신뢰할 수 없는 PR 메타데이터 보간, 권한 과한 PR 헤드 체크아웃 조합.
- 패키지 자동화 스크립트 위험: install/prepare/pack/publish 라이프사이클 스크립트, 제거되거나 무동작(no-op) 명령으로 바뀐 검증 스크립트, 원격 다운로드를 인터프리터로 파이프하는 패키지 스크립트.
- 의존성 매니페스트와 락파일 변경.
- package.json, pyproject.toml, requirements.txt, NuGet PackageReference 및 중앙 PackageVersion 파일, Maven pom.xml, Gradle 빌드 파일과 버전 카탈로그, Gemfile, composer.json, go.mod, Cargo.toml, npm package-lock, pnpm-lock, yarn.lock, bun.lock, go.sum, Cargo.lock, poetry.lock, uv.lock, Pipfile.lock, Gemfile.lock, composer.lock의 의존성 추가·제거·업데이트.
- 의존성 증거 공백: 짝이 되는 락파일 증거가 없는 직접 의존성 매니페스트 변경, 짝이 되는 매니페스트 의존성 의도가 없는 락파일 해소 변경.
- 텍스트 `bun.lock` 형식으로 옮기라는 안내와 함께 표시하는 레거시 바이너리 `bun.lockb` 변경.
- 근처에 있거나, 미러 경로에 대응되거나, 프레임워크 관례에 맞는 테스트 변경 없이 이뤄진 소스 변경.
- 큰 라인 델타와 바이너리 파일.
- 추론하거나 설정해 뒀지만 실행하지 않은 필수 검증 명령.
- 실패한 검증 명령.
- `.patchdrill.yml`의 커스텀 정책 규칙.

위험 모델은 일부러 '왜 그 점수인지' 알 수 있게 설계했습니다. 점수를 올린 요인은 모두 리포트에 발견 사항으로 남습니다.

내장 규칙 ID와 각 규칙의 의미는 [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md)를 참고하세요.

## 정책 코드화(Policy-As-Code)

PatchDrill은 저장소 루트에서 `.patchdrill.yml`, `.patchdrill.yaml`, 또는 `.patchdrill.json`을 읽습니다.

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

[docs/POLICY.md](docs/POLICY.md)를 참고하세요.

## GitHub Actions

워크플로를 생성하세요:

```bash
patchdrill init
```

또는 수동으로 추가하세요:

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

Action의 불리언 입력에는 값을 명시해 줄 수 있습니다: `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`, `"on"`, `"off"`. 실행·주석 토글도 같은 CLI 불리언 파서를 거치므로, `run: "false"`면 저장소 명령이 절대 실행되지 않습니다.

## 예시 리포트

[examples/report.md](examples/report.md)를 참고하세요.
Proof Pack 리뷰 워크플로는 [docs/PROOF_PACKS.md](docs/PROOF_PACKS.md)를 참고하세요.
코드 스캐닝 통합은 [docs/SARIF.md](docs/SARIF.md)를 참고하세요.
저장소 보안 태세는 [docs/SECURITY_POSTURE.md](docs/SECURITY_POSTURE.md)를 참고하세요.
풀 리퀘스트 코멘트는 [docs/PR_COMMENTS.md](docs/PR_COMMENTS.md)를 참고하세요.
정적 HTML 대시보드는 [docs/DASHBOARD.md](docs/DASHBOARD.md)를 참고하세요.
증거 매니페스트 검증은 [docs/EVIDENCE.md](docs/EVIDENCE.md)를 참고하세요.
기계 판독 가능 스키마는 [docs/SCHEMAS.md](docs/SCHEMAS.md)를 참고하세요.
소유자 힌트는 [docs/CODEOWNERS.md](docs/CODEOWNERS.md)를 참고하세요.
위험 델타는 [docs/BASELINES.md](docs/BASELINES.md)를 참고하세요.
내장 위험 규칙은 [docs/RULE_CATALOG.md](docs/RULE_CATALOG.md)를 참고하세요.

## 출시 출처 증명(Release Provenance)

PatchDrill에는 npm 신뢰 게시(trusted publishing)와 출처 증명을 위한 출시 워크플로가 들어 있습니다. npm에서 패키지를 신뢰 게시자로 설정한 다음, GitHub Release에서 게시하세요. [docs/RELEASE.md](docs/RELEASE.md)를 참고하세요.

게시하기 전에 실행하세요:

```bash
patchdrill release-check
```

## 의존성 리뷰

PatchDrill은 변경된 `package.json`, `pyproject.toml`, `requirements.txt`, NuGet `PackageReference` / `PackageVersion` 매니페스트, Maven `pom.xml`, Gradle `build.gradle` / `build.gradle.kts` / `libs.versions.toml`, `Gemfile`, `composer.json`, `go.mod`, `Cargo.toml`, npm `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `go.sum`, `Cargo.lock`, `poetry.lock`, `uv.lock`, `Pipfile.lock`, `Gemfile.lock`, `composer.lock` 파일에서 의존성 변경을 요약합니다. 패키지, 의존성 섹션이나 락파일 경로, 변경 유형, 이전 버전, 새 버전을 Markdown과 JSON 리포트에 나열합니다. 짝이 되는 락파일 증거가 없는 직접 매니페스트 변경, 매니페스트 의도 없이 움직인 락파일 해소 드리프트 같은 의존성 증거 공백도 표시합니다. 이렇게 리뷰어 눈에 보이는 의존성 의도를 드러내 더 무거운 SCA 도구를 보완합니다.

## 패키지 스크립트 리뷰

PatchDrill은 `package.json` 스크립트의 추가·제거·업데이트도 Markdown, JSON, HTML 리포트에 요약합니다. 위험 발견 사항으로는 install/prepare/pack/publish 라이프사이클 훅, 무동작(no-op) 검증 스크립트, 제거된 test/lint/build 스크립트, 원격 다운로드를 인터프리터로 파이프하는 패키지 스크립트를 짚어냅니다.

## 설계 원칙

- 결정론 우선. 쓸 만한 답을 얻는 데 모델 호출이 필요 없습니다. 같은 diff면 발견 사항, 위험 점수, 명령 계획이 그대로 재현됩니다. 일부러 값이 달라지는 필드는 리포트의 `generatedAt` 타임스탬프뿐인데, 이마저 `SOURCE_DATE_EPOCH`를 따르므로 캐싱·스냅샷·재현 가능한 감사를 위해 리포트를 바이트 단위로 똑같이 만들 수 있습니다.
- 분위기(vibes)보다 Proof Pack. 리뷰어는 정확한 명령, 발견 사항, 산출물, 다이제스트를 봐야 합니다.
- 기본은 로컬. 소스 코드는 체크아웃을 벗어나지 않습니다.
- 보수적 점수화. 위험한 패치를 조용히 통과시키느니 차라리 증거를 요구합니다.
- 나중에 확장 가능. 규칙 엔진은 기여자가 생태계와 정책을 덧붙일 수 있을 만큼 작습니다.
- 믿을 수 있는 배포. CI가 빌드, 테스트, SARIF 생성, npm 패키지 내용을 검증합니다.

## 로드맵

- 흔한 오픈소스 스택을 더 폭넓게 덮는 자체 픽스처 커버리지.
- Turborepo, Nx, Pants, Cargo, Go, Bazel, Buck 워크스페이스를 넘어서는 네이티브 영향 태스크 통합 확대.
- 추론된 검증 명령을 대화식으로 받아들이거나 거부하는 로컬 TUI.
- 결정론적 발견 사항을 절대 대체하지 않는 선택적 LLM 요약 모드.

## FAQ

**이건 AI 도구인가요?** 아니요. PatchDrill은 **모델 호출이 전혀 없고**, API 키도 필요 없으며, 완전히 오프라인으로 동작합니다. 같은 diff를 넣으면 바이트 단위로 똑같은 Proof Pack이 나옵니다(`SOURCE_DATE_EPOCH`를 따릅니다). 이제 AI가 코드를 짜기 *때문에* 존재하는 결정론적 계층이지, 또 다른 AI가 아닙니다.

**그냥 린터나 SAST 아닌가요?** 아니요. 린터는 코드를 고정된 규칙과 대조하고, SAST는 알려진 취약점 패턴을 매칭합니다. PatchDrill은 *바로 이 diff*에 어떤 검증이 필요한지 추론하고, 있*어야* 하지만 없는 증거(계획만 되고 실행 안 된 필수 체크 포함)를 보고합니다. 어떤 린터나 SAST도 그 공백은 추적하지 않습니다.

**또 추가해야 하는 CI 게이트인가요?** 꼭 그렇진 않습니다. 설정 없이 로컬에서 30초면 됩니다(`npx --yes patchdrill demo`). 기존 리뷰와 CI가 diff마다 각각 무엇을 챙겨야 하는지 짚어 줍니다. `scan`은 저장소를 절대 건드리지 않고, 명령은 `--run`이 있을 때만 실행됩니다.

**외부로 정보를 보내나요?** 네트워크 호출도, 텔레메트리도, 계정도 없습니다. 소스는 절대 체크아웃을 떠나지 않습니다.

**왜 신생 프로젝트를 믿어야 하나요?** 메인테이너나 스타 수에 기댈 필요 없습니다 — 어떤 Proof Pack이든 다시 돌리면 바이트 단위로 똑같은 출력이 나오고, 모든 산출물 해시를 직접 검증할 수 있습니다. CI는 약 25개 스택 형태에 대한 자체 픽스처로 이 도구를 입증합니다.

## 기여하기

[CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 보세요. 첫 기여로는 새 생태계 감지기, 위험 규칙, 실제 리포트 픽스처가 좋습니다.

## 보안

PatchDrill은 `--run`을 줄 때만 명령을 실행합니다. 추론된 필수 명령을 저장소 셸에서 돌리며, 선택적 명령은 `--run`과 `--run-optional`을 둘 다 줘야 합니다. 필수 체크가 계획만 되고 실행되지 않았으면, 그 패치를 조용히 증명된 것으로 치지 않고 검증 증거 누락으로 보고합니다. Markdown, 간결한 요약, HTML 대시보드, 콘솔 출력은 계획된 명령을 저마다 통과, 실패, 타임아웃, 미실행, 건너뛴 선택 항목으로 표시합니다. `patchdrill init`은 `run: "true"`와 명령별 타임아웃을 갖춘 CI 워크플로를 만들어 주므로, 풀 리퀘스트가 기본으로 명령 증거를 남깁니다. 신뢰할 수 없는 저장소를 스캔할 때는 검증 계획부터 살펴보세요. [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스

MIT
