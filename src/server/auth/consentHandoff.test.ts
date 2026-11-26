import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import type * as ConsentState from "~/server/consentState";
import { HANDOFF_USED_RETENTION_MS } from "~/server/consentState";
import type * as RateLimit from "~/server/rateLimit";

const {
  getCookie,
  acquireTokenByCode,
  verifyEntraIdToken,
  loadPendingHandoff,
  notifyOps,
  rateLimitDurable,
  setCookie,
} = vi.hoisted(() => ({
  getCookie: vi.fn(),
  acquireTokenByCode: vi.fn(),
  verifyEntraIdToken: vi.fn(),
  loadPendingHandoff: vi.fn(),
  notifyOps: vi.fn(),
  rateLimitDurable: vi.fn(),
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
vi.mock("~/server/rateLimit", async (original) => ({
  ...(await original<typeof RateLimit>()),
  rateLimitDurable,
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("./msal", () => ({
  getSignInClient: () => ({ acquireTokenByCode }),
  signInRedirectUri: () =>
    "http://localhost:3000/api/auth/callback/microsoft-entra-id",
  SIGNIN_SCOPES: ["openid", "profile", "email"],
}));
vi.mock("./verifyIdToken", () => ({ verifyEntraIdToken }));

const {
  allowHandoffRequest,
  clearHandoffProof,
  finishHandoffAuthentication,
  readHandoffProof,
  setHandoffCompletion,
  readHandoffCompletion,
} = await import("./consentHandoff");
const { POST } = await import("~/app/api/connect/approve/route");
const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = "handoff.aaaa1111-1111-4111-8111-111111111111";
const tid = "bbbb2222-2222-4222-8222-222222222222";
const oid = "cccc3333-3333-4333-8333-333333333333";
const workspaceId = "dddd4444-4444-4444-8444-444444444444";
const account = "approver@example.com";
const request = new NextRequest(
  "https://www.example.com/api/auth/callback/microsoft-entra-id?code=example&state=handoff-auth.example",
);

beforeEach(async () => {
  vi.clearAllMocks();
  rateLimitDurable.mockResolvedValue(true);
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
  "62E90394-69F5-4237-9190-012177145E10",
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
      expect.objectContaining({
        codeVerifier: "pkce-proof",
        redirectUri:
          "http://localhost:3000/api/auth/callback/microsoft-entra-id",
      }),
    );
    expect(result?.headers.get("location")).toBe(
      "https://www.example.com/connect/approve/confirm",
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

it.each([
  [undefined, "approval_roles_missing"],
  [["not-an-eligible-role"], "approval_role_ineligible"],
])(
  "shares public role guidance for %j and logs %s",
  async (directoryRoles, reason) => {
    const info = vi.spyOn(console, "info").mockReturnValue(undefined);
    try {
      verifyEntraIdToken.mockResolvedValue({ tid, oid, directoryRoles });
      const result = await finishHandoffAuthentication(request);
      expect(result?.headers.get("location")).toBe(
        "https://www.example.com/connect/approve/error?error=approval_role_ineligible",
      );
      expect(info).toHaveBeenCalledWith(expect.stringContaining(reason));
      expect(notifyOps).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  },
);

it("returns to the public error page when the browser proof has expired", async () => {
  getCookie.mockReturnValue(undefined);
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain(
    "/connect/approve/error?error=invalid_state",
  );
  expect(acquireTokenByCode).not.toHaveBeenCalled();
});

it("reports a verified identity from the wrong tenant", async () => {
  verifyEntraIdToken.mockResolvedValue({ tid: oid, oid });
  const result = await finishHandoffAuthentication(request);
  expect(result?.headers.get("location")).toContain("error=approval_tenant");
  expect(notifyOps).toHaveBeenCalledWith(
    expect.stringContaining(`approval_tenant for workspace ${workspaceId}`),
    expect.anything(),
  );
});

it("bounds unknown IPs separately and keeps the existing limit for trusted IPs", async () => {
  rateLimitDurable.mockResolvedValue(false);
  expect(await allowHandoffRequest("submit", new Headers())).toBe(false);
  expect(rateLimitDurable).toHaveBeenCalledWith(
    "consent-handoff:submit:unknown",
    300,
    60_000,
    "deny",
  );
  expect(
    await allowHandoffRequest(
      "submit",
      new Headers({ "x-real-ip": "192.0.2.1" }),
    ),
  ).toBe(false);
  expect(rateLimitDurable).toHaveBeenCalledWith(
    "consent-handoff:submit:192.0.2.1",
    30,
    60_000,
    "deny",
  );
});

it("returns the public rate-limit error before redeeming the code", async () => {
  rateLimitDurable.mockResolvedValue(false);
  const response = await finishHandoffAuthentication(request);
  expect(response?.headers.get("location")).toBe(
    "https://www.example.com/connect/approve/error?error=rate_limited",
  );
  expect(rateLimitDurable).toHaveBeenCalledWith(
    "consent-handoff:callback:unknown",
    300,
    60_000,
    "deny",
  );
  expect(acquireTokenByCode).not.toHaveBeenCalled();
});

it.each([
  [token, true],
  ["handoff.eeee5555-5555-4555-8555-555555555555", false],
  [null, false],
])(
  "only accepts the token shown on the confirmation page (%s)",
  async (shownToken, valid) => {
    const currentProof = await new SignJWT({
      phase: "confirm",
      token,
      tid,
      oid,
      account,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("licensemeter-consent-handoff")
      .setExpirationTime("1m")
      .sign(key);
    getCookie.mockReturnValue({ value: currentProof });
    const body = new URLSearchParams({ intent: "confirm" });
    if (shownToken) body.set("token", shownToken);
    const response = await POST(
      new NextRequest("https://www.example.com/api/connect/approve", {
        method: "POST",
        headers: { origin: "https://www.example.com" },
        body,
      }),
    );
    const location = response.headers.get("location");
    if (valid) {
      expect(location).toContain("https://login.microsoftonline.com/");
      expect(new URL(location!).searchParams.get("state")).toBe(token);
    } else {
      expect(location).toBe(
        "https://www.example.com/connect/approve/error?error=invalid_state",
      );
      expect(loadPendingHandoff).not.toHaveBeenCalled();
    }
  },
);

it("clears the authorizing cookie and keeps completion proof separate", async () => {
  await clearHandoffProof();
  expect(setCookie).toHaveBeenCalledWith(
    "lm_consent",
    "",
    expect.objectContaining({ maxAge: 0 }),
  );
  await setHandoffCompletion(token, new Date());
  const [name, value, options] = setCookie.mock.lastCall!;
  expect(name).toBe("lm_consent_completed");
  expect(options).toMatchObject({ maxAge: 300 });
  getCookie.mockReturnValue({ value });
  expect(await readHandoffCompletion()).toBe(token);
  expect(await readHandoffProof()).toBeNull();
});

it("never lets the completion marker outlive the used row", async () => {
  const now = Date.now();
  const minute = 60_000;
  // Issued eight minutes after the link was consumed: only the rest of the
  // ten-minute retention window remains.
  expect(
    await setHandoffCompletion(token, new Date(now - 8 * minute), now),
  ).toBe(true);
  const [, value, options] = setCookie.mock.lastCall!;
  expect(options).toMatchObject({ maxAge: 120 });
  const { exp } = JSON.parse(
    Buffer.from(String(value).split(".")[1]!, "base64url").toString(),
  ) as { exp: number };
  expect(exp * 1000).toBeLessThanOrEqual(
    now - 8 * minute + HANDOFF_USED_RETENTION_MS,
  );

  setCookie.mockClear();
  expect(
    await setHandoffCompletion(token, new Date(now - 11 * minute), now),
  ).toBe(false);
  expect(setCookie).not.toHaveBeenCalled();
});
