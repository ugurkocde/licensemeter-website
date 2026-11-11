/**
 * Error text that is safe for ops alerts. Alerts leave the hosting platform
 * (email, webhook), and an error message is free text from whoever raised it:
 * a database error echoes the value it rejected (`invalid input syntax for
 * type integer: "Alex Example"`), a provider error can quote a user's name.
 * So alerts carry allowlisted fields only (fail closed): a database error's
 * SQLSTATE and constraint, table and column names; for any other error its
 * class name, HTTP status and error codes. Messages stay in the function log.
 */

type DbErrorFields = {
  code: string;
  constraint?: string;
  table?: string;
  column?: string;
};

const SQLSTATE = /^[0-9A-Z]{5}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$.]{0,62}$/;

const field = (e: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) {
    const value = e[name];
    if (typeof value === "string" && IDENTIFIER.test(value)) return value;
  }
  return undefined;
};

const SEVERITIES = new Set(["ERROR", "FATAL", "PANIC"]);

/**
 * Whether an error came from a Postgres server (postgres.js PostgresError or
 * PGlite): its error response always carries a severity, the server routine
 * and the C source file. A provider error with a SQLSTATE-shaped `code` (a
 * five-letter Graph code, say) has none of these and is not trusted as one.
 */
const fromPostgres = (e: Record<string, unknown>): boolean =>
  typeof e.severity === "string" &&
  SEVERITIES.has(e.severity) &&
  typeof e.routine === "string" &&
  typeof e.file === "string" &&
  e.file.endsWith(".c");

/**
 * Carries already-validated database fields on a rebuilt error (see
 * withoutQueryParams in instrumentation.ts), which has no server fields left.
 */
const DB_FIELDS = Symbol("dbErrorFields");

export const withDbFields = <T extends object>(
  target: T,
  fields: DbErrorFields,
): T => Object.assign(target, { [DB_FIELDS]: fields });

/** The Postgres error behind `err` (itself or a cause), postgres.js or PGlite. */
export const dbErrorFields = (err: unknown): DbErrorFields | null => {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object") {
      const marked = (current as { [DB_FIELDS]?: DbErrorFields })[DB_FIELDS];
      if (marked) return marked;
      const e = current as Record<string, unknown>;
      if (
        typeof e.code === "string" &&
        SQLSTATE.test(e.code) &&
        fromPostgres(e)
      ) {
        return {
          code: e.code,
          constraint: field(e, "constraint_name", "constraint"),
          table: field(e, "table_name", "table"),
          column: field(e, "column_name", "column"),
        };
      }
      current = e.cause;
    } else {
      break;
    }
  }
  return null;
};

/** True for a Drizzle query error, whose message embeds the parameters. */
export const isQueryError = (
  err: unknown,
): err is Error & { query: string; params: unknown } =>
  err instanceof Error &&
  "query" in err &&
  "params" in err &&
  typeof (err as { query: unknown }).query === "string";

export const dbErrorSummary = (fields: DbErrorFields): string =>
  [
    `Database error ${fields.code}`,
    fields.constraint && `constraint ${fields.constraint}`,
    fields.table && `table ${fields.table}`,
    fields.column && `column ${fields.column}`,
  ]
    .filter(Boolean)
    .join(", ");

/**
 * A provider-supplied value for an alert: shown only when it is one of the
 * known values, otherwise a fixed placeholder, so no free text reaches an
 * alert even from an authenticated sender.
 */
export const alertLabel = (
  value: string | null | undefined,
  known: ReadonlySet<string>,
): string => (value && known.has(value) ? value : "unrecognized");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A provider id for an alert: shown when it is a GUID, otherwise a placeholder. */
export const alertId = (value: string | null | undefined): string =>
  value && ID.test(value) ? value : "unrecognized id";

/**
 * An error whose message the application wrote itself from counts, ids and
 * statuses, never from user or provider text. Alerts show its message.
 */
export class OpsSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsSafeError";
  }
}

/**
 * Error codes an alert may show. A code is provider text too (Graph copies
 * `error.code` from the response), and a name can look like a code, so only
 * these known values pass; any other code is left out.
 */
const KNOWN_CODES: ReadonlySet<string> = new Set([
  // Microsoft Graph and Entra
  "Authorization_RequestDenied",
  "Authorization_IdentityNotFound",
  "Authentication_RequestFromNonPremiumTenantOrB2CTenant",
  "Authentication_ExpiredToken",
  "InvalidAuthenticationToken",
  "Request_ResourceNotFound",
  "Request_BadRequest",
  "Request_UnsupportedQuery",
  "Directory_ResultSizeLimitExceeded",
  "BadRequest",
  "Unauthorized",
  "Forbidden",
  "NotFound",
  "TooManyRequests",
  "ServiceUnavailable",
  "InternalServerError",
  "UnknownError",
  "accessDenied",
  "activityLimitReached",
  "generalException",
  "itemNotFound",
  "serviceNotAvailable",
  // OAuth 2.0, OpenID Connect and MSAL
  "access_denied",
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "invalid_resource",
  "invalid_scope",
  "unauthorized_client",
  "unsupported_grant_type",
  "server_error",
  "temporarily_unavailable",
  "consent_required",
  "interaction_required",
  "login_required",
  "endpoints_resolution_error",
  "network_error",
  // Node.js and undici network errors
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ABORT_ERR",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_ABORTED",
]);
/** Error class names: "Error" or a PascalCase name ending in "Error". */
const NAME = /^(?:[A-Z][A-Za-z0-9]{0,60})?Error$/;

const codeOf = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") return null;
  const code = (value as Record<string, unknown>)[key];
  return typeof code === "string" && KNOWN_CODES.has(code) ? code : null;
};

/**
 * One line of error text for an ops alert, built from allowlisted fields
 * only: the class name, an HTTP status, and known error codes (`code`,
 * MSAL's `errorCode`, a network cause's `code`). Never the message.
 */
export const opsErrorText = (err: unknown): string => {
  const db = dbErrorFields(err);
  if (db) return dbErrorSummary(db);
  if (isQueryError(err)) return "Database error (query failed)";
  if (err instanceof OpsSafeError) return err.message.slice(0, 300);
  if (!(err instanceof Error)) return "Non-error value thrown";
  const fields = err as unknown as Record<string, unknown>;
  const parts = [NAME.test(err.name) ? err.name : "Error"];
  if (
    typeof fields.status === "number" &&
    Number.isInteger(fields.status) &&
    fields.status >= 100 &&
    fields.status <= 599
  )
    parts.push(`HTTP ${fields.status}`);
  for (const code of [
    codeOf(err, "code"),
    codeOf(err, "errorCode"),
    codeOf(err.cause, "code"),
  ]) {
    if (code && !parts.includes(code)) parts.push(code);
  }
  return parts.join(" ");
};
