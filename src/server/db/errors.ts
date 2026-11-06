/** The Postgres error code of err or its cause, as surfaced by postgres-js and PGlite. */
const pgCode = (err: unknown): unknown => {
  const code = (e: unknown): unknown =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;
  const cause =
    typeof err === "object" && err !== null && "cause" in err
      ? (err as { cause?: unknown }).cause
      : undefined;
  return code(err) ?? code(cause);
};

/** Postgres unique_violation, as surfaced by postgres-js and PGlite (directly or as cause). */
export const isUniqueViolation = (err: unknown): boolean =>
  pgCode(err) === "23505";

/**
 * Postgres undefined_column: the code is newer than the database schema, as
 * happens when a release ships before its hand-run hosted SQL script.
 */
export const isUndefinedColumn = (err: unknown): boolean =>
  pgCode(err) === "42703";
