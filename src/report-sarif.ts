import { createHash } from "node:crypto";
import type { PatchReport, Severity } from "./types.js";

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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "patchdrill-finding";
}

function stableFingerprint(ruleId: string, file: string, line: number, title: string): string {
  return createHash("sha256").update(`${ruleId}\0${file}\0${line}\0${title}`).digest("hex");
}
