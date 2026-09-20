/**
 * Auth entry point. Sign-in is Microsoft Entra ID only (work and school
 * accounts, MSAL auth-code flow); the session is the jose-signed lm_session
 * cookie ./session reads. The connector (app-only Graph access) is a separate
 * app registration and independent of sign-in.
 */
import { eq, lt } from "drizzle-orm";

import { isDemoMode } from "~/env";
import { db } from "~/server/db";
import { sessionRevocations } from "~/server/db/schema";

import * as entra from "./session";
import type { Session } from "./session";

export const auth = async (): Promise<Session | null> => {
  const session = await entra.auth();
  if (!session) return null;
  // A demo session token outlives DEMO_MODE being switched off; stop
  // honoring it as soon as the sample workspace is disabled.
  if (session.user.isDemo && !isDemoMode()) return null;
  // Server-side revocation: signing out records the token's jti, so a stolen
  // cookie stops working immediately instead of at its 30-day expiry. Tokens
  // minted before this table existed carry no jti and stay valid.
  if (session.jti) {
    const [revoked] = await db
      .select({ jti: sessionRevocations.jti })
      .from(sessionRevocations)
      .where(eq(sessionRevocations.jti, session.jti))
      .limit(1);
    if (revoked) return null;
  }
  return session;
};

/** Fallback lifetime if a token somehow lacks an exp (matches the cookie max age). */
const SESSION_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Revokes one session server-side. A session with no jti is a legacy token. */
export const revokeSession = async (session: Session | null): Promise<void> => {
  if (!session?.jti) return;
  const expiresAt = session.expiresAt
    ? new Date(session.expiresAt * 1000)
    : new Date(Date.now() + SESSION_FALLBACK_MS);
  await db
    .insert(sessionRevocations)
    .values({ jti: session.jti, expiresAt })
    .onConflictDoNothing();
  // Lazy housekeeping: drop rows whose tokens have already expired.
  await db
    .delete(sessionRevocations)
    .where(lt(sessionRevocations.expiresAt, new Date()));
};

/** Revokes the session in the current request, for sign-out paths. */
export const revokeCurrentSession = async (): Promise<void> => {
  await revokeSession(await auth());
};

export const clearSessionCookie = (): Promise<void> =>
  entra.clearSessionCookie();

export type { Session, SessionUser } from "./session";
