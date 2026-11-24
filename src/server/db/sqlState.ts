/** Read a PostgreSQL SQLSTATE through Drizzle's query error wrapper. */
export function sqlState(error: unknown): string | undefined {
  while (error instanceof Error) {
    if (
      "code" in error &&
      typeof error.code === "string" &&
      /^[0-9A-Z]{5}$/.test(error.code)
    )
      return error.code;
    error = error.cause;
  }
}
