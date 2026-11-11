import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { enforceDatabaseTls, resolvePostgresSsl } from "./ssl";

const enforce = { enforce: true };
const url = (query = "") =>
  `postgres://app:p%40ss@db.example.supabase.co:6543/postgres${query}`;

/**
 * The TLS mode postgres.js itself ends up with for this URL, given the option
 * the app passes. Creating the client does not connect.
 */
const driverSsl = (connection: string): unknown => {
  const ssl = resolvePostgresSsl(connection, enforce);
  const sql = postgres(connection, { max: 1, ...(ssl ? { ssl } : {}) });
  return (sql.options as { ssl: unknown }).ssl;
};

describe("resolvePostgresSsl", () => {
  it("requires TLS when the URL has no TLS setting", () => {
    expect(resolvePostgresSsl(url(), enforce)).toBe("require");
    expect(driverSsl(url())).toBe("require");
  });

  it("keeps a mode that requires or verifies TLS, and the driver uses it", () => {
    for (const [mode, effective] of [
      ["require", "require"],
      ["verify-ca", "verify-full"],
      ["verify-full", "verify-full"],
    ]) {
      expect(resolvePostgresSsl(url(`?sslmode=${mode}`), enforce)).toBe(
        effective,
      );
      expect(driverSsl(url(`?sslmode=${mode}`))).toBe(effective);
    }
    expect(resolvePostgresSsl(url("?ssl=true"), enforce)).toBe("require");
  });

  it("overrides a weaker value the driver would otherwise read last", () => {
    // postgres.js reads the last sslmode; a repeated parameter is refused.
    expect(() =>
      resolvePostgresSsl(url("?sslmode=require&sslmode=disable"), enforce),
    ).toThrow(/repeats sslmode/);
  });

  it("rejects settings that can end up in plaintext or are ambiguous", () => {
    for (const q of [
      "?sslmode=disable",
      "?sslmode=allow",
      "?sslmode=prefer",
      "?sslmode=",
      "?ssl=",
      "?ssl=false",
      "?sslmode=REQUIRE",
      "?sslmode=bogus",
      "?sslmode=require&ssl=true",
      "?ssl=true&ssl=false",
      "?sslrootcert=/etc/ssl/ca.pem",
      "?sslrootcert=system",
      "?sslrootcert=system&sslmode=require",
      "?sslrootcert=system&sslmode=verify-full",
    ]) {
      expect(() => resolvePostgresSsl(url(q), enforce), q).toThrow(
        /requires TLS/,
      );
    }
  });

  it("never puts the connection string into an error", () => {
    let message = "";
    try {
      resolvePostgresSsl(url("?sslmode=disable"), enforce);
    } catch (err) {
      message = String(err);
    }
    expect(message).toContain("sslmode=disable");
    expect(message).not.toContain("p%40ss");
    expect(message).not.toContain("example.supabase.co");
    expect(() => resolvePostgresSsl("not a url p@ss", enforce)).toThrow(
      "DATABASE_URL is not a valid connection URL",
    );
  });

  it("leaves local connections and unenforced environments to the URL", () => {
    expect(
      resolvePostgresSsl("postgres://u:p@localhost:5432/db", enforce),
    ).toBe(undefined);
    expect(
      resolvePostgresSsl("postgres://u:p@127.0.0.1:5432/db", enforce),
    ).toBe(undefined);
    expect(
      resolvePostgresSsl(url("?sslmode=disable"), { enforce: false }),
    ).toBe(undefined);
  });
});

describe("enforceDatabaseTls", () => {
  it("applies to hosted production only", () => {
    expect(enforceDatabaseTls("production", undefined)).toBe(true);
    expect(enforceDatabaseTls("production", "false")).toBe(true);
    expect(enforceDatabaseTls("production", "true")).toBe(false);
    expect(enforceDatabaseTls("development", undefined)).toBe(false);
    expect(enforceDatabaseTls("test", undefined)).toBe(false);
  });
});
