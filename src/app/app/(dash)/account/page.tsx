import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";

import { signOutAction } from "~/app/auth/actions";
import { AccountSessionSync } from "~/components/workspace/AccountSessionSync";
import { AccountWidgets } from "~/components/workspace/AccountWidgets";
import { Button, ButtonLink, Card } from "~/components/ui";
import { authProvider } from "~/env";
import { requireAccess } from "~/server/access";

export const metadata = { title: "Account" };

/**
 * Self-service account page: the signed-in user manages their own name, password
 * and MFA via the WorkOS widgets. WorkOS-only; under the entra opt-out there is
 * no WorkOS profile to manage (those users manage it in Entra / Microsoft).
 */
export default async function AccountPage() {
  // Same gate as the rest of /app (also keeps the sidebar/layout consistent).
  const ctx = await requireAccess("viewer");

  // A demo session has no WorkOS session behind it, so there is no profile to
  // manage; explain that instead of falling into the withAuth() error path.
  if (ctx.tenant.isDemo) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">Account</h1>
        </header>
        <div className="rise rise-2">
          <Card title="Demo workspace">
            <div className="flex flex-col gap-4">
              <p className="text-ink-soft text-sm">
                This shared demo has no personal identity to edit. A real
                account exposes the following self-service security controls.
              </p>
              <ul className="border-line bg-subtle grid gap-px border sm:grid-cols-3">
                {[
                  "Profile & name",
                  "Password",
                  "Multi-factor authentication",
                ].map((item) => (
                  <li key={item} className="bg-card p-4 text-sm font-medium">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-ink-faint text-xs">
                Changes apply to your login across every workspace. The demo
                remains read-only so one visitor cannot affect another.
              </p>
              <Link
                href="/app"
                className="text-ink hover:text-brand-text inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                Back to Overview
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (authProvider() !== "workos") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">Account</h1>
          <p className="text-ink-soft mt-1 text-sm">
            Your profile, password and sign-in security are managed by Microsoft
            Entra ID. Update them in your Microsoft account; changes apply
            across every workspace you belong to.
          </p>
        </header>
      </div>
    );
  }

  const { user, accessToken } = await withAuth();
  if (!user || !accessToken) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">Account</h1>
          <p className="text-ink-soft mt-1 text-sm">
            We couldn&rsquo;t load your account details. Signing out and back in
            usually fixes this.
          </p>
        </header>
        <div className="rise rise-2 flex flex-wrap items-center gap-3">
          <form action={signOutAction}>
            <Button variant="primary">Sign out</Button>
          </form>
          <ButtonLink href="/">Back to home</ButtonLink>
        </div>
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
      {/* Re-seal the session after widget edits so the sidebar name stays current. */}
      <AccountSessionSync />
    </div>
  );
}
