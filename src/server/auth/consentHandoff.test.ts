import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import type * as ConsentState from "~/server/consentState";

const {
  getCookie,
  acquireTokenByCode,
  verifyEntraIdToken,
  loadPendingHandoff,
  notifyOps,
  setCookie,
} = vi.hoisted(() => ({
  getCookie: vi.fn(),
  acquireTokenByCode: vi.fn(),
  verifyEntraIdToken: vi.fn(),
  loadPendingHandoff: vi.fn(),
  notifyOps: vi.fn(),
  setCookie:
    vi.fn<(name: string, value: string, options: { maxAge: number }) => void>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: getCookie, set: setCookie }),
}));
vi.mock("~/server/consentState", async (original) => ({
  ...(await original<typeof ConsentState>()),
  loadPendingHandoff,
}));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("./msal", () => ({
  getSignInClient: () => ({ acquireTokenByCode }),
  signInRedirectUri: () =>
    "http://localhost:3000/api/auth/callback/microsoft-entra-id",
  SIGNIN_SCOPES: ["openid", "profile", "email"],
}));
vi.mock("./verifyIdToken", () => ({ verifyEntraIdToken }));

const {
  finishHandoffAuthentication,
  readHandoffProof,
  takeHandoffProof,
  setHandoffCompletion,
  readHandoffCompletion,
} = await import("./consentHandoff");
const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = "handoff.aaaa1111-1111-4111-8111-111111111111";
const tid = "bbbb2222-2222-4222-8222-222222222222";
const oid = "cccc3333-3333-4333-8333-333333333333";
const workspaceId = "dddd4444-4444-4444-8444-444444444444";
const account = "approver@example.com";
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
  loadPendingHandoff.mockResolvedValue({
    state: { state: token, tid, tenantId: workspaceId },
  });
  acquireTokenByCode.mockResolvedValue({ idToken: "entra-id-token" });
});

it.each([
  "62e90394-69f5-4237-9190-012177145e10",
  "e8611ab8-c189-46e8-94e1-60213ab1f814",
])(
  "requires confirmation for a signed eligible admin role (%s)",
  async (role) => {
    verifyEntraIdToken.mockResolvedValue({
      tid,
      oid,
      preferred_username: account,
      directoryRoles: [role],
    });
    const result = await finishHandoffAuthentication(request);
    expect(acquireTokenByCode).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: "pkce-proof" }),
    );
    expect(result?.headers.get("location")).toMatch(
      /\/connect\/approve\/confirm$/,
    );
    expect(result?.cookies.getAll().map(({ name }) => name)).toEqual([
      "lm_consent",
    ]);
    getCookie.mockReturnValue({
      value: result?.cookies.get("lm_consent")?.value,
    });
    expect(await readHandoffProof()).toEqual({
      token,
      phase: "confirm",
      tid,
      oid,
      account,
    });
  },
);

it("fails closed for a verified Microsoft identity without an eligible role", async () => {
  verifyEntraIdToken.mockResolvedValue({
    tid,
    oid,
    directoryRoles: ["not-an-eligible-role"],
  });
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(
    "/connect/approve/error?error=approval_role_ineligible",
  );
});

it("returns to the public error page when the browser proof has expired", async () => {
  getCookie.mockReturnValue(undefined);
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(
    "/connect/approve/error?error=invalid_state",
  );
  expect(acquireTokenByCode).not.toHaveBeenCalled();
});

it.each([
  [{ tid, oid }, "approval_roles_missing"],
  [
    { tid: oid, oid, directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"] },
    "approval_tenant",
  ],
])("reports %j as %s", async (claims, reason) => {
  verifyEntraIdToken.mockResolvedValue(claims);
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(`error=${reason}`);
  expect(notifyOps).toHaveBeenCalledWith(
    expect.stringContaining(`${reason} for workspace ${workspaceId}`),
    expect.anything(),
  );
});

it("clears the authorizing cookie and keeps completion proof separate", async () => {
  expect(await takeHandoffProof()).toMatchObject({ token });
  expect(setCookie).toHaveBeenCalledWith(
    "lm_consent",
    "",
    expect.objectContaining({ maxAge: 0 }),
  );
  await setHandoffCompletion(token);
  const [name, value, options] = setCookie.mock.lastCall!;
  expect(name).toBe("lm_consent_completed");
  expect(options).toMatchObject({ maxAge: 300 });
  getCookie.mockReturnValue({ value });
  expect(await readHandoffCompletion()).toBe(token);
  expect(await readHandoffProof()).toBeNull();
});
