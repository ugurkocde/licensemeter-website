/** Postgres unique_violation, as surfaced by postgres-js and PGlite (directly or as cause). */
export const isUniqueViolation = (err: unknown): boolean => {
  const code = (e: unknown): unknown =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;
  const cause =
    typeof err === "object" && err !== null && "cause" in err
      ? (err as { cause?: unknown }).cause
      : undefined;
  return code(err) === "23505" || code(cause) === "23505";
};
