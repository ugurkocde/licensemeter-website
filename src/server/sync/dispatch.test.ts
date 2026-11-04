import { describe, expect, it, vi } from "vitest";

import { dispatchTenantSyncs, sameSiteRedirect } from "./dispatch";

const ids = ["a", "b", "c"];
const respond = (status: number, location?: string) =>
  new Response(status === 202 ? "{}" : null, {
    status,
    headers: location ? { location } : {},
  });

describe("sameSiteRedirect", () => {
  const from = "https://licensemeter.com/api/cron/sync/tenant";

  it("follows apex to www on the same path", () => {
    expect(
      sameSiteRedirect(
        from,
        "https://www.licensemeter.com/api/cron/sync/tenant",
      ),
    ).toBe("https://www.licensemeter.com/api/cron/sync/tenant");
  });

  it("refuses another host, another path, http and a missing location", () => {
    expect(
      sameSiteRedirect(from, "https://evil.com/api/cron/sync/tenant"),
    ).toBeNull();
    expect(
      sameSiteRedirect(
        from,
        "https://www.licensemeter.com.evil.com/api/cron/sync/tenant",
      ),
    ).toBeNull();
    expect(
      sameSiteRedirect(from, "https://www.licensemeter.com/sign-in"),
    ).toBeNull();
    expect(
      sameSiteRedirect(
        from,
        "http://www.licensemeter.com/api/cron/sync/tenant",
      ),
    ).toBeNull();
    expect(sameSiteRedirect(from, null)).toBeNull();
  });
});

describe("dispatchTenantSyncs", () => {
  it("posts each tenant with the bearer and accepts only 202", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      const { tenantId } = JSON.parse(init.body as string) as {
        tenantId: string;
      };
      return Promise.resolve(respond(tenantId === "b" ? 500 : 202));
    });
    const out = await dispatchTenantSyncs(ids, {
      baseUrl: "https://www.licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.accepted.sort()).toEqual(["a", "c"]);
    expect(out.rejected).toEqual(["b"]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://www.licensemeter.com/api/cron/sync/tenant");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer s3cret",
    );
  });

  it("follows the apex to www redirect once and keeps the new host", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve(
        url.startsWith("https://licensemeter.com")
          ? respond(308, "https://www.licensemeter.com/api/cron/sync/tenant")
          : respond(202),
      );
    });
    const out = await dispatchTenantSyncs(["a"], {
      baseUrl: "https://licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ accepted: ["a"], rejected: [] });
    expect(calls).toEqual([
      "https://licensemeter.com/api/cron/sync/tenant",
      "https://www.licensemeter.com/api/cron/sync/tenant",
    ]);

    // Later tenants go straight to the remembered host.
    calls.length = 0;
    const many = await dispatchTenantSyncs(ids, {
      baseUrl: "https://licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(many.rejected).toEqual([]);
    expect(
      calls.filter((u) => u.startsWith("https://licensemeter.com")).length,
    ).toBeLessThanOrEqual(ids.length);
  });

  it("rejects a redirect to another host without following it", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(respond(307, "https://evil.com/api/cron/sync/tenant")),
    );
    const out = await dispatchTenantSyncs(["a"], {
      baseUrl: "https://licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl,
    });
    expect(out).toEqual({ accepted: [], rejected: ["a"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects tenants whose request throws", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("timeout")));
    const out = await dispatchTenantSyncs(ids, {
      baseUrl: "https://www.licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl,
    });
    expect(out.accepted).toEqual([]);
    expect(out.rejected.sort()).toEqual(ids);
  });

  it("does nothing for an empty list", async () => {
    const fetchImpl = vi.fn();
    const out = await dispatchTenantSyncs([], {
      baseUrl: "https://www.licensemeter.com",
      secret: "s3cret",
      fetchImpl: fetchImpl,
    });
    expect(out).toEqual({ accepted: [], rejected: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
