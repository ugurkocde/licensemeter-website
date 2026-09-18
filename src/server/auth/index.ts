/**
 * Auth entry point. Dispatches to one of two login stacks based on the
 * AUTH_PROVIDER flag (default "entra"):
 *
 * - entra  → original MSAL sign-in; session is the jose-signed lm_session
 *   cookie ./session reads.
 * - workos → WorkOS AuthKit; ./workos reads the sealed AuthKit session.
 *
 * Both produce the same Session shape, so the rest of the app is unaffected.
 * The connector (app-only Graph access) is independent of this flag.
 */
import { authProvider, isDemoMode } from "~/env";

import * as entra from "./session";
import type { Session } from "./session";
import * as workos from "./workos";

export const auth = async (): Promise<Session | null> => {
  if (authProvider() === "entra") {
    const session = await entra.auth();
    // A demo session token outlives DEMO_MODE being switched off; stop
    // honoring it as soon as the sample workspace is disabled.
    if (session?.user.isDemo && !isDemoMode()) return null;
    return session;
  }
  const session = await workos.auth();
  if (session) return session;
  // The credentials-free sample tenant signs in by writing the entra-style
  // session cookie even under workos auth; honor it, but only for demo sessions
  // (and only while demo mode is on) so a stale real entra cookie can never
  // grant access in workos mode.
  if (!isDemoMode()) return null;
  const demo = await entra.auth();
  return demo?.user.isDemo ? demo : null;
};

export const clearSessionCookie = (): Promise<void> =>
  authProvider() === "workos"
    ? workos.clearSessionCookie()
    : entra.clearSessionCookie();

export type { Session, SessionUser } from "./session";
