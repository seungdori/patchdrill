import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Git-backed suites spawn many repositories; serial files avoid worker heartbeat flakes under prepack load.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
