import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    globalSetup: ["./tests/global-setup.ts"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
