import { describe, expect, it } from "vitest";

import { isAppAuthError, isConnectorCredentialError } from "./msAuthError";

describe("isConnectorCredentialError", () => {
  it("flags rejected LicenseMeter credentials", () => {
    expect(
      isConnectorCredentialError(
        "invalid_client: AADSTS7000215: Invalid client secret provided.",
      ),
    ).toBe(true);
    expect(
      isConnectorCredentialError(
        "invalid_client: AADSTS7000222: The provided client secret keys are expired.",
      ),
    ).toBe(true);
    expect(
      isConnectorCredentialError(
        "AADSTS700027: Client assertion failed signature validation.",
      ),
    ).toBe(true);
  });

  it("treats a missing enterprise app or consent as the tenant's side", () => {
    expect(
      isConnectorCredentialError(
        "invalid_client: Error(s): 7000229 - Description: AADSTS7000229: The client application is missing service principal in the tenant.",
      ),
    ).toBe(false);
    expect(
      isConnectorCredentialError(
        "unauthorized_client: AADSTS700016: Application was not found in the directory.",
      ),
    ).toBe(false);
  });

  it("is false without an error", () => {
    expect(isConnectorCredentialError(null)).toBe(false);
    expect(isConnectorCredentialError(undefined)).toBe(false);
    expect(isConnectorCredentialError("")).toBe(false);
  });
});

describe("isAppAuthError", () => {
  it("matches token-acquisition failures", () => {
    for (const message of [
      "invalid_client: AADSTS7000229: missing service principal",
      "AADSTS700016: Application was not found in the directory",
      "AADSTS7000222: client secret keys are expired",
      "Could not acquire app-only token",
    ]) {
      expect(isAppAuthError(message)).toBe(true);
    }
  });

  it("ignores data and network errors", () => {
    expect(isAppAuthError("fetch failed: getaddrinfo ENOTFOUND")).toBe(false);
    expect(isAppAuthError("Graph 429: too many requests")).toBe(false);
    expect(isAppAuthError("certificate in a Graph error body")).toBe(false);
  });
});
