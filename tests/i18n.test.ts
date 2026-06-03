import { describe, expect, it } from "vitest";
import { createDemoReport } from "../src/demo.js";
import { isLocale, LOCALES, resolveLocale, t } from "../src/i18n.js";
import { renderMarkdown, renderSummaryMarkdown } from "../src/report.js";

describe("i18n locale resolution", () => {
  it("recognizes the supported locales", () => {
    expect([...LOCALES]).toEqual(["en", "ko", "ja", "zh"]);
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("prefers an explicit locale over policy and environment", () => {
    expect(resolveLocale({ explicit: "zh", policy: "ko", env: { LANG: "ja_JP.UTF-8" } })).toBe("zh");
  });

  it("ignores an unsupported explicit value and falls through", () => {
    expect(resolveLocale({ explicit: "fr", env: { LANG: "ko_KR.UTF-8" } })).toBe("ko");
  });

  it("falls back to policy when no explicit locale is given", () => {
    expect(resolveLocale({ policy: "ja", env: { LANG: "ko_KR.UTF-8" } })).toBe("ja");
  });

  it("auto-detects from the system locale with LC_ALL > LANG precedence", () => {
    expect(resolveLocale({ env: { LANG: "ko_KR.UTF-8" } })).toBe("ko");
    expect(resolveLocale({ env: { LC_ALL: "ja_JP.UTF-8", LANG: "ko_KR.UTF-8" } })).toBe("ja");
    expect(resolveLocale({ env: { LANG: "zh-Hans" } })).toBe("zh");
  });

  it("defaults to English for C/POSIX or unsupported locales", () => {
    expect(resolveLocale({ env: { LANG: "C" } })).toBe("en");
    expect(resolveLocale({ env: { LANG: "POSIX" } })).toBe("en");
    expect(resolveLocale({ env: { LANG: "fr_FR.UTF-8" } })).toBe("en");
    expect(resolveLocale({ env: {} })).toBe("en");
  });
});

describe("i18n translation", () => {
  it("returns the input unchanged for English", () => {
    expect(t("en", "Risk score")).toBe("Risk score");
  });

  it("falls back to English when a string has no catalog entry", () => {
    expect(t("ko", "this string is not in the catalog at all")).toBe("this string is not in the catalog at all");
    expect(t("ja", "src/some/path.ts")).toBe("src/some/path.ts");
  });

  it("translates chrome, finding text, and interpolation patterns", () => {
    expect(t("ko", "Risk score")).toBe("위험 점수");
    expect(t("ja", "Findings")).toBe("検出項目");
    expect(t("zh", "Verification Plan")).toBe("验证计划");
    // Interpolated pattern keeps the data and re-emits it in the target locale.
    expect(t("ko", "failed (1)")).toBe("실패 (1)");
    expect(t("ko", "1500 lines changed. Large patches deserve split review or stronger test evidence.")).toContain("1500");
    expect(t("ko", "1500 lines changed. Large patches deserve split review or stronger test evidence.")).not.toContain("lines changed");
  });
});

describe("i18n report rendering", () => {
  const report = createDemoReport("risky-agent-pr");

  it("renders the report in the requested locale and leaves English byte-identical", () => {
    const en = renderMarkdown(report, "en");
    const ko = renderMarkdown(report, "ko");

    expect(renderMarkdown(report)).toBe(en); // default locale is English
    expect(en).toContain("# PatchDrill Report");
    expect(en).toContain("## Findings");

    expect(ko).not.toBe(en);
    expect(ko).toContain("# PatchDrill 리포트");
    expect(ko).toContain("## 발견 항목");
    expect(ko).toContain("위험 점수");
    expect(ko).toContain("## 검증 계획");
    expect(ko).toContain("PatchDrill"); // brand preserved
    expect(ko).not.toContain("## Findings");
  });

  it("localizes the compact summary for ja and zh", () => {
    expect(renderSummaryMarkdown(report, "ja")).toContain("# PatchDrill サマリー");
    expect(renderSummaryMarkdown(report, "zh")).toContain("# PatchDrill 摘要");
    expect(renderSummaryMarkdown(report, "en")).toBe(renderSummaryMarkdown(report));
  });
});
