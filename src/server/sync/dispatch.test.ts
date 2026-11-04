import { afterEach, describe, expect, it, vi } from "vitest";

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
      deadline: Date.now() + 60_000,
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
      deadline: Date.now() + 60_000,
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
      deadline: Date.now() + 60_000,
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
      deadline: Date.now() + 60_000,
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
      deadline: Date.now() + 60_000,
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
      deadline: Date.now() + 60_000,
      fetchImpl: fetchImpl,
    });
    expect(out).toEqual({ accepted: [], rejected: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe("budget", () => {
    afterEach(() => vi.useRealTimers());
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);

    it("stops after the first round of failures when nothing is accepted", async () => {
      const fetchImpl = vi.fn(() => Promise.reject(new Error("blocked")));
      const out = await dispatchTenantSyncs(many, {
        baseUrl: "https://www.licensemeter.com",
        secret: "s3cret",
        deadline: Date.now() + 60_000,
        fetchImpl: fetchImpl,
      });
      // The first round (8 in flight) plus at most two more before the third
      // failure trips the breaker.
      expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(10);
      expect(out.accepted).toEqual([]);
      expect([...out.rejected].sort()).toEqual([...many].sort());
    });

    it("keeps dispatching past single failures once one was accepted", async () => {
      const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
        const { tenantId } = JSON.parse(init.body as string) as {
          tenantId: string;
        };
        return Promise.resolve(respond(tenantId === "t0" ? 202 : 500));
      });
      const out = await dispatchTenantSyncs(many, {
        baseUrl: "https://www.licensemeter.com",
        secret: "s3cret",
        deadline: Date.now() + 60_000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(20);
      expect(out.accepted).toEqual(["t0"]);
      expect(out.rejected).toHaveLength(19);
    });

    it("starts no dispatch after the deadline and returns the rest", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const deadline = Date.now() + 30_000;
      const fetchImpl = vi.fn(() => {
        // Each accepted dispatch takes 10 seconds of wall time.
        vi.setSystemTime(Date.now() + 10_000);
        return Promise.resolve(respond(202));
      });
      const out = await dispatchTenantSyncs(many, {
        baseUrl: "https://www.licensemeter.com",
        secret: "s3cret",
        deadline,
        fetchImpl: fetchImpl,
      });
      expect(out.accepted.length + out.rejected.length).toBe(20);
      expect(out.accepted.length).toBe(fetchImpl.mock.calls.length);
      expect(out.accepted.length).toBeLessThan(20);
    });

    it("clamps the request timeout to the time left", async () => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      const fetchImpl = vi.fn(() => Promise.resolve(respond(202)));
      await dispatchTenantSyncs(["a"], {
        baseUrl: "https://www.licensemeter.com",
        secret: "s3cret",
        deadline: Date.now() + 2_000,
        fetchImpl: fetchImpl,
      });
      expect(timeout.mock.calls[0]![0]).toBeLessThanOrEqual(2_000);
      timeout.mockRestore();
    });

    it("dispatches nothing when the deadline has passed", async () => {
      const fetchImpl = vi.fn();
      const out = await dispatchTenantSyncs(["a", "b"], {
        baseUrl: "https://www.licensemeter.com",
        secret: "s3cret",
        deadline: Date.now() - 1,
        fetchImpl: fetchImpl,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(out).toEqual({ accepted: [], rejected: ["a", "b"] });
    });
  });
});
