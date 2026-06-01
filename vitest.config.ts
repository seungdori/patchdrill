import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Git-backed suites spawn many repositories; one fork avoids worker heartbeat flakes under prepack load.
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    fileParallelism: false,
    testTimeout: 60_000,
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
