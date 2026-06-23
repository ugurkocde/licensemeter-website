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
    // AUTH_SECRET set here (before any module import) so secret-at-rest crypto
    // tests have a stable HKDF input regardless of ESM import hoisting.
    env: {
      SKIP_ENV_VALIDATION: "true",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
    },
  },
});
