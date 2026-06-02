import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const schemaNames = ["policy", "report", "evidence", "doctor", "release-check"] as const;

export type SchemaName = (typeof schemaNames)[number];

const schemaFiles: Record<SchemaName, string> = {
  policy: "patchdrill-policy.schema.json",
  report: "patchdrill-report.schema.json",
  evidence: "patchdrill-evidence.schema.json",
  doctor: "patchdrill-doctor.schema.json",
  "release-check": "patchdrill-release-check.schema.json"
};

export function isSchemaName(value: string | undefined): value is SchemaName {
  return schemaNames.some((name) => name === value);
}

export function readSchema(name: SchemaName): string {
  return readFileSync(fileURLToPath(new URL(`../schemas/${schemaFiles[name]}`, import.meta.url)), "utf8");
}
