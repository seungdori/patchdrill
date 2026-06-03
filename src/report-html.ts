import { t, type Locale } from "./i18n.js";
import type { PatchReport } from "./types.js";
import type { VerificationStatus } from "./types.js";
import { formatVerificationStatus, verificationExecutions, verificationSummary, type VerificationExecution } from "./verification.js";

export interface HtmlOptions {
  history?: PatchReport[];
  locale?: Locale;
}

export function renderHtml(report: PatchReport, options: HtmlOptions = {}): string {
  const locale = options.locale ?? "en";
  const tr = (text: string): string => t(locale, text);
  const summary = report.summary;
  const statusLabel = tr(summary.status.toUpperCase());
  const statusTone = htmlStatusTone(summary.status);
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  const verification = verificationSummary(report);
  const runTrend = htmlRunTrend(options.history, locale);
  const commandResultsHtml = htmlCommandResults(report, locale);
  const context = [
    report.base ? `Base: ${report.base}` : undefined,
    report.head ? `Head: ${report.head}` : undefined,
    `Generated: ${report.generatedAt}`,
    `Schema: ${report.schemaVersion}`
  ].filter((item): item is string => item !== undefined);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>PatchDrill Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #15181e;
      --muted: #5c6470;
      --border: #d9dee7;
      --code-bg: #f0f3f7;
      --pass: #0b6b43;
      --pass-bg: #e5f5ed;
      --warn: #9a5b00;
      --warn-bg: #fff0d6;
      --fail: #a12828;
      --fail-bg: #fde7e7;
      --info: #285da1;
      --info-bg: #e7f0fb;
      --shadow: 0 1px 2px rgb(16 24 40 / 8%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }

    main {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    header {
      display: grid;
      gap: 18px;
      margin-bottom: 22px;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 32px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    h2 {
      font-size: 19px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    h3 {
      font-size: 15px;
      line-height: 1.3;
      letter-spacing: 0;
    }

    .eyebrow {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .header-row,
    .section-heading,
    .finding-head,
    summary {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }

    .context {
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      font-size: 13px;
      gap: 8px 16px;
    }

    .grid {
      display: grid;
      gap: 12px;
    }

    .metrics {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .two-column {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric,
    .finding,
    .table-wrap,
    details {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    section {
      display: grid;
      gap: 14px;
      margin-top: 24px;
      padding: 0;
    }

    .metric {
      min-width: 0;
      padding: 14px;
    }

    .metric-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 24px;
      font-weight: 760;
      line-height: 1.2;
      margin-top: 6px;
      overflow-wrap: anywhere;
    }

    .metric-detail {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }

    .bar {
      background: #e7ebf1;
      border-radius: 999px;
      height: 8px;
      margin-top: 10px;
      overflow: hidden;
    }

    .bar span {
      display: block;
      height: 100%;
    }

    .bar .pass {
      background: var(--pass);
    }

    .bar .warn {
      background: var(--warn);
    }

    .bar .fail {
      background: var(--fail);
    }

    .trend-table td,
    .trend-table th {
      white-space: nowrap;
    }

    .trend-risk {
      align-items: center;
      display: grid;
      gap: 8px;
      grid-template-columns: 54px minmax(120px, 1fr);
    }

    .pill {
      border-radius: 999px;
      display: inline-flex;
      font-size: 12px;
      font-weight: 760;
      gap: 6px;
      line-height: 1;
      padding: 7px 9px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .pass {
      background: var(--pass-bg);
      color: var(--pass);
    }

    .warn {
      background: var(--warn-bg);
      color: var(--warn);
    }

    .fail,
    .critical,
    .high {
      background: var(--fail-bg);
      color: var(--fail);
    }

    .medium {
      background: var(--warn-bg);
      color: var(--warn);
    }

    .low,
    .info {
      background: var(--info-bg);
      color: var(--info);
    }

    .muted,
    .empty {
      color: var(--muted);
    }

    .table-wrap {
      overflow-x: auto;
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    table {
      border-collapse: collapse;
      font-size: 13px;
      min-width: 720px;
      width: 100%;
    }

    th,
    td {
      border-bottom: 1px solid var(--border);
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    code,
    pre {
      background: var(--code-bg);
      border-radius: 6px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }

    code {
      padding: 2px 5px;
    }

    pre {
      margin: 10px 0 0;
      max-height: 360px;
      overflow: auto;
      padding: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .finding-list {
      display: grid;
      gap: 10px;
    }

    .finding {
      display: grid;
      gap: 8px;
      padding: 14px;
    }

    .finding-title {
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .detail-list {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .detail-item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }

    .detail-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .detail-value {
      margin-top: 4px;
      overflow-wrap: anywhere;
    }

    details {
      padding: 0;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
      list-style: none;
      padding: 14px;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    .command-body {
      border-top: 1px solid var(--border);
      padding: 0 14px 14px;
    }

    @media (max-width: 900px) {
      .metrics,
      .two-column,
      .detail-list {
        grid-template-columns: 1fr;
      }

      .header-row,
      .section-heading,
      .finding-head,
      summary {
        align-items: flex-start;
        flex-direction: column;
      }

      main {
        width: min(100% - 20px, 1180px);
        padding-top: 20px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="header-row">
        <div>
          <p class="eyebrow">PatchDrill</p>
          <h1>${escapeHtml(tr("Verification Dashboard"))}</h1>
        </div>
        <span class="pill ${statusTone}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="context">${context.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </header>

    <div class="grid metrics">
      ${htmlMetric(tr("Risk score"), `${summary.riskScore}/100`, tr("Higher means more review proof is needed."), htmlScoreBar(summary.riskScore, statusTone))}
      ${htmlMetric(tr("Confidence"), `${summary.confidenceScore}/100`, tr("Higher means stronger verification evidence."), htmlScoreBar(summary.confidenceScore, "pass"))}
      ${htmlMetric(tr("Changed files"), summary.changedFileCount, `+${summary.additions} / -${summary.deletions}`)}
      ${htmlMetric(tr("Required checks"), summary.requiredCommandCount, `${verification.passed} ${tr("passed")}, ${verification.failed} ${tr("failed")}, ${verification.missingRequired} ${tr("missing")}`)}
      ${htmlMetric(tr("Added lines"), report.addedLines, tr("Diff lines scanned for risky content."))}
    </div>

${runTrend}

    <section>
      <div class="section-heading">
        <h2>${escapeHtml(tr("Findings"))}</h2>
        <span class="pill ${statusTone}">${escapeHtml(report.findings.length)} ${escapeHtml(tr("total"))}</span>
      </div>
      ${htmlFindings(report, locale)}
    </section>

    <section>
      <div class="section-heading">
        <h2>${escapeHtml(tr("Verification Plan"))}</h2>
        <span class="pill ${requiredCommands.length > 0 ? "info" : "pass"}">${escapeHtml(requiredCommands.length)} ${escapeHtml(tr("required"))}, ${escapeHtml(optionalCommands.length)} ${escapeHtml(tr("optional"))}</span>
      </div>
      ${htmlVerificationPlan(report, locale)}
    </section>

${commandResultsHtml}

    <section>
      <h2>${escapeHtml(tr("Changed Files"))}</h2>
      ${htmlChangedFiles(report, locale)}
    </section>

    <div class="grid two-column">
      <section>
        <h2>${escapeHtml(tr("Project Signals"))}</h2>
        ${htmlProjectSignals(report, locale)}
      </section>
      <section>
        <h2>${escapeHtml(tr("Review Context"))}</h2>
        ${htmlReviewContext(report, locale)}
      </section>
    </div>

    <section>
      <h2>${escapeHtml(tr("Dependency Changes"))}</h2>
      ${htmlDependencyChanges(report, locale)}
    </section>

    <section>
      <h2>${escapeHtml(tr("Package Script Changes"))}</h2>
      ${htmlPackageScriptChanges(report, locale)}
    </section>

    <section>
      <h2>${escapeHtml(tr("Reviewer Notes"))}</h2>
      <p class="muted">${escapeHtml(tr("Treat this dashboard as triage evidence, not a replacement for review. High-impact areas still need human sign-off even when automated commands pass."))}</p>
    </section>
  </main>
</body>
</html>
`;
}

function htmlRunTrend(history: PatchReport[] | undefined, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  if (!history || history.length <= 1) return "";
  const previous = history[history.length - 2];
  const latest = history[history.length - 1];
  const riskDelta = previous && latest ? latest.summary.riskScore - previous.summary.riskScore : 0;
  const failedDelta = previous && latest ? latest.summary.failedCommandCount - previous.summary.failedCommandCount : 0;
  const deltaTone = riskDelta > 0 || failedDelta > 0 ? "warn" : riskDelta < 0 || failedDelta < 0 ? "pass" : "info";
  const table = htmlTable(
    [tr("Run"), tr("Status"), tr("Risk"), tr("Confidence"), tr("Changed"), tr("Required"), tr("Failed"), tr("Generated"), tr("Base"), tr("Head")],
    history.map((run, index) => [
      escapeHtml(index === history.length - 1 ? `${index + 1} ${tr("latest")}` : `${index + 1}`),
      `<span class="pill ${htmlStatusTone(run.summary.status)}">${escapeHtml(tr(run.summary.status.toUpperCase()))}</span>`,
      `<div class="trend-risk"><span>${escapeHtml(`${run.summary.riskScore}/100`)}</span>${htmlScoreBar(run.summary.riskScore, htmlStatusTone(run.summary.status))}</div>`,
      escapeHtml(`${run.summary.confidenceScore}/100`),
      escapeHtml(`${run.summary.changedFileCount} (+${run.summary.additions}/-${run.summary.deletions})`),
      escapeHtml(run.summary.requiredCommandCount),
      escapeHtml(run.summary.failedCommandCount),
      escapeHtml(run.generatedAt),
      escapeHtml(run.base ?? ""),
      escapeHtml(run.head ?? "")
    ]),
    tr("No historical runs provided.")
  ).replace('class="table-wrap"', 'class="table-wrap trend-table"');

  return `<section>
      <div class="section-heading">
        <h2>${escapeHtml(tr("Run Trend"))}</h2>
        <span class="pill ${deltaTone}">${escapeHtml(tr("risk"))} ${formatDelta(riskDelta)}, ${escapeHtml(tr("failed checks"))} ${formatDelta(failedDelta)}</span>
      </div>
      ${table}
    </section>`;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function htmlMetric(label: string, value: string | number, detail: string, extra = ""): string {
  const extraLine = extra ? `\n        ${extra}` : "";
  return `<div class="metric">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
        <div class="metric-detail">${escapeHtml(detail)}</div>${extraLine}
      </div>`;
}

function htmlScoreBar(score: number, tone: string): string {
  return `<div class="bar" aria-hidden="true"><span class="${escapeHtml(tone)}" style="width: ${clampScore(score)}%;"></span></div>`;
}

function htmlFindings(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  if (report.findings.length === 0) {
    return `<p class="empty">${escapeHtml(tr("No risk findings."))}</p>`;
  }

  return `<div class="finding-list">
        ${report.findings
          .map((finding) => {
            const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : tr("Global");
            const tags = finding.tags && finding.tags.length > 0 ? `${tr("Tags")}: ${finding.tags.join(", ")}` : undefined;
            const remediation = finding.remediation ? `\n          <p class="muted">${escapeHtml(tr("Remediation"))}: ${escapeHtml(tr(finding.remediation))}</p>` : "";
            const rule = finding.ruleId ? `\n          <p class="muted">${escapeHtml(tr("Rule"))}: <code>${escapeHtml(finding.ruleId)}</code></p>` : "";
            const tagLine = tags ? `\n          <p class="muted">${escapeHtml(tags)}</p>` : "";
            return `<article class="finding">
          <div class="finding-head">
            <div>
              <div class="finding-title">${escapeHtml(tr(finding.title))}</div>
              <div class="metric-detail">${escapeHtml(location)}</div>
            </div>
            <span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(tr(finding.severity))}</span>
          </div>
          <p>${escapeHtml(tr(finding.detail))}</p>${remediation}${rule}${tagLine}
        </article>`;
          })
          .join("")}
      </div>`;
}

function htmlVerificationPlan(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return htmlTable(
    [tr("Required"), tr("Package"), tr("Command"), tr("Result"), tr("Reason")],
    verificationExecutions(report).map((execution) => [
      `<span class="pill ${execution.required ? "warn" : "info"}">${execution.required ? tr("yes") : tr("no")}</span>`,
      escapeHtml(execution.packageName ?? execution.packagePath ?? ""),
      `<code>${escapeHtml(execution.command)}</code>`,
      htmlVerificationStatus(execution, locale),
      escapeHtml(tr(execution.reason))
    ]),
    tr("No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests.")
  );
}

function htmlCommandResults(report: PatchReport, locale: Locale): string {
  if (report.commandResults.length === 0) return "";
  const tr = (text: string): string => t(locale, text);

  return `<section>
      <div class="section-heading">
        <h2>${escapeHtml(tr("Command Results"))}</h2>
        <span class="pill ${report.summary.failedCommandCount > 0 ? "fail" : "pass"}">${escapeHtml(report.summary.failedCommandCount)} ${escapeHtml(tr("failed"))}</span>
      </div>
      <div class="grid">
        ${report.commandResults
          .map((result) => {
            const tone = result.exitCode === 0 ? "pass" : "fail";
            const stdout = result.stdout.trim() ? `\n            <h3>stdout</h3><pre>${escapeHtml(result.stdout.trim())}</pre>` : "";
            const stderr = result.stderr.trim() ? `\n            <h3>stderr</h3><pre>${escapeHtml(result.stderr.trim())}</pre>` : "";
            return `<details>
          <summary>
            <span><code>${escapeHtml(result.command)}</code></span>
            <span class="pill ${tone}">${escapeHtml(tr("exit"))} ${escapeHtml(result.exitCode)}</span>
          </summary>
          <div class="command-body">
            <p class="muted">${escapeHtml(tr("Duration"))}: ${escapeHtml(result.durationMs)}ms${result.timedOut ? ` | ${escapeHtml(tr("Timed out: yes"))}` : ""}</p>${stdout}${stderr}
          </div>
        </details>`;
          })
          .join("")}
      </div>
    </section>`;
}

function htmlChangedFiles(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return htmlTable(
    [tr("File"), tr("Status"), tr("+/-"), tr("Owners")],
    report.changedFiles.map((file) => {
      const path = file.previousPath ? `${escapeHtml(file.previousPath)} <span class="muted">-&gt;</span> ${escapeHtml(file.path)}` : escapeHtml(file.path);
      const owners = file.owners && file.owners.length > 0 ? file.owners.join(", ") : "";
      return [
        path,
        escapeHtml(tr(file.status)),
        escapeHtml(`+${file.additions} / -${file.deletions}${file.binary ? ` (${tr("binary")})` : ""}`),
        escapeHtml(owners)
      ];
    }),
    tr("No changed files detected.")
  );
}

function htmlVerificationStatus(execution: VerificationExecution, locale: Locale): string {
  return `<span class="pill ${htmlVerificationTone(execution.status)}">${escapeHtml(t(locale, formatVerificationStatus(execution)))}</span>`;
}

function htmlVerificationTone(status: VerificationStatus): string {
  if (status === "passed") return "pass";
  if (status === "failed" || status === "timed-out") return "fail";
  if (status === "not-run") return "warn";
  return "info";
}

function htmlProjectSignals(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return htmlTable(
    [tr("Ecosystem"), tr("Framework"), tr("Entrypoint"), tr("Manifest"), tr("Package manager"), tr("Task runner")],
    report.projectSignals.map((signal) => [
      escapeHtml(signal.ecosystem),
      escapeHtml(signal.framework ?? ""),
      escapeHtml(signal.entrypoint ?? ""),
      escapeHtml(signal.manifestPath),
      escapeHtml(signal.packageManager ?? ""),
      escapeHtml(signal.taskRunner ?? "")
    ]),
    tr("No project manifests were recognized.")
  );
}

function htmlReviewContext(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  const details: [string, string][] = [];
  if (report.policy) {
    details.push([tr("Policy"), `${report.policy.path} (${report.policy.ruleCount} ${tr("rules")})`]);
    details.push([tr("Policy commands"), `${report.policy.requiredCommandCount} ${tr("required")}, ${report.policy.optionalCommandCount} ${tr("optional")}`]);
    if (report.policy.failOn) details.push([tr("Fail-on"), report.policy.failOn]);
    if (report.policy.maxRisk !== undefined) details.push([tr("Max risk"), `${report.policy.maxRisk}`]);
  }
  if (report.codeOwners) {
    details.push([tr("Code owners"), `${report.codeOwners.path} (${report.codeOwners.ruleCount} ${tr("rules")})`]);
  }
  if (report.baseline) {
    details.push([tr("Baseline"), report.baseline.path]);
    details.push([tr("Risk delta"), formatDelta(report.baseline.riskDelta)]);
    details.push([tr("Findings delta"), `${report.baseline.newFindingCount} ${tr("new")}, ${report.baseline.resolvedFindingCount} ${tr("resolved")}, ${report.baseline.unchangedFindingCount} ${tr("unchanged")}`]);
  }
  if (report.affectedPackages.length > 0) {
    details.push([tr("Affected packages"), report.affectedPackages.map((workspacePackage) => workspacePackage.name).join(", ")]);
  }

  if (details.length === 0) {
    return `<p class="empty">${escapeHtml(tr("No policy, owner, baseline, or workspace package context was detected."))}</p>`;
  }

  return `<div class="detail-list">
        ${details
          .map(
            ([label, value]) => `<div class="detail-item">
          <div class="detail-label">${escapeHtml(label)}</div>
          <div class="detail-value">${escapeHtml(value)}</div>
        </div>`
          )
          .join("")}
      </div>`;
}

function htmlDependencyChanges(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return htmlTable(
    [tr("File"), tr("Type"), tr("Package"), tr("Path"), tr("Change"), tr("Before"), tr("After")],
    report.dependencyChanges.map((change) => [
      escapeHtml(change.file),
      escapeHtml(change.dependencyType),
      escapeHtml(change.packageName),
      escapeHtml(change.packagePath ?? ""),
      escapeHtml(change.changeType),
      escapeHtml(change.before ?? ""),
      escapeHtml(change.after ?? "")
    ]),
    tr("No dependency changes detected.")
  );
}

function htmlPackageScriptChanges(report: PatchReport, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return htmlTable(
    [tr("File"), tr("Script"), tr("Change"), tr("Before"), tr("After")],
    report.packageScriptChanges.map((change) => [
      escapeHtml(change.file),
      `<code>${escapeHtml(change.scriptName)}</code>`,
      escapeHtml(change.changeType),
      `<code>${escapeHtml(change.before ?? "")}</code>`,
      `<code>${escapeHtml(change.after ?? "")}</code>`
    ]),
    tr("No package script changes detected.")
  );
}

function htmlTable(headers: string[], rows: string[][], emptyMessage: string): string {
  if (rows.length === 0) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;

  return `<div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>`;
}

function htmlStatusTone(status: PatchReport["summary"]["status"]): "pass" | "warn" | "fail" {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  return "fail";
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
