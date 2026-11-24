import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

const tid = "11111111-2222-4333-8444-555555555555";
const recordSignin = vi.fn();

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/access", () => ({}));
vi.mock("~/server/auth", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/email", () => ({
  emailEnabled: () => false,
  sendEmail: vi.fn(),
}));
vi.mock("~/server/scan", () => ({}));
vi.mock("~/server/auth/msal", () => ({
  getSignInClient: () => ({
    acquireTokenByCode: async () => ({ idToken: "test-token" }),
  }),
  signInRedirectUri: () =>
    "http://localhost/api/auth/callback/microsoft-entra-id",
  SIGNIN_SCOPES: [],
}));
vi.mock("~/server/auth/verifyIdToken", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/auth/verifyIdToken")>()),
  verifyEntraIdToken: async () => ({
    oid: "22222222-3333-4444-8555-666666666666",
    tid,
  }),
}));
vi.mock("~/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/auth/session")>()),
  createSessionToken: async () => "test-session",
  readOAuthCookie: async () => ({
    kind: "signin",
    state: "test-state",
    verifier: "test-verifier",
  }),
}));
vi.mock("~/server/signinStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/signinStats")>()),
  recordSignin,
}));

const { GET } = await import("./route");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([1, 2])(
  "logs only the first successful sign-in (count %i)",
  async (count) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    recordSignin.mockResolvedValue(count);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = await GET(
      new NextRequest(
        "http://localhost/api/auth/callback/microsoft-entra-id?code=test-code&state=test-state",
        {
          headers: { host: "localhost" },
        },
      ),
    );

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
