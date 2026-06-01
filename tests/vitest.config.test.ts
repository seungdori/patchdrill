import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("vitest config", () => {
  it("runs git-backed files serially to avoid worker heartbeat flakes", () => {
    const testConfig = config as {
      test?: {
        fileParallelism?: boolean;
        isolate?: boolean;
        maxWorkers?: number;
        pool?: string;
        testTimeout?: number;
      };
    };

    expect(testConfig.test?.fileParallelism).toBe(false);
    expect(testConfig.test?.pool).toBe("forks");
    expect(testConfig.test?.maxWorkers).toBe(1);
    expect(testConfig.test?.isolate).toBe(false);
    expect(testConfig.test?.testTimeout).toBe(60_000);
  });
});
