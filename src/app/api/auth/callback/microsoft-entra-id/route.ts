import { after, NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import {
  getScanClient,
  getSignInClient,
  SCAN_SCOPES,
  SIGNIN_SCOPES,
  signInRedirectUri,
} from "~/server/auth/msal";
import { verifyEntraIdToken, type VerifiedEntraClaims } from "~/server/auth/verifyIdToken";
import {
  createSessionToken,
  expiredOAuthCookie,
  readOAuthCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  type OAuthPayload,
} from "~/server/auth/session";
import { auth } from "~/server/auth";
import { WORKSPACE_COOKIE, workspaceCookieOptions } from "~/server/access";
import { db } from "~/server/db";
import { seenSignins } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { resolveScanTenant, runDelegatedScan } from "~/server/scan";
import { sql } from "drizzle-orm";

/** The delegated instant scan runs inside after() on this route. */
export const maxDuration = 300;

const backToLanding = (req: NextRequest, reason: string) => {
  console.error(`[auth] sign-in failed: ${reason}`);
  const res = NextResponse.redirect(new URL(`/?signin=failed`, req.url));
  res.cookies.set(expiredOAuthCookie());
  return res;
};

const backToConnect = (req: NextRequest, code: string, reason: string) => {
  console.error(`[scan] instant scan aborted (${code}): ${reason}`);
  const res = NextResponse.redirect(
    new URL(`/app/settings/microsoft?error=${code}`, req.url),
  );
  res.cookies.set(expiredOAuthCookie());
  return res;
};

/** Consent errors that mean "your tenant requires an admin for this". */
const NEEDS_ADMIN_PATTERN = /AADSTS65004|AADSTS9009[45]|AADSTS65001|admin/i;

/**
 * Instant-scan return leg (oauth cookie carries kind:"scan"): the user must
 * still hold a valid session: the scan piggybacks on it and NEVER creates
 * or modifies the session cookie. Redeems the code for a one-shot delegated
 * Graph token, applies the same workspace guard matrix as the CSV trial,
 * kicks the sync after the redirect and lets the connect page poll it.
 */
const handleScanCallback = async (
  req: NextRequest,
  oauth: OAuthPayload,
): Promise<Response> => {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  const session = await auth();
  const actorId = session?.user?.workosUserId ?? session?.user?.oid;
  if (!session?.user || !actorId) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(expiredOAuthCookie());
    return res;
  }
  if (session.user.isDemo) {
    return backToConnect(req, "scan_demo", "demo session");
  }

  if (error) {
    const detail = `${error}: ${params.get("error_description") ?? ""}`;
    return backToConnect(
      req,
      NEEDS_ADMIN_PATTERN.test(detail) ? "scan_needs_admin" : "scan_declined",
      detail,
    );
  }
  if (!code || !state || state !== oauth.state) {
    return backToConnect(req, "invalid_state", "state mismatch");
  }

  let accessToken: string;
  let claims: VerifiedEntraClaims;
  try {
    const result = await getScanClient().acquireTokenByCode({
      code,
      scopes: SCAN_SCOPES,
      redirectUri: signInRedirectUri(),
      codeVerifier: oauth.verifier,
    });
    if (!result.accessToken) throw new Error("no access token in redemption");
    accessToken = result.accessToken;
    claims = await verifyEntraIdToken(
      result.idToken,
      env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return backToConnect(
      req,
      NEEDS_ADMIN_PATTERN.test(detail) ? "scan_needs_admin" : "scan_declined",
      `token redemption failed: ${detail}`,
    );
  }

  // Entra opt-out only: the session IS a Microsoft identity, so the scan token
  // must belong to that same signed-in user. Under WorkOS the session carries
  // no Microsoft identity (oid/tid empty); the freshly consented scan token is
  // itself the proof of tenant access, so there is nothing to cross-check.
  const entraSession = !!session.user.oid && !!session.user.tid;
  if (
    entraSession &&
    (claims.tid !== session.user.tid || claims.oid !== session.user.oid)
  ) {
    return backToConnect(req, "scan_mismatch", "token identity != session");
  }

  const upn = claims.preferred_username ?? claims.email ?? session.user.upn;
  const resolved = await resolveScanTenant({
    ms: {
      tid: claims.tid,
      upn,
      name: claims.name,
      email: claims.email ?? claims.preferred_username ?? null,
    },
    actor: session.user.workosUserId
      ? { workosUserId: session.user.workosUserId }
      : { oid: session.user.oid },
    isDemo: session.user.isDemo,
  });
  if (!resolved.ok) return backToConnect(req, resolved.error, "guard matrix");
  const tenantId = resolved.tenantId;

  void notifyOps(`instant scan started: ${upn} (tenant ${claims.tid})`);

  // The scan runs after the redirect is sent; the connect page polls the
  // sync status exactly like the consent flow's first sync.
  after(async () => {
    await runDelegatedScan(tenantId, accessToken);
  });

  const res = NextResponse.redirect(
    new URL("/app/settings/microsoft?status=syncing", req.url),
  );
  res.cookies.set(expiredOAuthCookie());
  // Make the scanned workspace the active one so the poller (and /app)
  // land on it, same as the CSV trial. The session cookie stays untouched.
  res.cookies.set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());
  return res;
};

/**
 * Auth-code redirect leg: validate state, redeem the code via MSAL (which
 * performs the token exchange over TLS directly with Entra), establish the
 * session from the id_token claims. The integrity-protected OAuth cookie's
 * kind branches the delegated instant scan off before the sign-in logic.
 */
export const GET = async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  const oauth = await readOAuthCookie();
  if (oauth?.kind === "scan") return handleScanCallback(req, oauth);

  if (error) {
    return backToLanding(req, `${error}: ${params.get("error_description") ?? ""}`);
  }

  if (!oauth) return backToLanding(req, "missing or expired oauth cookie");
  if (!code || !state || state !== oauth.state) {
    return backToLanding(req, "state mismatch");
  }

  let claims: VerifiedEntraClaims;
  try {
    const result = await getSignInClient().acquireTokenByCode({
      code,
      scopes: SIGNIN_SCOPES,
      redirectUri: signInRedirectUri(),
      codeVerifier: oauth.verifier,
    });
    // Signature + audience + per-tenant issuer verification (Microsoft JWKS).
    claims = await verifyEntraIdToken(
      result.idToken,
      env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    );
  } catch (err) {
    return backToLanding(
      req,
      `token redemption failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const upn = claims.preferred_username ?? claims.email ?? "";

  // First-time identities are a founder signal; returning ones just update stats.
  try {
    const inserted = await db
      .insert(seenSignins)
      .values({ oid: claims.oid, tid: claims.tid, upn })
      .onConflictDoUpdate({
        target: seenSignins.oid,
        set: {
          lastSeenAt: new Date(),
          upn,
          signinCount: sql`${seenSignins.signinCount} + 1`,
        },
      })
      .returning({ count: seenSignins.signinCount });
    if (inserted[0]?.count === 1) {
      void notifyOps(`first sign-in: ${upn} (tenant ${claims.tid})`);
    }
  } catch (err) {
    console.error("[auth] sign-in tracking failed", err);
  }

  const token = await createSessionToken({
    oid: claims.oid,
    tid: claims.tid,
    upn,
    name: claims.name ?? upn,
    email: claims.email ?? claims.preferred_username ?? null,
    isDemo: false,
  });

  // returnTo was validated again inside readOAuthCookie; absent or invalid
  // values fall back to the default landing.
  const res = NextResponse.redirect(new URL(oauth.returnTo ?? "/app", req.url));
  res.cookies.set(expiredOAuthCookie());
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
};
