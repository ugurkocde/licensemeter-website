import { dbErrorFields, isQueryError, opsErrorText } from "~/server/opsError";

/**
 * Error text persisted to sync_runs (and therefore visible to workspace
 * members): length-bounded, no stack traces. Full errors go to server logs.
 */
export const errText = (err: unknown): string => {
  // Drizzle wraps database errors as "Failed query: <sql>" and keeps the
  // Postgres message on `cause`; the SQL alone tells an admin nothing.
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause : null;
  const message =
    err instanceof Error
      ? err.message.startsWith("Failed query:") && cause
        ? `Database error: ${cause.message}`
        : err.message
      : String(err);
  // Log only a message: MSAL/Graph error objects can carry request context
  // (token request bodies, credentials) that must never reach the logs. A
  // database error can echo the value it rejected, so it is logged in its
  // allowlisted form; workspace members still see the full text.
  console.error(
    "[sync]",
    dbErrorFields(err) || isQueryError(err) ? opsErrorText(err) : message,
  );
  return message.slice(0, 300);
};
