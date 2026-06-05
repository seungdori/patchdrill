import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readVersion(fallback = "0.1.0"): string {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  if (!existsSync(packagePath)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : fallback;
  } catch {
    return fallback;
  }
}
