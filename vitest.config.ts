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
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // Floor a bit below current coverage so it ratchets without flaking.
      thresholds: {
        statements: 85,
        branches: 73,
        functions: 90,
        lines: 90
      }
    }
  }
});
