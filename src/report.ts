import { createHash } from "node:crypto";
import type { PatchReport, Severity } from "./types.js";

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export interface GateOptions {
  failOn: Severity;
  maxRisk: number;
  maxRiskDelta?: number;
}

export interface HtmlOptions {
  history?: PatchReport[];
}

export function shouldFail(report: PatchReport, options: GateOptions): boolean {
  if (report.summary.failedCommandCount > 0) return true;
  if (report.summary.riskScore > options.maxRisk) return true;
  if (options.maxRiskDelta !== undefined && report.baseline && report.baseline.riskDelta > options.maxRiskDelta) return true;
  const threshold = severityRank[options.failOn];
  return report.findings.some((finding) => severityRank[finding.severity] >= threshold);
}

export function renderMarkdown(report: PatchReport): string {
  const lines: string[] = [];
  const statusIcon = report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL";

  lines.push("# PatchDrill Report");
  lines.push("");
  lines.push(`Status: **${statusIcon}**`);
  lines.push(`Risk score: **${report.summary.riskScore}/100**`);
  lines.push(`Confidence score: **${report.summary.confidenceScore}/100**`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema version: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Changed files: ${report.summary.changedFileCount}`);
  lines.push(`- Additions / deletions: +${report.summary.additions} / -${report.summary.deletions}`);
  lines.push(`- Required verification commands: ${report.summary.requiredCommandCount}`);
  lines.push(`- Failed verification commands: ${report.summary.failedCommandCount}`);
  lines.push(`- Added lines inspected: ${report.addedLines}`);
  lines.push("");

  if (report.policy) {
    lines.push("## Policy");
    lines.push("");
    lines.push(`- Config: ${report.policy.path}`);
    lines.push(`- Ignored path patterns: ${report.policy.ignoredPaths.length}`);
    if (report.policy.failOn) lines.push(`- Fail-on severity: ${report.policy.failOn}`);
    if (report.policy.maxRisk !== undefined) lines.push(`- Max risk: ${report.policy.maxRisk}`);
    lines.push(`- Policy rules: ${report.policy.ruleCount}`);
    lines.push(`- Policy commands: ${report.policy.requiredCommandCount} required, ${report.policy.optionalCommandCount} optional`);
    lines.push("");
  }

  if (report.codeOwners) {
    lines.push("## Code Owners");
    lines.push("");
    lines.push(`- Config: ${report.codeOwners.path}`);
    lines.push(`- Rules: ${report.codeOwners.ruleCount}`);
    lines.push("");
  }

  if (report.baseline) {
    lines.push("## Baseline");
    lines.push("");
    lines.push(`- Baseline report: ${report.baseline.path}`);
    if (report.baseline.previousStatus) lines.push(`- Status: ${report.baseline.previousStatus} -> ${report.baseline.currentStatus}`);
    if (report.baseline.previousRiskScore !== undefined) {
      lines.push(`- Risk: ${report.baseline.previousRiskScore}/100 -> ${report.baseline.currentRiskScore}/100 (${formatDelta(report.baseline.riskDelta)})`);
    }
    lines.push(`- Findings: ${report.baseline.newFindingCount} new, ${report.baseline.resolvedFindingCount} resolved, ${report.baseline.unchangedFindingCount} unchanged`);
    lines.push("");
  }

  if (report.projectSignals.length > 0) {
    lines.push("## Project Signals");
    lines.push("");
    lines.push("| Ecosystem | Framework | Entrypoint | Manifest | Package manager | Task runner |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const signal of report.projectSignals) {
      lines.push(`| ${signal.ecosystem} | ${signal.framework ?? ""} | ${signal.entrypoint ?? ""} | ${signal.manifestPath} | ${signal.packageManager ?? ""} | ${signal.taskRunner ?? ""} |`);
    }
    lines.push("");
  }

  if (report.affectedPackages.length > 0) {
    lines.push("## Affected Workspace Packages");
    lines.push("");
    lines.push("| Package | Path |");
    lines.push("| --- | --- |");
    for (const workspacePackage of report.affectedPackages) {
      lines.push(`| ${escapePipe(workspacePackage.name)} | ${escapePipe(workspacePackage.path)} |`);
    }
    lines.push("");
  }

  if (report.dependencyChanges.length > 0) {
    lines.push("## Dependency Changes");
    lines.push("");
    lines.push("| File | Type | Package | Path | Change | Before | After |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const change of report.dependencyChanges) {
      lines.push(
        `| ${escapePipe(change.file)} | ${change.dependencyType} | ${escapePipe(change.packageName)} | ${escapePipe(change.packagePath ?? "")} | ${
          change.changeType
        } | ${escapePipe(change.before ?? "")} | ${escapePipe(
          change.after ?? ""
        )} |`
      );
    }
    lines.push("");
  }

  lines.push("## Changed Files");
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    lines.push("| File | Status | +/- | Owners |");
    lines.push("| --- | --- | --- | --- |");
    for (const file of report.changedFiles) {
      const rename = file.previousPath ? `${escapePipe(file.previousPath)} -> ${escapePipe(file.path)}` : escapePipe(file.path);
      lines.push(`| ${rename} | ${file.status} | +${file.additions} / -${file.deletions}${file.binary ? " (binary)" : ""} | ${escapePipe(file.owners?.join(", ") ?? "")} |`);
    }
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No risk findings.");
  } else {
    lines.push("| Severity | Rule | Finding | Location | Remediation |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of report.findings) {
      const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
      lines.push(
        `| ${finding.severity} | ${escapePipe(finding.ruleId ?? "")} | ${escapePipe(finding.title)}: ${escapePipe(finding.detail)} | ${escapePipe(location)} | ${escapePipe(
          finding.remediation ?? ""
        )} |`
      );
    }
  }
  lines.push("");

  lines.push("## Verification Plan");
  lines.push("");
  if (report.commandPlan.length === 0) {
    lines.push("No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests.");
  } else {
    lines.push("| Required | Package | Command | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const command of report.commandPlan) {
      lines.push(
        `| ${command.required ? "yes" : "no"} | ${escapePipe(command.packageName ?? "")} | ${markdownTableCode(command.command)} | ${escapePipe(command.reason)} |`
      );
    }
  }
  lines.push("");

  if (report.commandResults.length > 0) {
    lines.push("## Command Results");
    lines.push("");
    for (const result of report.commandResults) {
      lines.push(`### ${result.command}`);
      lines.push("");
      lines.push(`- Exit code: ${result.exitCode}`);
      lines.push(`- Duration: ${result.durationMs}ms`);
      if (result.timedOut) lines.push("- Timed out: yes");
      if (result.stdout.trim()) {
        lines.push("");
        lines.push("```text");
        lines.push(result.stdout.trim());
        lines.push("```");
      }
      if (result.stderr.trim()) {
        lines.push("");
        lines.push("```text");
        lines.push(result.stderr.trim());
        lines.push("```");
      }
      lines.push("");
    }
  }

  lines.push("## Reviewer Notes");
  lines.push("");
  lines.push("- Treat this report as triage evidence, not a replacement for review.");
  lines.push("- High-impact areas still need human sign-off even when automated commands pass.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function renderSummaryMarkdown(report: PatchReport): string {
  const lines: string[] = [];
  const statusIcon = report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL";
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  const failedCommands = report.commandResults.filter((result) => result.exitCode !== 0);

  lines.push("# PatchDrill Summary");
  lines.push("");
  lines.push(`**${statusIcon}** - risk ${report.summary.riskScore}/100, confidence ${report.summary.confidenceScore}/100`);
  lines.push("");
  lines.push(`- Changed files: ${report.summary.changedFileCount} (+${report.summary.additions} / -${report.summary.deletions})`);
  lines.push(`- Verification plan: ${requiredCommands.length} required, ${optionalCommands.length} optional`);
  lines.push(`- Command results: ${report.commandResults.length} run, ${failedCommands.length} failed`);
  if (report.baseline) {
    lines.push(`- Baseline risk delta: ${formatDelta(report.baseline.riskDelta)} (${report.baseline.newFindingCount} new findings)`);
  }
  lines.push("");

  lines.push("## Changed Files");
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    for (const file of report.changedFiles.slice(0, 5)) {
      const path = file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
      lines.push(`- \`${escapeBackticks(path)}\` (${file.status}, +${file.additions} / -${file.deletions}${file.binary ? ", binary" : ""})`);
    }
    if (report.changedFiles.length > 5) {
      lines.push("");
      lines.push(`_${report.changedFiles.length - 5} more changed files in the full report._`);
    }
  }
  lines.push("");

  lines.push("## Top Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No risk findings.");
  } else {
    lines.push("| Severity | Finding | Location |");
    lines.push("| --- | --- | --- |");
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`| ${finding.severity} | ${escapePipe(finding.title)} | ${escapePipe(findingLocation(finding))} |`);
    }
    if (report.findings.length > 5) {
      lines.push("");
      lines.push(`_${report.findings.length - 5} more findings in the full report._`);
    }
  }
  lines.push("");

  lines.push("## Required Checks");
  lines.push("");
  if (requiredCommands.length === 0) {
    lines.push("No required verification commands were inferred.");
  } else {
    lines.push("| Command | Result |");
    lines.push("| --- | --- |");
    for (const command of requiredCommands.slice(0, 5)) {
      const result = report.commandResults.find((candidate) => candidate.id === command.id);
      lines.push(`| ${markdownTableCode(command.command)} | ${result ? (result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`) : "planned"} |`);
    }
    if (requiredCommands.length > 5) {
      lines.push("");
      lines.push(`_${requiredCommands.length - 5} more required checks in the full report._`);
    }
  }
  lines.push("");

  lines.push("Full Markdown, JSON, SARIF, and HTML reports remain available as CI artifacts when configured.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function renderGitHubAnnotations(report: PatchReport): string {
  const lines = report.findings.map((finding) => {
    const command = githubAnnotationCommand(finding.severity);
    const properties = [
      finding.file ? `file=${escapeGitHubCommandProperty(finding.file)}` : undefined,
      finding.line !== undefined ? `line=${escapeGitHubCommandProperty(String(finding.line))}` : undefined,
      `title=${escapeGitHubCommandProperty(finding.title)}`
    ].filter((property): property is string => property !== undefined);
    const detail = `${finding.detail}${finding.remediation ? ` Remediation: ${finding.remediation}` : ""}`;
    return `::${command} ${properties.join(",")}::${escapeGitHubCommandData(detail)}`;
  });

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

export function renderHtml(report: PatchReport, options: HtmlOptions = {}): string {
  const summary = report.summary;
  const statusLabel = summary.status.toUpperCase();
  const statusTone = htmlStatusTone(summary.status);
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  const failedCommands = report.commandResults.filter((result) => result.exitCode !== 0);
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
          <h1>Verification Dashboard</h1>
        </div>
        <span class="pill ${statusTone}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="context">${context.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </header>

    <div class="grid metrics">
      ${htmlMetric("Risk score", `${summary.riskScore}/100`, "Higher means more review proof is needed.", htmlScoreBar(summary.riskScore, statusTone))}
      ${htmlMetric("Confidence", `${summary.confidenceScore}/100`, "Higher means stronger verification evidence.", htmlScoreBar(summary.confidenceScore, "pass"))}
      ${htmlMetric("Changed files", summary.changedFileCount, `+${summary.additions} / -${summary.deletions}`)}
      ${htmlMetric("Required checks", summary.requiredCommandCount, `${optionalCommands.length} optional, ${failedCommands.length} failed`)}
      ${htmlMetric("Added lines", report.addedLines, "Diff lines scanned for risky content.")}
    </div>

    ${htmlRunTrend(options.history)}

    <section>
      <div class="section-heading">
        <h2>Findings</h2>
        <span class="pill ${statusTone}">${escapeHtml(report.findings.length)} total</span>
      </div>
      ${htmlFindings(report)}
    </section>

    <section>
      <div class="section-heading">
        <h2>Verification Plan</h2>
        <span class="pill ${requiredCommands.length > 0 ? "info" : "pass"}">${escapeHtml(requiredCommands.length)} required, ${escapeHtml(optionalCommands.length)} optional</span>
      </div>
      ${htmlVerificationPlan(report)}
    </section>

    ${htmlCommandResults(report)}

    <section>
      <h2>Changed Files</h2>
      ${htmlChangedFiles(report)}
    </section>

    <div class="grid two-column">
      <section>
        <h2>Project Signals</h2>
        ${htmlProjectSignals(report)}
      </section>
      <section>
        <h2>Review Context</h2>
        ${htmlReviewContext(report)}
      </section>
    </div>

    <section>
      <h2>Dependency Changes</h2>
      ${htmlDependencyChanges(report)}
    </section>

    <section>
      <h2>Reviewer Notes</h2>
      <p class="muted">Treat this dashboard as triage evidence, not a replacement for review. High-impact areas still need human sign-off even when automated commands pass.</p>
    </section>
  </main>
</body>
</html>
`;
}

function htmlRunTrend(history: PatchReport[] | undefined): string {
  if (!history || history.length <= 1) return "";
  const previous = history[history.length - 2];
  const latest = history[history.length - 1];
  const riskDelta = previous && latest ? latest.summary.riskScore - previous.summary.riskScore : 0;
  const failedDelta = previous && latest ? latest.summary.failedCommandCount - previous.summary.failedCommandCount : 0;
  const deltaTone = riskDelta > 0 || failedDelta > 0 ? "warn" : riskDelta < 0 || failedDelta < 0 ? "pass" : "info";
  const table = htmlTable(
    ["Run", "Status", "Risk", "Confidence", "Changed", "Required", "Failed", "Generated", "Base", "Head"],
    history.map((run, index) => [
      escapeHtml(index === history.length - 1 ? `${index + 1} latest` : `${index + 1}`),
      `<span class="pill ${htmlStatusTone(run.summary.status)}">${escapeHtml(run.summary.status)}</span>`,
      `<div class="trend-risk"><span>${escapeHtml(`${run.summary.riskScore}/100`)}</span>${htmlScoreBar(run.summary.riskScore, htmlStatusTone(run.summary.status))}</div>`,
      escapeHtml(`${run.summary.confidenceScore}/100`),
      escapeHtml(`${run.summary.changedFileCount} (+${run.summary.additions}/-${run.summary.deletions})`),
      escapeHtml(run.summary.requiredCommandCount),
      escapeHtml(run.summary.failedCommandCount),
      escapeHtml(run.generatedAt),
      escapeHtml(run.base ?? ""),
      escapeHtml(run.head ?? "")
    ]),
    "No historical runs provided."
  ).replace('class="table-wrap"', 'class="table-wrap trend-table"');

  return `<section>
      <div class="section-heading">
        <h2>Run Trend</h2>
        <span class="pill ${deltaTone}">risk ${formatDelta(riskDelta)}, failed checks ${formatDelta(failedDelta)}</span>
      </div>
      ${table}
    </section>`;
}

export function renderSarif(report: PatchReport): string {
  const rules = new Map<string, { id: string; name: string; shortDescription: { text: string }; help?: { text: string }; properties: Record<string, unknown> }>();
  const results = report.findings
    .filter((finding) => finding.file)
    .map((finding) => {
      const ruleId = finding.ruleId ?? slug(finding.title);
      rules.set(ruleId, {
        id: ruleId,
        name: finding.title,
        shortDescription: { text: finding.title },
        ...(finding.remediation ? { help: { text: finding.remediation } } : {}),
        properties: {
          severity: finding.severity,
          tags: finding.tags ?? []
        }
      });
      return {
        ruleId,
        level: sarifLevel(finding.severity),
        message: {
          text: `${finding.title}: ${finding.detail}${finding.remediation ? ` Remediation: ${finding.remediation}` : ""}`
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: finding.file
              },
              region: {
                startLine: finding.line ?? 1
              }
            }
          }
        ],
        properties: {
          severity: finding.severity,
          tags: finding.tags ?? []
        },
        partialFingerprints: {
          patchdrillFinding: stableFingerprint(ruleId, finding.file ?? "", finding.line ?? 0, finding.title)
        }
      };
    });

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "PatchDrill",
              informationUri: "https://github.com/seungdori/patchdrill",
              rules: [...rules.values()]
            }
          },
          invocations: [
            {
              executionSuccessful: report.summary.failedCommandCount === 0,
              properties: {
                status: report.summary.status,
                riskScore: report.summary.riskScore,
                confidenceScore: report.summary.confidenceScore
              }
            }
          ],
          results
        }
      ]
    },
    null,
    2
  )}\n`;
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" | "none" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  if (severity === "low" || severity === "info") return "note";
  return "none";
}

function findingLocation(finding: { file?: string; line?: number }): string {
  return finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "Global";
}

function githubAnnotationCommand(severity: Severity): "error" | "warning" | "notice" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "notice";
}

function escapeGitHubCommandData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeGitHubCommandProperty(value: string): string {
  return escapeGitHubCommandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeBackticks(value: string): string {
  return value.replaceAll("`", "\\`");
}

function markdownTableCode(value: string): string {
  return `\`${escapePipe(escapeBackticks(value))}\``;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "patchdrill-finding";
}

function stableFingerprint(ruleId: string, file: string, line: number, title: string): string {
  return createHash("sha256").update(`${ruleId}\0${file}\0${line}\0${title}`).digest("hex");
}

function htmlMetric(label: string, value: string | number, detail: string, extra = ""): string {
  return `<div class="metric">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
        <div class="metric-detail">${escapeHtml(detail)}</div>
        ${extra}
      </div>`;
}

function htmlScoreBar(score: number, tone: string): string {
  return `<div class="bar" aria-hidden="true"><span class="${escapeHtml(tone)}" style="width: ${clampScore(score)}%;"></span></div>`;
}

function htmlFindings(report: PatchReport): string {
  if (report.findings.length === 0) {
    return `<p class="empty">No risk findings.</p>`;
  }

  return `<div class="finding-list">
        ${report.findings
          .map((finding) => {
            const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "Global";
            const tags = finding.tags && finding.tags.length > 0 ? `Tags: ${finding.tags.join(", ")}` : undefined;
            return `<article class="finding">
          <div class="finding-head">
            <div>
              <div class="finding-title">${escapeHtml(finding.title)}</div>
              <div class="metric-detail">${escapeHtml(location)}</div>
            </div>
            <span class="pill ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
          </div>
          <p>${escapeHtml(finding.detail)}</p>
          ${finding.remediation ? `<p class="muted">Remediation: ${escapeHtml(finding.remediation)}</p>` : ""}
          ${finding.ruleId ? `<p class="muted">Rule: <code>${escapeHtml(finding.ruleId)}</code></p>` : ""}
          ${tags ? `<p class="muted">${escapeHtml(tags)}</p>` : ""}
        </article>`;
          })
          .join("")}
      </div>`;
}

function htmlVerificationPlan(report: PatchReport): string {
  return htmlTable(
    ["Required", "Package", "Command", "Reason"],
    report.commandPlan.map((command) => [
      `<span class="pill ${command.required ? "warn" : "info"}">${command.required ? "yes" : "no"}</span>`,
      escapeHtml(command.packageName ?? command.packagePath ?? ""),
      `<code>${escapeHtml(command.command)}</code>`,
      escapeHtml(command.reason)
    ]),
    "No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests."
  );
}

function htmlCommandResults(report: PatchReport): string {
  if (report.commandResults.length === 0) return "";

  return `<section>
      <div class="section-heading">
        <h2>Command Results</h2>
        <span class="pill ${report.summary.failedCommandCount > 0 ? "fail" : "pass"}">${escapeHtml(report.summary.failedCommandCount)} failed</span>
      </div>
      <div class="grid">
        ${report.commandResults
          .map((result) => {
            const tone = result.exitCode === 0 ? "pass" : "fail";
            return `<details>
          <summary>
            <span><code>${escapeHtml(result.command)}</code></span>
            <span class="pill ${tone}">exit ${escapeHtml(result.exitCode)}</span>
          </summary>
          <div class="command-body">
            <p class="muted">Duration: ${escapeHtml(result.durationMs)}ms${result.timedOut ? " | Timed out: yes" : ""}</p>
            ${result.stdout.trim() ? `<h3>stdout</h3><pre>${escapeHtml(result.stdout.trim())}</pre>` : ""}
            ${result.stderr.trim() ? `<h3>stderr</h3><pre>${escapeHtml(result.stderr.trim())}</pre>` : ""}
          </div>
        </details>`;
          })
          .join("")}
      </div>
    </section>`;
}

function htmlChangedFiles(report: PatchReport): string {
  return htmlTable(
    ["File", "Status", "+/-", "Owners"],
    report.changedFiles.map((file) => {
      const path = file.previousPath ? `${escapeHtml(file.previousPath)} <span class="muted">-&gt;</span> ${escapeHtml(file.path)}` : escapeHtml(file.path);
      const owners = file.owners && file.owners.length > 0 ? file.owners.join(", ") : "";
      return [
        path,
        escapeHtml(file.status),
        escapeHtml(`+${file.additions} / -${file.deletions}${file.binary ? " (binary)" : ""}`),
        escapeHtml(owners)
      ];
    }),
    "No changed files detected."
  );
}

function htmlProjectSignals(report: PatchReport): string {
  return htmlTable(
    ["Ecosystem", "Framework", "Entrypoint", "Manifest", "Package manager", "Task runner"],
    report.projectSignals.map((signal) => [
      escapeHtml(signal.ecosystem),
      escapeHtml(signal.framework ?? ""),
      escapeHtml(signal.entrypoint ?? ""),
      escapeHtml(signal.manifestPath),
      escapeHtml(signal.packageManager ?? ""),
      escapeHtml(signal.taskRunner ?? "")
    ]),
    "No project manifests were recognized."
  );
}

function htmlReviewContext(report: PatchReport): string {
  const details: Array<[string, string]> = [];
  if (report.policy) {
    details.push(["Policy", `${report.policy.path} (${report.policy.ruleCount} rules)`]);
    details.push(["Policy commands", `${report.policy.requiredCommandCount} required, ${report.policy.optionalCommandCount} optional`]);
    if (report.policy.failOn) details.push(["Fail-on", report.policy.failOn]);
    if (report.policy.maxRisk !== undefined) details.push(["Max risk", `${report.policy.maxRisk}`]);
  }
  if (report.codeOwners) {
    details.push(["Code owners", `${report.codeOwners.path} (${report.codeOwners.ruleCount} rules)`]);
  }
  if (report.baseline) {
    details.push(["Baseline", report.baseline.path]);
    details.push(["Risk delta", formatDelta(report.baseline.riskDelta)]);
    details.push(["Findings delta", `${report.baseline.newFindingCount} new, ${report.baseline.resolvedFindingCount} resolved, ${report.baseline.unchangedFindingCount} unchanged`]);
  }
  if (report.affectedPackages.length > 0) {
    details.push(["Affected packages", report.affectedPackages.map((workspacePackage) => workspacePackage.name).join(", ")]);
  }

  if (details.length === 0) {
    return `<p class="empty">No policy, owner, baseline, or workspace package context was detected.</p>`;
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

function htmlDependencyChanges(report: PatchReport): string {
  return htmlTable(
    ["File", "Type", "Package", "Path", "Change", "Before", "After"],
    report.dependencyChanges.map((change) => [
      escapeHtml(change.file),
      escapeHtml(change.dependencyType),
      escapeHtml(change.packageName),
      escapeHtml(change.packagePath ?? ""),
      escapeHtml(change.changeType),
      escapeHtml(change.before ?? ""),
      escapeHtml(change.after ?? "")
    ]),
    "No dependency changes detected."
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
