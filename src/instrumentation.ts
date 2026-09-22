/**
 * Next.js server-error hook: every unhandled error in route handlers, server
 * components and server actions lands here. Always logs; in production it
 * alerts through notifyOps (email and/or webhook, deduplicated per crash).
 * Uses raw process.env: instrumentation runs before env validation.
 */
export function register(): void {
  // No startup instrumentation needed yet.
}

type RequestInfo = { path: string; method: string };
type ErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
};

const CRASH_COOLDOWN_MS = 30 * 60 * 1000;
const STACK_LINES = 10;
/** Bounds the email body when a message or stack frame is huge (SQL, JSON). */
const MAX_DETAIL_CHARS = 4000;

/** Route pattern without query string: stable for dedup, free of user data. */
const routeOf = (request: RequestInfo, context?: ErrorContext): string =>
  context?.routePath ?? request.path.split("?")[0] ?? request.path;

/**
 * Dedup signature of a message: ids, emails and numbers vary per occurrence
 * (a Postgres "Key (id)=(...)" error, a not-found id), so they are masked, or
 * every repeat of one bug would get its own key and bypass the cooldown.
 */
export const crashSignature = (firstLine: string): string =>
  firstLine
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<id>",
    )
    .replace(/[^\s@()"'<>]+@[^\s@()"'<>]+/g, "<email>")
    .replace(/\b[0-9a-f]*\d[0-9a-f]*\b/gi, "<n>")
    .slice(0, 120);

export const crashDetail = (
  err: unknown,
  request: RequestInfo,
  context?: ErrorContext,
): string => {
  const lines = [
    `Route: ${request.method} ${routeOf(request, context)}`,
    context?.routeType
      ? `Kind: ${[context.routerKind, context.routeType, context.renderSource].filter(Boolean).join(" / ")}`
      : null,
    process.env.VERCEL_GIT_COMMIT_SHA
      ? `Commit: ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
      : null,
    process.env.VERCEL_URL ? `Deployment: ${process.env.VERCEL_URL}` : null,
    `Time: ${new Date().toISOString()}`,
    "",
    err instanceof Error && err.stack
      ? err.stack
          .split("\n")
          .slice(0, STACK_LINES + 1)
          .join("\n")
      : String(err),
  ];
  return lines
    .filter((l) => l !== null)
    .join("\n")
    .slice(0, MAX_DETAIL_CHARS);
};

export const onRequestError = async (
  err: unknown,
  request: RequestInfo,
  context?: ErrorContext,
): Promise<void> => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[onRequestError] ${request.method} ${request.path}:`, err);

  // Same production gate as notifyOps: dev and preview deploys stay quiet,
  // self-hosted production installs (no VERCEL_ENV) alert.
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return;

  // Edge/middleware runtime can't load the db module notifyOps needs. The
  // import must sit inside this constant branch: the bundler strips it from
  // the edge build only there (an early return still gets traced).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const route = `${request.method} ${routeOf(request, context)}`;
    const firstLine = (message.split("\n")[0] ?? "").slice(0, 200);
    try {
      const { notifyOps } = await import("~/server/ops");
      await notifyOps(`unhandled error on ${route}: ${firstLine}`, {
        key: `crash:${route}:${crashSignature(firstLine)}`,
        cooldownMs: CRASH_COOLDOWN_MS,
        subject: `LicenseMeter error: ${route}`,
        detail: crashDetail(err, request, context),
      });
    } catch {
      // alerting must never cascade
    }
  }
};
