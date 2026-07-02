import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptSecret, encryptSecret, secretAad } from "./crypto";

const aad = secretAad("tenant-1", "adobe", "clientSecretEnc");

// A fresh crypto module bound to a specific env, for the rotation test below.
const cryptoWithEnv = async (envValues: {
  AUTH_SECRET: string;
  DATA_ENCRYPTION_KEY?: string;
}) => {
  vi.resetModules();
  vi.doMock("~/env", () => ({ env: envValues }));
  return import("./crypto");
};

const OLD = "auth-secret-old-auth-secret-old-auth-secret-old";
const NEW = "data-key-new-data-key-new-data-key-new-data-key";

describe("encryptSecret/decryptSecret with AAD", () => {
  it("round-trips with the same AAD", () => {
    const enc = encryptSecret("super-secret-value", aad);
    expect(enc).not.toContain("super-secret-value");
    expect(decryptSecret(enc, aad)).toBe("super-secret-value");
  });

  it("round-trips unicode and long secrets", () => {
    for (const plain of ["🔐 ünïcödé", "a".repeat(4096)]) {
      const enc = encryptSecret(plain, aad);
      expect(decryptSecret(enc, aad)).toBe(plain);
    }
  });

  it("fails to decrypt when the AAD differs (context confusion guard)", () => {
    const enc = encryptSecret("secret", aad);
    // Wrong tenant
    expect(() =>
      decryptSecret(enc, secretAad("tenant-2", "adobe", "clientSecretEnc")),
    ).toThrow();
    // Wrong provider
    expect(() =>
      decryptSecret(enc, secretAad("tenant-1", "microsoft", "clientSecretEnc")),
    ).toThrow();
    // Wrong column
    expect(() =>
      decryptSecret(enc, secretAad("tenant-1", "adobe", "secretEnc")),
    ).toThrow();
  });

  it("produces a distinct ciphertext per call (random IV)", () => {
    expect(encryptSecret("x", aad)).not.toBe(encryptSecret("x", aad));
  });

  it("throws on a malformed ciphertext", () => {
    expect(() => decryptSecret("not-a-valid-blob", aad)).toThrow(
      /Malformed encrypted secret/,
    );
  });

  it("builds the canonical AAD string", () => {
    expect(secretAad("t", "p", "c")).toBe("t:p:c");
  });
});

describe("DATA_ENCRYPTION_KEY rotation", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("~/env");
  });

  it("decrypts legacy AUTH_SECRET ciphertext after rotating to a distinct key", async () => {
    // Before rotation: no DATA_ENCRYPTION_KEY, so writes use AUTH_SECRET.
    const before = await cryptoWithEnv({ AUTH_SECRET: OLD });
    const legacyEnc = before.encryptSecret("rotate-me", aad);

    // After rotation: distinct DATA_ENCRYPTION_KEY. New writes use the new key,
    // but the legacy AUTH_SECRET ciphertext must still decrypt (fallback path).
    const after = await cryptoWithEnv({ AUTH_SECRET: OLD, DATA_ENCRYPTION_KEY: NEW });
    expect(after.decryptSecret(legacyEnc, aad)).toBe("rotate-me");

    const newEnc = after.encryptSecret("new-write", aad);
    expect(after.decryptSecret(newEnc, aad)).toBe("new-write");

    // A deploy that later drops AUTH_SECRET back-compat (no legacy key) can no
    // longer read the new-key ciphertext, confirming new writes use the new key.
    const newOnly = await cryptoWithEnv({ AUTH_SECRET: NEW });
    expect(newOnly.decryptSecret(newEnc, aad)).toBe("new-write");
    const legacyOnly = await cryptoWithEnv({ AUTH_SECRET: OLD });
    expect(() => legacyOnly.decryptSecret(newEnc, aad)).toThrow();
  });
});
