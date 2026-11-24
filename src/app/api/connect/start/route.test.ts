import { afterEach, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(url);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("~/server/auth", () => ({
  auth: async () => ({ user: { oid: "user", tid: "tenant", upn: "" } }),
}));
vi.mock("~/server/access", () => ({
  apiAccess: async () => ({ tenant: { id: "workspace" } }),
}));
vi.mock("~/server/db", () => ({
  db: { insert: () => ({ values: async () => undefined }) },
}));

afterEach(() => vi.unstubAllEnvs());

it("keeps the admin-consent callback on APP_BASE_URL", async () => {
  vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
  vi.stubEnv("PUBLIC_SITE_URL", "https://www.licensemeter.com");
  vi.stubEnv("CONNECTOR_CLIENT_ID", "connector");
  const { GET } = await import("./route");

  await expect(GET()).rejects.toThrow();
  const [destination] = redirect.mock.calls[0]!;
  expect(new URL(destination).searchParams.get("redirect_uri")).toBe(
    "https://licensemeter.com/api/connect/callback",
  );
});
