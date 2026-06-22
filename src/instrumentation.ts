/**
 * Next.js server-error hook: every unhandled error in route handlers, server
 * components and server actions lands here. Reports to the ops webhook when
 * configured (Sentry-class basics without another vendor); always logs.
 * Uses raw process.env: instrumentation runs before env validation.
 */
export function register(): void {
  // No startup instrumentation needed yet.
}

export const onRequestError = async (
  err: unknown,
  request: { path: string; method: string },
): Promise<void> => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[onRequestError] ${request.method} ${request.path}:`, err);

  // Edge/middleware runtime doesn't have Node.js modules; skip ops notification.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Send to ops webhook if configured. Inline fetch avoids importing the db
  // module (postgres requires Node.js-only modules that break edge bundling).
  const webhookUrl = process.env.OPS_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `unhandled error on ${request.method} ${request.path}: ${message.slice(0, 300)}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // alerting must never cascade
  }
};
