import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, secretAad } from "./crypto";

const aad = secretAad("tenant-1", "adobe", "clientSecretEnc");

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
