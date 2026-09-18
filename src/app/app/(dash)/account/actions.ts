"use server";

import { refreshSession } from "@workos-inc/authkit-nextjs";

import { authProvider } from "~/env";

/**
 * Re-seal the AuthKit session cookie from WorkOS so server components (notably
 * the signed-in name in the workspace sidebar) pick up profile edits made
 * through the WorkOS account widgets.
 *
 * withAuth() reads the sealed cookie, which is a login-time snapshot of the
 * user's profile. The widgets write changes (e.g. display name) straight to the
 * WorkOS API from the browser without touching that cookie, so the sidebar keeps
 * showing the old name until the access token next expires or the user signs out
 * and back in. refreshSession() pulls the current profile and rewrites the
 * cookie, after which a router.refresh() renders the new name.
 */
export async function refreshUserSession() {
  if (authProvider() !== "workos") return;
  try {
    await refreshSession();
  } catch {
    // No active session, or the refresh token is gone: nothing to sync. The
    // next navigation or sign-in reconciles; surfacing an error here helps no one.
  }
}
