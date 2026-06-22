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
import { authProvider } from "~/env";

import * as entra from "./session";
import type { Session } from "./session";
import * as workos from "./workos";

export const auth = async (): Promise<Session | null> => {
  if (authProvider() === "entra") return entra.auth();
  const session = await workos.auth();
  if (session) return session;
  // The credentials-free sample tenant signs in by writing the entra-style
  // session cookie even under workos auth; honor it, but only for demo sessions
  // so a stale real entra cookie can never grant access in workos mode.
  const demo = await entra.auth();
  return demo?.user.isDemo ? demo : null;
};

export const clearSessionCookie = (): Promise<void> =>
  authProvider() === "workos"
    ? workos.clearSessionCookie()
    : entra.clearSessionCookie();

export type { Session, SessionUser } from "./session";
