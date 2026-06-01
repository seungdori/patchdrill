import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("vitest config", () => {
  it("runs git-backed files serially to avoid worker heartbeat flakes", () => {
    const testConfig = config as {
      test?: {
        fileParallelism?: boolean;
        pool?: string;
        poolOptions?: { forks?: { singleFork?: boolean } };
        testTimeout?: number;
      };
    };

    expect(testConfig.test?.fileParallelism).toBe(false);
    expect(testConfig.test?.pool).toBe("forks");
    expect(testConfig.test?.poolOptions?.forks?.singleFork).toBe(true);
    expect(testConfig.test?.testTimeout).toBe(60_000);
  });
});
