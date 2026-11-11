/**
 * TLS policy for the Postgres connection. postgres.js connects in plaintext
 * unless told otherwise, so hosted production must not depend on what the
 * connection string happens to say.
 *
 * With `enforce`, the URL's TLS settings are validated and the effective
 * mode is returned, for the caller to pass as the explicit `ssl` option (an
 * explicit option overrides the URL in postgres.js):
 * - no TLS setting: "require" (encrypted; the server certificate is not
 *   verified, like libpq's sslmode=require)
 * - sslmode=require, ssl=true: "require"
 * - sslmode=verify-ca or verify-full, sslrootcert=system: "verify-full"
 *   (postgres.js verifies the certificate and host name for both)
 * - anything else throws: disable, allow, prefer, an empty or unknown value,
 *   a repeated parameter, sslmode together with ssl, or a certificate file
 *   path the driver would ignore
 * - localhost: undefined (a local socket or tunnel; the URL decides)
 *
 * Without `enforce` (development, tests, self-hosted Docker with its internal
 * database) it returns undefined and the URL alone decides, as before.
 *
 * Errors never include the connection string, which carries the password.
 */
export type PostgresSsl = "require" | "verify-full";

const ACCEPTED: ReadonlySet<string> = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const TLS_PARAMS = ["sslmode", "ssl", "sslrootcert"] as const;

const refuse = (reason: string): never => {
  throw new Error(
    `DATABASE_URL ${reason}; production requires TLS (sslmode=require or stricter)`,
  );
};

export const resolvePostgresSsl = (
  databaseUrl: string,
  { enforce }: { enforce: boolean },
): PostgresSsl | undefined => {
  if (!enforce) return undefined;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }
  if (LOCAL_HOSTS.has(url.hostname)) return undefined;

  const params = url.searchParams;
  for (const name of TLS_PARAMS) {
    if (params.getAll(name).length > 1) refuse(`repeats ${name}`);
  }
  const sslmode = params.get("sslmode");
  const ssl = params.get("ssl");
  const rootcert = params.get("sslrootcert");
  if (sslmode !== null && ssl !== null) refuse("sets both sslmode and ssl");
  if (rootcert !== null && rootcert !== "system")
    refuse("sets sslrootcert to a file, which the driver does not read");

  const mode = sslmode ?? (ssl === "true" ? "require" : ssl);
  if (rootcert === "system") {
    if (mode !== null && mode !== "verify-full")
      refuse("combines sslrootcert=system with another mode");
    return "verify-full";
  }
  if (mode === null) return "require";
  if (mode === "") refuse("sets an empty TLS mode");
  if (!ACCEPTED.has(mode)) refuse(`sets sslmode=${mode.slice(0, 20)}`);
  return mode === "require" ? "require" : "verify-full";
};

/** Hosted production enforces TLS; self-hosted installs keep their own setup. */
export const enforceDatabaseTls = (
  nodeEnv: string | undefined,
  selfHosted: string | undefined,
): boolean => nodeEnv === "production" && selfHosted !== "true";
