import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const schemaNames = ["policy", "report", "evidence", "doctor", "release-check"] as const;

export type SchemaName = (typeof schemaNames)[number];

export interface SchemaMetadata {
  name: SchemaName;
  fileName: string;
  path: string;
}

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

export function schemaFileName(name: SchemaName): string {
  return schemaFiles[name];
}

export function schemaPath(name: SchemaName): string {
  return fileURLToPath(new URL(`../schemas/${schemaFileName(name)}`, import.meta.url));
}

export function listSchemas(): SchemaMetadata[] {
  return schemaNames.map((name) => ({
    name,
    fileName: schemaFileName(name),
    path: schemaPath(name)
  }));
}

export function readSchema(name: SchemaName): string {
  return readFileSync(schemaPath(name), "utf8");
}
