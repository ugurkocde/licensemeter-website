import { describe, expect, it } from "vitest";

import { decryptWithKeys, deriveKey, encryptWithKey } from "./cryptoCore";
import {
  SECRET_COLUMNS,
  aadFor,
  planReencryption,
  readableWithKey,
} from "./secretReencryption";

const OLD = deriveKey("auth-secret-old-auth-secret-old-auth-secret-old");
const NEW = deriveKey("data-key-new-data-key-new-data-key-new-data-key");
const OTHER = deriveKey("unrelated-key-unrelated-key-unrelated-key-xx");

const [ms, adobe, saas] = SECRET_COLUMNS;

const stored = (
  column: (typeof SECRET_COLUMNS)[number],
  key: Buffer,
  provider: string,
) => {
  const row = { tenantId: "tenant-1", provider, value: "" };
  return {
    ...row,
    value: encryptWithKey("plain-secret", aadFor(column, row), key),
  };
};

describe("planReencryption", () => {
  it("re-encrypts a legacy secret under the new key", () => {
    const row = stored(adobe, OLD, "adobe");
    const plan = planReencryption(adobe, row, OLD, NEW);
    expect(plan.status).toBe("migrate");
    if (plan.status !== "migrate") return;
    expect(plan.value).not.toBe(row.value);
    expect(decryptWithKeys(plan.value, aadFor(adobe, row), [NEW])).toBe(
      "plain-secret",
    );
    expect(() =>
      decryptWithKeys(plan.value, aadFor(adobe, row), [OLD]),
    ).toThrow();
  });

  it("leaves a secret that already uses the new key alone (idempotent)", () => {
    const row = stored(ms, NEW, "microsoft");
    expect(planReencryption(ms, row, OLD, NEW)).toEqual({ status: "current" });
  });

  it("reports a secret readable with neither key as unreadable", () => {
    const row = stored(saas, OTHER, "zoom");
    expect(planReencryption(saas, row, OLD, NEW)).toEqual({
      status: "unreadable",
    });
  });

  it("binds the AAD to the SaaS provider of the row", () => {
    const row = stored(saas, OLD, "zoom");
    expect(
      planReencryption(saas, { ...row, provider: "atlassian" }, OLD, NEW),
    ).toEqual({ status: "unreadable" });
  });

  it("uses the same AAD as the app's encrypt sites", () => {
    expect(
      aadFor(ms, { tenantId: "t", provider: "microsoft", value: "" }),
    ).toBe("t:microsoft:secretEnc");
    expect(aadFor(adobe, { tenantId: "t", provider: "adobe", value: "" })).toBe(
      "t:adobe:clientSecretEnc",
    );
    expect(aadFor(saas, { tenantId: "t", provider: "zoom", value: "" })).toBe(
      "t:zoom:secretEnc",
    );
  });
});

describe("readableWithKey", () => {
  it("is true only for the key the value was written with", () => {
    const row = stored(adobe, NEW, "adobe");
    expect(readableWithKey(adobe, row, NEW)).toBe(true);
    expect(readableWithKey(adobe, row, OLD)).toBe(false);
  });
});
