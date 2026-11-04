/**
 * Nightly fan-out: the cron route hands every tenant to its own invocation of
 * /api/cron/sync/tenant, so each tenant sync gets a full function budget
 * instead of sharing one 300s request with every other tenant.
 */

/** Path of the per-tenant route the nightly cron dispatches to. */
export const TENANT_SYNC_PATH = "/api/cron/sync/tenant";

/** Dispatch requests in flight at once; each one only waits for a 202. */
const DISPATCH_CONCURRENCY = 8;

/** A dispatch that has not been accepted by then is synced in-process. */
const DISPATCH_TIMEOUT_MS = 10_000;

/**
 * Stop dispatching once this many requests failed before any was accepted:
 * the hand-off is broken (protection, firewall, wrong host), and the
 * remaining tenants need the fallback's time more than further attempts.
 */
const BREAKER_FAILURES = 3;

const bareHost = (host: string) => host.replace(/^www\./i, "").toLowerCase();

/**
 * The redirect target when it only moves between the apex and www host of the
 * same site over https and keeps the path (licensemeter.com answers on www).
 * Anything else is not followed: the bearer must never leave the site.
 */
export const sameSiteRedirect = (from: string, location: string | null) => {
  if (!location) return null;
  let to: URL;
  try {
    to = new URL(location, from);
  } catch {
    return null;
  }
  const origin = new URL(from);
  return to.protocol === "https:" &&
    bareHost(to.host) === bareHost(origin.host) &&
    to.pathname === origin.pathname
    ? to.toString()
    : null;
};

/**
 * Posts one request per tenant and returns the ids that were not accepted.
 * Only a 202 counts. One apex/www redirect is followed and remembered for the
 * remaining tenants; any other redirect, a 401 from a protected host, a
 * timeout or a network error leaves the tenant for the in-process fallback.
 * No dispatch starts after `deadline` or after BREAKER_FAILURES failures with
 * no success, and every request's timeout is clamped to `deadline`, so the
 * whole hand-off ends by `deadline`. Tenants not attempted by then are
 * returned as rejected too.
 *
 * A dispatch whose response was lost may still have started its sync. The
 * runSync lock keeps the fallback from running alongside it, but once that
 * sync finished the fallback syncs the tenant a second time: extra Graph
 * reads in an already degraded night, never conflicting writes.
 */
export const dispatchTenantSyncs = async (
  tenantIds: readonly string[],
  opts: {
    baseUrl: string;
    secret: string;
    /** Absolute time (ms) after which no new dispatch is started. */
    deadline: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ accepted: string[]; rejected: string[] }> => {
  const doFetch = opts.fetchImpl ?? fetch;
  let url = new URL(TENANT_SYNC_PATH, opts.baseUrl).toString();
  const timeout = () =>
    Math.max(1, Math.min(DISPATCH_TIMEOUT_MS, opts.deadline - Date.now()));
  const post = (target: string, tenantId: string) =>
    doFetch(target, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tenantId }),
      // Never follow a redirect blindly: it could take the bearer to another
      // host or land on a page that answers 200.
      redirect: "manual",
      signal: AbortSignal.timeout(timeout()),
    });
  const accepted: string[] = [];
  const rejected: string[] = [];
  let cursor = 0;
  const stop = () =>
    Date.now() >= opts.deadline ||
    (accepted.length === 0 && rejected.length >= BREAKER_FAILURES);
  const worker = async () => {
    while (cursor < tenantIds.length && !stop()) {
      const tenantId = tenantIds[cursor++]!;
      try {
        const target = url;
        let res = await post(target, tenantId);
        const next =
          res.status === 307 || res.status === 308
            ? sameSiteRedirect(target, res.headers.get("location"))
            : null;
        if (next && Date.now() < opts.deadline) {
          await res.body?.cancel();
          url = next;
          res = await post(next, tenantId);
        }
        await res.body?.cancel();
        (res.status === 202 ? accepted : rejected).push(tenantId);
      } catch {
        rejected.push(tenantId);
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(DISPATCH_CONCURRENCY, tenantIds.length) },
      worker,
    ),
  );
  rejected.push(...tenantIds.slice(cursor));
  return { accepted, rejected };
};
