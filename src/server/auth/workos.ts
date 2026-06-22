/**
 * WorkOS AuthKit bridge for LicenseMeter (active only when AUTH_PROVIDER=workos;
 * see ../index for the dispatch).
 *
 * Design: WorkOS owns the *login identity*, never the Microsoft tenant. The
 * WorkOS user id and (optional) Organization id are carried in their own
 * Session fields (workosUserId / workosOrgId); the Entra-centric oid/tid are
 * left empty and the access layer resolves the workspace by workosUserId or by
 * verified email. This deliberately does NOT map organizationId onto the Entra
 * `tid` — that id is the connector's per-tenant Graph key (tenants.tid) and
 * must keep its Entra meaning. No Directory Sync is required.
 */
import { cookies } from "next/headers";
import { withAuth, signOut as workosSignOut } from "@workos-inc/authkit-nextjs";

import { expiredSessionCookie } from "./session";
import type { Session, SessionUser } from "./session";

/**
 * Reads the WorkOS session and shapes it as a LicenseMeter Session. Drop-in
 * replacement for the entra `auth()`; returns null when signed out.
 */
export const auth = async (): Promise<Session | null> => {
  const { user, organizationId } = await withAuth();
  if (!user) return null;

  const email = user.email ?? null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || (email ?? "");

  return {
    user: {
      // Entra fields stay empty in workos mode: identity lives in workosUserId,
      // and the Microsoft tenant is bound at the connector, not the login.
      oid: "",
      tid: "",
      upn: email ?? "",
      name,
      email,
      isDemo: false,
      workosUserId: user.id,
      ...(organizationId ? { workosOrgId: organizationId } : {}),
      emailVerified: user.emailVerified ?? false,
    },
  };
};

/**
 * Signs out via WorkOS (clears the sealed AuthKit session cookie and redirects
 * to the logout URL). Also expires the entra-style session cookie first, since
 * the demo sample tenant signs in with it even under workos auth and WorkOS
 * signOut() only knows the WorkOS session.
 */
export const clearSessionCookie = async (): Promise<void> => {
  (await cookies()).set(expiredSessionCookie());
  await workosSignOut();
};

export type { Session, SessionUser };
