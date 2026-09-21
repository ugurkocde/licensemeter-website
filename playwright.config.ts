import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The local fallback database is embedded PGlite. Keep browser suites
  // single-worker everywhere so simultaneous first-demo seeding cannot abort
  // its WASM process; production uses Postgres and is unaffected.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.DOCKER_SMOKE
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Exercise the support form with mocked providers, never real email delivery.
        env: {
          // The demo button in the specs needs the credentials-free entry.
          DEMO_MODE: "true",
          // Placeholders so the sign-in entry points render; no spec signs in.
          AUTH_MICROSOFT_ENTRA_ID_ID:
            process.env.AUTH_MICROSOFT_ENTRA_ID_ID ??
            "00000000-0000-0000-0000-000000000000",
          AUTH_MICROSOFT_ENTRA_ID_SECRET:
            process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "e2e-placeholder",
          RESEND_API_KEY: "test-support-key",
          EMAIL_FROM: "Support <support@example.com>",
          SUPPORT_TURNSTILE_SITE_KEY: "",
          SUPPORT_TURNSTILE_SECRET_KEY: "",
        },
      },
});
