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

export const auth = (): Promise<Session | null> =>
  authProvider() === "workos" ? workos.auth() : entra.auth();

export const clearSessionCookie = (): Promise<void> =>
  authProvider() === "workos"
    ? workos.clearSessionCookie()
    : entra.clearSessionCookie();

export type { Session, SessionUser } from "./session";
