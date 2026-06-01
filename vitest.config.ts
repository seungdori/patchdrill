import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // The fixture suite spawns many real git repositories; serial files avoid worker heartbeat flakes under prepack load.
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
