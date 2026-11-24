import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SKIP_ENV_VALIDATION", undefined);
  vi.stubEnv("VERCEL", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  ["http://localhost:3000", "http://localhost:3000"],
  ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
  ["http://[::1]:3000", "http://[::1]:3000"],
  ["http://web:3000", "http://web:3000"],
  ["http://licensemeter.lan", "http://licensemeter.lan"],
  ["https://licenses.example.org/", "https://licenses.example.org"],
])("accepts %s as PUBLIC_SITE_URL", async (value, origin) => {
  vi.stubEnv("PUBLIC_SITE_URL", value);
  const { publicSiteUrl } = await import("./env");
  expect(publicSiteUrl()).toBe(origin);
});

it.each([
  "ftp://licenses.example.org",
  "https://licenses.example.org/pricing",
  "https://licenses.example.org/pricing/..",
  "https://licenses.example.org/?stream=all",
  "https://licenses.example.org/#pricing",
  "https://user:password@licenses.example.org",
])("rejects %s as PUBLIC_SITE_URL", async (value) => {
  vi.stubEnv("PUBLIC_SITE_URL", value);
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(import("./env")).rejects.toThrow(
    "Invalid environment variables",
  );
  expect(log.mock.calls[0]?.[1]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: ["PUBLIC_SITE_URL"] }),
    ]),
  );
});
