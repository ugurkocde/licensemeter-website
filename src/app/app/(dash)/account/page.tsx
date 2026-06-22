import { withAuth } from "@workos-inc/authkit-nextjs";

import { AccountWidgets } from "~/components/workspace/AccountWidgets";
import { authProvider } from "~/env";
import { requireAccess } from "~/server/access";

export const metadata = { title: "Account" };

/**
 * Self-service account page: the signed-in user manages their own name, password
 * and MFA via the WorkOS widgets. WorkOS-only — under the entra opt-out there is
 * no WorkOS profile to manage (those users manage it in Entra / Microsoft).
 */
export default async function AccountPage() {
  // Same gate as the rest of /app (also keeps the sidebar/layout consistent).
  await requireAccess("viewer");

  if (authProvider() !== "workos") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl tracking-tight">Account</h1>
        <p className="text-ink-soft mt-2 text-sm">
          Your profile and password are managed by your identity provider.
        </p>
      </div>
    );
  }

  const { user, accessToken } = await withAuth();
  if (!user || !accessToken) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl tracking-tight">Account</h1>
        <p className="text-ink-soft mt-2 text-sm">
          Could not load your account. Try signing out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Account</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Manage your name, password and sign-in security. These apply to your
          personal login across every workspace you belong to.
        </p>
      </header>
      <div className="rise rise-2">
        <AccountWidgets accessToken={accessToken} />
      </div>
    </div>
  );
}
