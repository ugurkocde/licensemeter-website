import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * verifyEntraIdToken pins issuer, audience and algorithm on top of MSAL's
 * TLS-direct redemption. The signature check + audience/alg pinning live inside
 * jose.jwtVerify (which needs a live remote JWKS), so we mock jose and assert:
 *
 *  - jwtVerify is invoked with the expected audience and algorithms: ["RS256"]
 *    (the wiring that pins audience + alg);
 *  - the module's own per-tenant issuer check accepts iss === .../{tid}/v2.0
 *    and REJECTS a mismatched issuer;
 *  - audience and algorithm REJECTIONS surface as thrown errors (we make the
 *    jose mock enforce them exactly as the real verifier would).
 *
 * The cryptographic signature verification against the real Microsoft JWKS is
 * deliberately NOT tested here — it requires a live network fetch and a real
 * Microsoft-signed token, which would be flaky and non-deterministic. We assert
 * the options we hand jose instead, which is the contract this module owns.
 */

type VerifyOpts = { audience?: string; algorithms?: string[] };

// The fake token encodes the claims + the header alg as JSON so the mock can
// model jose's audience/alg enforcement deterministically, no real crypto.
const makeToken = (claims: Record<string, unknown>, alg = "RS256"): string =>
  JSON.stringify({ claims, alg });

const jwtVerifyMock = vi.fn(
  async (token: string, _jwks: unknown, opts: VerifyOpts) => {
    const { claims, alg } = JSON.parse(token) as {
      claims: Record<string, unknown>;
      alg: string;
    };
    if (opts.algorithms && !opts.algorithms.includes(alg)) {
      throw new Error(`unsupported "alg" value: ${alg}`);
    }
    if (opts.audience !== undefined && claims.aud !== opts.audience) {
      throw new Error('unexpected "aud" claim value');
    }
    return { payload: claims, protectedHeader: { alg } };
  },
);

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ __jwks: true })),
  jwtVerify: jwtVerifyMock,
}));

const { verifyEntraIdToken } = await import("~/server/auth/verifyIdToken");

const TID = "11111111-1111-1111-1111-111111111111";
const AUD = "api://licensemeter-app";
const validClaims = {
  oid: "22222222-2222-2222-2222-222222222222",
  tid: TID,
  aud: AUD,
  iss: `https://login.microsoftonline.com/${TID}/v2.0`,
  name: "Ada Lovelace",
  email: "ada@contoso.com",
  preferred_username: "ada@contoso.com",
};

beforeEach(() => {
  jwtVerifyMock.mockClear();
});

describe("verifyEntraIdToken — happy path", () => {
  it("returns mapped claims for a valid token and pins audience + RS256", async () => {
    const result = await verifyEntraIdToken(makeToken(validClaims), AUD);
    expect(result).toEqual({
      oid: validClaims.oid,
      tid: validClaims.tid,
      name: "Ada Lovelace",
      email: "ada@contoso.com",
      preferred_username: "ada@contoso.com",
    });
    // Verify the options handed to jose pin audience and algorithm.
    expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
    const opts = jwtVerifyMock.mock.calls[0]![2];
    expect(opts.audience).toBe(AUD);
    expect(opts.algorithms).toEqual(["RS256"]);
  });

  it("omits optional string claims when they are absent or non-string", async () => {
    const result = await verifyEntraIdToken(
      makeToken({ oid: validClaims.oid, tid: TID, aud: AUD, iss: validClaims.iss, name: 42 }),
      AUD,
    );
    expect(result).toEqual({ oid: validClaims.oid, tid: TID });
  });
});

describe("verifyEntraIdToken — issuer pinning", () => {
  it("rejects a token whose iss does not match its tid", async () => {
    const claims = {
      ...validClaims,
      iss: "https://login.microsoftonline.com/99999999-9999-9999-9999-999999999999/v2.0",
    };
    await expect(verifyEntraIdToken(makeToken(claims), AUD)).rejects.toThrow(
      /issuer does not match tid/,
    );
  });

  it("rejects an issuer from a different identity provider", async () => {
    const claims = { ...validClaims, iss: "https://accounts.google.com" };
    await expect(verifyEntraIdToken(makeToken(claims), AUD)).rejects.toThrow(
      /issuer does not match tid/,
    );
  });
});

describe("verifyEntraIdToken — audience pinning (enforced by jose)", () => {
  it("rejects a token minted for a different audience", async () => {
    await expect(
      verifyEntraIdToken(makeToken({ ...validClaims, aud: "api://some-other-app" }), AUD),
    ).rejects.toThrow(/aud/);
  });
});

describe("verifyEntraIdToken — algorithm pinning (enforced by jose)", () => {
  it("rejects a token signed with a disallowed algorithm", async () => {
    // An HS256 / alg-confusion token must never pass RS256-only verification.
    await expect(
      verifyEntraIdToken(makeToken(validClaims, "HS256"), AUD),
    ).rejects.toThrow(/alg/);
    await expect(
      verifyEntraIdToken(makeToken(validClaims, "none"), AUD),
    ).rejects.toThrow(/alg/);
  });
});

describe("verifyEntraIdToken — required claims", () => {
  it("rejects when oid or tid is missing", async () => {
    await expect(
      verifyEntraIdToken(makeToken({ tid: TID, aud: AUD, iss: validClaims.iss }), AUD),
    ).rejects.toThrow(/missing oid\/tid/);
    await expect(
      verifyEntraIdToken(
        makeToken({ oid: validClaims.oid, aud: AUD, iss: validClaims.iss }),
        AUD,
      ),
    ).rejects.toThrow(/missing oid\/tid/);
  });
});
