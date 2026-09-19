/**
 * Auth entry point. Sign-in is Microsoft Entra ID only (work and school
 * accounts, MSAL auth-code flow); the session is the jose-signed lm_session
 * cookie ./session reads. The connector (app-only Graph access) is a separate
 * app registration and independent of sign-in.
 */
import { isDemoMode } from "~/env";

import * as entra from "./session";
import type { Session } from "./session";

export const auth = async (): Promise<Session | null> => {
  const session = await entra.auth();
  // A demo session token outlives DEMO_MODE being switched off; stop
  // honoring it as soon as the sample workspace is disabled.
  if (session?.user.isDemo && !isDemoMode()) return null;
  return session;
};

export const clearSessionCookie = (): Promise<void> =>
  entra.clearSessionCookie();

export type { Session, SessionUser } from "./session";
