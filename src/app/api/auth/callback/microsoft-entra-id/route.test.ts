import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import type * as NextServer from "next/server";
import type * as SessionModule from "~/server/auth/session";
import type * as VerifyIdTokenModule from "~/server/auth/verifyIdToken";
import type * as SigninStatsModule from "~/server/signinStats";

const tid = "11111111-2222-4333-8444-555555555555";
const oid = "22222222-3333-4444-8555-666666666666";
const recordSignin = vi.fn();
const readOAuthCookie = vi.fn<() => Promise<SessionModule.OAuthPayload>>();

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: vi.fn(),
}));

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/access", () => ({
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));
vi.mock("~/server/auth", () => ({
  auth: async () => ({ user: { oid, tid } }),
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/email", () => ({
  emailEnabled: () => false,
  sendEmail: vi.fn(),
}));
vi.mock("~/server/scan", () => ({
  resolveScanTenant: async () => ({ ok: true, tenantId: tid }),
  runDelegatedScan: vi.fn(),
}));
vi.mock("~/server/auth/msal", () => ({
  getScanClient: () => ({
    acquireTokenByCode: async () => ({ accessToken: "test-access-token" }),
  }),
  SCAN_SCOPES: [],
  getSignInClient: () => ({
    acquireTokenByCode: async () => ({ idToken: "test-token" }),
  }),
  signInRedirectUri: () =>
    "http://localhost/api/auth/callback/microsoft-entra-id",
  SIGNIN_SCOPES: [],
}));
vi.mock("~/server/auth/verifyIdToken", async (importOriginal) => ({
  ...(await importOriginal<typeof VerifyIdTokenModule>()),
  verifyEntraIdToken: async () => ({
    oid,
    tid,
  }),
}));
vi.mock("~/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  createSessionToken: async () => "test-session",
  readOAuthCookie,
}));
vi.mock("~/server/signinStats", async (importOriginal) => ({
  ...(await importOriginal<typeof SigninStatsModule>()),
  recordSignin,
}));

const { GET } = await import("./route");

const request = () =>
  new NextRequest(
    "http://localhost/api/auth/callback/microsoft-entra-id?code=test-code&state=test-state",
    { headers: { host: "localhost" } },
  );

const oauth = { state: "test-state", verifier: "test-verifier" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([1, 2])(
  "logs only the first successful sign-in (count %i)",
  async (count) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    readOAuthCookie.mockResolvedValue(oauth);
    recordSignin.mockResolvedValue(count);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = await GET(request());

    expect(response.status).toBe(307);
    if (count === 1) {
      expect(info).toHaveBeenCalledExactlyOnceWith(
        `[ops] first sign-in from Microsoft tenant ${tid}`,
      );
    } else {
      expect(info).not.toHaveBeenCalled();
    }
    expect(error).not.toHaveBeenCalled();
  },
);

it("logs a successful instant scan start at info level", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "");
  readOAuthCookie.mockResolvedValue({ ...oauth, kind: "scan" });
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await GET(request());

  expect(response.headers.get("location")).toBe(
    "http://localhost/app/connectors/microsoft?status=syncing",
  );
  expect(info).toHaveBeenCalledExactlyOnceWith(
    `[ops] instant scan started for workspace ${tid}`,
  );
  expect(error).not.toHaveBeenCalled();
});
