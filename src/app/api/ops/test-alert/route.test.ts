import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: { CRON_SECRET: "s3cret" } }));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn(() => Promise.resolve()) }));

const { GET } = await import("./route");

const req = (auth?: string) =>
  new NextRequest("https://licensemeter.test/api/ops/test-alert", {
    headers: auth ? { authorization: auth } : {},
  });

describe("GET /api/ops/test-alert", () => {
  it("rejects requests without the cron secret", () => {
    expect(GET(req()).status).toBe(401);
    expect(GET(req("Bearer wrong")).status).toBe(401);
  });

  it("throws on purpose when authorized", () => {
    expect(() => GET(req("Bearer s3cret"))).toThrow(
      "test alert: ops email pipeline check",
    );
  });
});
