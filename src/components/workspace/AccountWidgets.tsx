"use client";

// Radix Themes powers the WorkOS widgets; both stylesheets are required. They're
// imported here (a client component only loaded on /app/account) so they don't
// affect the rest of the app's Tailwind styling.
import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

import { UserProfile, UserSecurity, WorkOsWidgets } from "@workos-inc/widgets";

/**
 * Self-service account management via the WorkOS widgets:
 * - UserProfile: view profile, edit display name, see connected accounts.
 * - UserSecurity: change password (email+password users), manage MFA.
 *
 * The widgets authenticate with the signed-in user's AuthKit access token and
 * talk to WorkOS directly from the browser (the site origin must be allow-listed
 * in the WorkOS dashboard, Authentication > Sessions, or these requests CORS-fail).
 */
export const AccountWidgets = ({ accessToken }: { accessToken: string }) => (
  <WorkOsWidgets theme={{ appearance: "light", accentColor: "teal" }}>
    <div className="flex flex-col gap-6">
      <UserProfile authToken={accessToken} />
      <UserSecurity authToken={accessToken} />
    </div>
  </WorkOsWidgets>
);
