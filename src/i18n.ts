import { MESSAGE_PATTERNS, STATIC_MESSAGES } from "./i18n-catalog.js";

export const LOCALES = ["en", "ko", "ja", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

interface LocaleResolution {
  explicit?: string | undefined;
  policy?: string | undefined;
  env?: NodeJS.ProcessEnv;
}

// Map a POSIX locale string (e.g. "ko_KR.UTF-8", "zh-Hant", "ja") to a supported
// Locale, or undefined when it does not match one we ship.
function localeFromTag(tag: string | undefined): Locale | undefined {
  if (!tag) return undefined;
  const normalized = tag.trim().toLowerCase();
  if (!normalized || normalized === "c" || normalized === "posix") return undefined;
  const primary = normalized.split(/[._@-]/, 1)[0] ?? "";
  if (primary === "ko") return "ko";
  if (primary === "ja") return "ja";
  if (primary === "zh") return "zh";
  if (primary === "en") return "en";
  return undefined;
}

function localeFromEnv(env: NodeJS.ProcessEnv): Locale | undefined {
  // Honor the standard precedence: explicit message locale wins, then LC_ALL, then LANG.
  for (const key of ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"]) {
    const resolved = localeFromTag(env[key]);
    if (resolved) return resolved;
  }
  return undefined;
}

/**
 * Resolve the active output locale. Precedence: explicit flag/option, then policy
 * config, then the system locale (LC_ALL/LC_MESSAGES/LANG/LANGUAGE), then English.
 */
export function resolveLocale(resolution: LocaleResolution): Locale {
  if (isLocale(resolution.explicit)) return resolution.explicit;
  if (isLocale(resolution.policy)) return resolution.policy;
  return localeFromEnv(resolution.env ?? {}) ?? "en";
}

/**
 * Translate a canonical English string to the active locale. English is the
 * canonical source, so locale "en" (and any string without a catalog entry)
 * returns the input unchanged — keeping English output byte-identical.
 */
export function t(locale: Locale, text: string): string {
  if (locale === "en") return text;
  const entry = STATIC_MESSAGES[text];
  const direct = entry?.[locale];
  if (direct !== undefined) return direct;
  for (const pattern of MESSAGE_PATTERNS) {
    const match = pattern.test.exec(text);
    if (match) {
      const fill = pattern.fill[locale];
      if (fill) return fill(match);
    }
  }
  return text;
}
