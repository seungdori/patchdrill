import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("vitest config", () => {
  it("runs git-backed fixture files serially to avoid worker heartbeat flakes", () => {
    const testConfig = config as { test?: { fileParallelism?: boolean; testTimeout?: number } };

    expect(testConfig.test?.fileParallelism).toBe(false);
    expect(testConfig.test?.testTimeout).toBe(20_000);
  });
});
