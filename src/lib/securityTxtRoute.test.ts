import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "~/app/.well-known/security.txt/route";

const get = (host: string | null) =>
  GET(
    new Request("https://placeholder.invalid/.well-known/security.txt", {
      headers: host ? { host } : {},
    }),
  );

describe("GET /.well-known/security.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists the URL it was retrieved from on each hosted origin", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
    for (const host of ["licensemeter.com", "www.licensemeter.com"]) {
      const res = get(host);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(
        `Canonical: https://${host}/.well-known/security.txt`,
      );
    }
  });

  it("returns 404 on any other host, even with the hosted configuration", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
    for (const host of [
      "licensemeter-git-branch.vercel.app",
      "status.licensemeter.com",
      "localhost:3000",
      "10.0.0.1",
      null,
    ]) {
      expect(get(host).status, String(host)).toBe(404);
    }
  });

  it("returns 404 outside the production deployment, even on a hosted host", () => {
    for (const env of ["preview", "development", ""]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(get("www.licensemeter.com").status, env || "unset").toBe(404);
    }
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(get("www.licensemeter.com").status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SELF_HOSTED", "true");
    expect(get("www.licensemeter.com").status).toBe(404);
  });
});
