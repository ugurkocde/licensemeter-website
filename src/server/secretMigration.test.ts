import { beforeEach, describe, expect, it, vi } from "vitest";

const env: Record<string, string | undefined> = {};
vi.mock("~/env", () => ({ env }));
vi.mock("~/server/db", () => ({ db: {} }));
const reencryptSecrets = vi.fn(async () => ({
  dryRun: false,
  reencrypted: 0,
  columns: {},
}));
vi.mock("~/server/secretReencryption", () => ({ reencryptSecrets }));

const { migrateLegacySecrets } = await import("./secretMigration");

const AUTH = "auth-secret-auth-secret-auth-secret-auth-secret";
const DATA = "data-key-data-key-data-key-data-key-data-key-xx";

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  reencryptSecrets.mockClear();
});

describe("migrateLegacySecrets", () => {
  it("skips without a distinct key", async () => {
    Object.assign(env, { NODE_ENV: "production", AUTH_SECRET: AUTH });
    expect(await migrateLegacySecrets()).toEqual({ skipped: "noDistinctKey" });
    Object.assign(env, { DATA_ENCRYPTION_KEY: AUTH });
    expect(await migrateLegacySecrets()).toEqual({ skipped: "noDistinctKey" });
    expect(reencryptSecrets).not.toHaveBeenCalled();
  });

  it("does not use the old key in production once the fallback flag is removed", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      AUTH_SECRET: AUTH,
      DATA_ENCRYPTION_KEY: DATA,
    });
    expect(await migrateLegacySecrets()).toEqual({
      skipped: "legacyKeyNotAllowed",
    });
    expect(reencryptSecrets).not.toHaveBeenCalled();
  });

  it("migrates in production while the fallback flag is set", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      AUTH_SECRET: AUTH,
      DATA_ENCRYPTION_KEY: DATA,
      ENCRYPTION_LEGACY_FALLBACK: "true",
    });
    await migrateLegacySecrets();
    expect(reencryptSecrets).toHaveBeenCalledOnce();
  });
});
