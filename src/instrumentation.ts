/**
 * Next.js server-error hook: every unhandled error in route handlers, server
 * components and server actions lands here. Always logs; in production it
 * alerts through notifyOps (email and/or webhook, deduplicated per crash).
 * Uses raw process.env: instrumentation runs before env validation.
 */
import {
  dbErrorFields,
  dbErrorSummary,
  isQueryError,
  opsErrorText,
  withDbFields,
} from "~/server/opsError";

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

/**
 * Route pattern (for example /app/findings/[id]): stable for dedup and free
 * of user data. The request path is caller-controlled, so it is never used;
 * without a pattern the route is reported as unknown.
 */
const routeOf = (_request: RequestInfo, context?: ErrorContext): string =>
  context?.routePath ?? "unknown route";

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

/**
 * Drizzle query errors carry the bound parameters in their message and stack
 * ("params: ..."), and a Postgres error can echo the value it rejected, in
 * its own message or as the cause of a query error. Such an error is rebuilt
 * from allowlisted fields (the query text, SQLSTATE, constraint, table and
 * column; see opsError.ts) with no cause attached, and its message is
 * replaced verbatim in the stack, so frames survive and no parameter or
 * value text reaches the log or the alert. A stack that does not contain the
 * message verbatim is dropped.
 */
export const withoutQueryParams = (err: unknown): unknown => {
  if (!(err instanceof Error)) return err;
  const db = dbErrorFields(err);
  if (!isQueryError(err) && !db) return err;
  const message = [
    isQueryError(err) ? `Failed query: ${err.query}` : null,
    db ? dbErrorSummary(db) : null,
    isQueryError(err) ? "params: <redacted>" : null,
  ]
    .filter(Boolean)
    .join("\n");
  // Only allowlisted fields travel with the rebuilt error, so the alert can
  // still name the SQLSTATE and the failed query; no message or cause does.
  const safe = Object.assign(
    new Error(message),
    isQueryError(err) ? { query: err.query, params: "<redacted>" } : {},
  );
  if (db) withDbFields(safe, db);
  safe.name = err.name;
  safe.stack = err.stack?.includes(err.message)
    ? err.stack.replace(err.message, message)
    : `${err.name}: ${message}`;
  return safe;
};

/**
 * The stack frames of an error without its message: the frames that follow
 * the message verbatim. Text inside the message cannot pose as a frame, and a
 * stack that does not contain the message yields no frames.
 */
export const stackFrames = (err: unknown): string[] => {
  if (!(err instanceof Error) || !err.stack) return [];
  const at = err.stack.indexOf(err.message);
  if (at === -1) return [];
  return err.stack
    .slice(at + err.message.length)
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, STACK_LINES);
};

/** FNV-1a: a short, stable dedup token that stores no message text. */
const shortHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

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
    // Allowlisted fields and frames only: the message is free text and stays
    // in the function log (see opsError.ts).
    opsErrorText(err),
    ...stackFrames(err),
  ];
  return lines
    .filter((l) => l !== null)
    .join("\n")
    .slice(0, MAX_DETAIL_CHARS);
};

export const onRequestError = async (
  rawErr: unknown,
  request: RequestInfo,
  context?: ErrorContext,
): Promise<void> => {
  const err = withoutQueryParams(rawErr);
  const message = err instanceof Error ? err.message : String(err);
  const route = `${request.method} ${routeOf(request, context)}`;
  // Route without query string, allowlisted fields and frames. Next.js logs
  // the error itself as well; this line adds the alert's view of it.
  console.error(
    `[onRequestError] ${route}: ${opsErrorText(err)}\n${stackFrames(err).join("\n")}`,
  );

  // Same production gate as notifyOps: dev and preview deploys stay quiet,
  // self-hosted production installs (no VERCEL_ENV) alert.
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return;

  // Edge/middleware runtime can't load the db module notifyOps needs. The
  // import must sit inside this constant branch: the bundler strips it from
  // the edge build only there (an early return still gets traced).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const firstLine = (message.split("\n")[0] ?? "").slice(0, 200);
    try {
      const { notifyOps } = await import("~/server/ops");
      // The key keeps distinct crashes apart through a hash of the masked
      // first line, so no message text is stored with it.
      await notifyOps(`unhandled error on ${route}: ${opsErrorText(err)}`, {
        key: `crash:${route}:${shortHash(crashSignature(firstLine))}`,
        cooldownMs: CRASH_COOLDOWN_MS,
        subject: `LicenseMeter error: ${route}`,
        detail: crashDetail(err, request, context),
      });
    } catch {
      // alerting must never cascade
    }
  }
};
