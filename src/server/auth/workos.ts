/**
 * WorkOS AuthKit bridge for LicenseMeter.
 *
 * IMPORTANT: This bridge maps WorkOS user data to the existing SessionUser
 * shape. However, WorkOS does not expose raw IdP claims (like Microsoft's
 * oid, tid, upn) directly. To properly integrate with LicenseMeter's
 * tenant-based workspace model:
 *
 * 1. Configure Microsoft as an SSO connection in WorkOS
 * 2. Set up Directory Sync to sync Entra users (sets external_id = Entra oid)
 * 3. Use WorkOS Organizations to model multi-tenancy
 *
 * Without Directory Sync, the WorkOS user ID is used as a fallback for `oid`.
 * This requires updating existing membership lookups to work with WorkOS IDs.
 */
import { withAuth, signOut as workosSignOut } from "@workos-inc/authkit-nextjs";

import type { SessionUser, Session } from "./session";

/**
 * Reads the WorkOS session and maps it to the LicenseMeter Session shape.
 * Drop-in replacement for the original `auth()` function.
 *
 * NOTE: WorkOS user model differs from the Entra-centric model:
 * - `oid`: Maps to WorkOS user.id (or user.externalId if set via Directory Sync)
 * - `tid`: Maps to WorkOS organizationId (requires Organizations feature)
 * - `upn`: Maps to user.email
 */
export const auth = async (): Promise<Session | null> => {
  const { user, organizationId } = await withAuth();
  if (!user) return null;

  // WorkOS user.externalId is set by Directory Sync to the IdP's user ID
  // (e.g., Entra oid). Falls back to WorkOS's own user ID otherwise.
  const oid = user.externalId ?? user.id;

  // WorkOS organizationId from the access token. This is set when the user
  // authenticates via an organization's SSO connection. For multi-tenant
  // apps, organizations in WorkOS map to tenants.
  const tid = organizationId ?? "";

  // UPN equivalent: WorkOS uses email as the primary identifier
  const upn = user.email;
  const email = user.email;

  // Without WorkOS Organizations configured, tid will be empty.
  // This is OK for single-tenant scenarios but will break multi-tenant
  // workspace resolution. Log a warning for debugging.
  if (!tid) {
    console.warn(
      "[workos] user signed in but no organizationId in token. " +
        "Multi-tenant workspace resolution requires WorkOS Organizations.",
    );
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || upn;

  return {
    user: {
      oid,
      tid,
      upn,
      name,
      email,
      isDemo: false,
    },
  };
};

/**
 * Signs out the user via WorkOS.
 * Drop-in replacement for `clearSessionCookie()`.
 */
export const clearSessionCookie = async (): Promise<void> => {
  await workosSignOut();
};

/**
 * Re-export types for compatibility.
 */
export type { Session, SessionUser };
