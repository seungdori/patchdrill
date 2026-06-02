import type { PatchReport, Severity } from "./types.js";

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
