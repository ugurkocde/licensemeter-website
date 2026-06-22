import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { env } from "~/env";

/**
 * Cookie-based sessions, MSAL-friendly: a compact HS256 JWT holding only the
 * user's own identity claims (nothing confidential to its holder).
 */

/**
 * __Host- prefix in production locks the cookie to this exact host over HTTPS
 * (no subdomain override). Plain names in dev where http://localhost is used.
 */
const isProd = env.NODE_ENV === "production";
export const SESSION_COOKIE = isProd ? "__Host-lm_session" : "lm_session";
export const OAUTH_COOKIE = isProd ? "__Host-lm_oauth" : "lm_oauth";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const OAUTH_MAX_AGE = 10 * 60; // state+verifier live only for the redirect leg

const key = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionUser = {
  /**
   * Stable actor id. In entra mode: the Entra object id (or demo constant).
   * In workos mode: empty here — the WorkOS identity travels in workosUserId,
   * and the access layer projects it onto the actor id it returns.
   */
  oid: string;
  /**
   * Entra tenant id (or the demo constant) in entra mode. Empty in workos mode:
   * the Microsoft tenant is a property of the connector, not of the login.
   */
  tid: string;
  /** UPN / preferred_username (entra) or email (workos). */
  upn: string;
  name: string;
  email: string | null;
  isDemo: boolean;
  /** WorkOS user id, present only when AUTH_PROVIDER=workos. */
  workosUserId?: string;
  /** Active WorkOS Organization id, when the token carries one. */
  workosOrgId?: string;
  /** Whether WorkOS reports the email as verified (gates email-based linking). */
  emailVerified?: boolean;
};

export type Session = { user: SessionUser };

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export const sessionCookieOptions = () => cookieOptions(SESSION_MAX_AGE);
export const oauthCookieOptions = () => cookieOptions(OAUTH_MAX_AGE);

/**
 * Deleting a cookie is itself a Set-Cookie, and browsers reject any
 * Set-Cookie for a __Host- name that lacks Secure. A bare delete() emits no
 * attributes, so in production it is silently ignored and the cookie
 * survives. Always expire with exactly the attributes the cookie was set
 * with (path "/", httpOnly, sameSite, secure in prod); maxAge 0 kills it.
 */
const expiredCookie = (name: string) => ({
  name,
  value: "",
  ...cookieOptions(0),
});

export const expiredSessionCookie = () => expiredCookie(SESSION_COOKIE);
export const expiredOAuthCookie = () => expiredCookie(OAUTH_COOKIE);

/**
 * Post-sign-in destinations are restricted to in-app paths: must start with
 * "/app" and carry no protocol-relative ("//"), absolute ("://"), backslash
 * or CR/LF trickery. Returns null for anything invalid or absent; callers
 * fall back to their default. Applied when the signin route mints the OAuth
 * cookie AND again when the callback consumes it: the cookie is signed, not
 * trusted.
 */
export const validateReturnTo = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;
  if (!value.startsWith("/app") || value.startsWith("//")) return null;
  if (value.includes("://") || /[\\\r\n]/.test(value)) return null;
  return value;
};

export const createSessionToken = async (user: SessionUser): Promise<string> =>
  new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key);

/**
 * Which redirect flow the OAuth cookie belongs to. Absent (legacy payloads
 * and the regular sign-in) means sign-in; "scan" marks the delegated
 * instant-scan flow, which shares the registered redirect URI.
 */
export type OAuthFlowKind = "scan";

export type OAuthPayload = {
  state: string;
  verifier: string;
  kind?: OAuthFlowKind;
  /** Validated in-app path to land on after sign-in; absent means default. */
  returnTo?: string;
};

/** State + PKCE verifier for the in-flight OAuth redirect, integrity-protected. */
export const createOAuthToken = async (
  payload: OAuthPayload,
): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_MAX_AGE}s`)
    .sign(key);

const verifyToken = async <T>(token: string | undefined): Promise<T | null> => {
  if (!token) return null;
  try {
    // Pin to the exact algorithm used at issuance.
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
};

/** Current session from the request cookies; null when absent or invalid. */
export const auth = async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifyToken<SessionUser>(token);
  if (!payload?.oid || !payload?.tid) return null;
  return {
    user: {
      oid: payload.oid,
      tid: payload.tid,
      upn: payload.upn ?? "",
      name: payload.name ?? "",
      email: payload.email ?? null,
      isDemo: payload.isDemo ?? false,
    },
  };
};

/**
 * Verifies and shapes an OAuth-cookie token. Backward compatible: payloads
 * signed without a kind (in-flight sign-ins from before the scan flow
 * shipped) still verify and read as plain sign-ins; any unknown kind value
 * is treated as a sign-in too, never as a scan.
 */
export const parseOAuthToken = async (
  token: string | undefined,
): Promise<OAuthPayload | null> => {
  const payload = await verifyToken<{
    state?: string;
    verifier?: string;
    kind?: string;
    returnTo?: string;
  }>(token);
  if (!payload?.state || !payload?.verifier) return null;
  // Re-validate returnTo at consumption time; an invalid value reads as
  // absent and the callback falls back to its default destination.
  const returnTo =
    typeof payload.returnTo === "string"
      ? validateReturnTo(payload.returnTo)
      : null;
  return {
    state: payload.state,
    verifier: payload.verifier,
    ...(payload.kind === "scan" ? { kind: "scan" as const } : {}),
    ...(returnTo ? { returnTo } : {}),
  };
};

export const readOAuthCookie = async (): Promise<OAuthPayload | null> =>
  parseOAuthToken((await cookies()).get(OAUTH_COOKIE)?.value);

/** For server actions (sign out from the sidebar). */
export const clearSessionCookie = async (): Promise<void> => {
  (await cookies()).set(expiredSessionCookie());
};
