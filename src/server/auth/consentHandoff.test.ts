import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import type * as ConsentState from "~/server/consentState";

const {
  getCookie,
  acquireTokenByCode,
  verifyEntraIdToken,
  loadPendingHandoff,
  microsoftConsentUrl,
} = vi.hoisted(() => ({
  getCookie: vi.fn(),
  acquireTokenByCode: vi.fn(),
  verifyEntraIdToken: vi.fn(),
  loadPendingHandoff: vi.fn(),
  microsoftConsentUrl: vi.fn(
    () => "https://login.microsoftonline.com/example/v2.0/adminconsent",
  ),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock("~/server/consentState", async (original) => ({
  ...(await original<typeof ConsentState>()),
  loadPendingHandoff,
  microsoftConsentUrl,
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("./msal", () => ({
  getSignInClient: () => ({ acquireTokenByCode }),
  signInRedirectUri: () =>
    "http://localhost:3000/api/auth/callback/microsoft-entra-id",
  SIGNIN_SCOPES: ["openid", "profile", "email"],
}));
vi.mock("./verifyIdToken", () => ({ verifyEntraIdToken }));

const { finishHandoffAuthentication, readHandoffProof } =
  await import("./consentHandoff");
const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = "handoff.aaaa1111-1111-4111-8111-111111111111";
const tid = "bbbb2222-2222-4222-8222-222222222222";
const request = new NextRequest(
  "http://localhost:3000/api/auth/callback/microsoft-entra-id?code=example&state=handoff-auth.example",
);

beforeEach(async () => {
  vi.clearAllMocks();
  const draft = await new SignJWT({
    phase: "authenticate",
    token,
    state: "handoff-auth.example",
    verifier: "pkce-proof",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("licensemeter-consent-handoff")
    .setExpirationTime("1m")
    .sign(key);
  getCookie.mockReturnValue({ value: draft });
  loadPendingHandoff.mockResolvedValue({ state: { state: token } });
  acquireTokenByCode.mockResolvedValue({ idToken: "entra-id-token" });
});

it.each([
  "62e90394-69f5-4237-9190-012177145e10",
  "e8611ab8-c189-46e8-94e1-60213ab1f814",
])(
  "constrains consent to the tenant from the signed admin role (%s)",
  async (role) => {
    verifyEntraIdToken.mockResolvedValue({ tid, directoryRoles: [role] });
    const result = await finishHandoffAuthentication(request);
    expect(acquireTokenByCode).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: "pkce-proof" }),
    );
    expect(microsoftConsentUrl).toHaveBeenCalledExactlyOnceWith(token, tid);
    expect(result?.headers.get("location")).toMatch(/\/adminconsent$/);
    expect(result?.cookies.getAll().map(({ name }) => name)).toEqual([
      "lm_consent",
    ]);
    getCookie.mockReturnValue({
      value: result?.cookies.get("lm_consent")?.value,
    });
    expect(await readHandoffProof()).toEqual({ token, phase: "grant", tid });
  },
);

it("fails closed for a verified Microsoft identity without an eligible role", async () => {
  verifyEntraIdToken.mockResolvedValue({
    tid,
    directoryRoles: ["not-an-eligible-role"],
  });
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(
    "/connect/approve/error?error=approval_identity",
  );
  expect(microsoftConsentUrl).not.toHaveBeenCalled();
});

it("returns to the public error page when the browser proof has expired", async () => {
  getCookie.mockReturnValue(undefined);
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(
    "/connect/approve/error?error=invalid_state",
  );
  expect(acquireTokenByCode).not.toHaveBeenCalled();
});
