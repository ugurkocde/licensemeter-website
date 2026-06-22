import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Unit tests exercise pure logic, not deployment config; skip the env
    // schema so they don't need the full (now provider-conditional) env set.
    env: { SKIP_ENV_VALIDATION: "true" },
  },
});
