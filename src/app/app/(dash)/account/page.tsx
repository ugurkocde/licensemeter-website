import Link from "next/link";

import { signOutAction } from "~/app/auth/actions";
import { Button, Card, Pill } from "~/components/ui";
import { requireAccess } from "~/server/access";
import { auth } from "~/server/auth";

export const metadata = { title: "Account" };

const MICROSOFT_ACCOUNT_URL = "https://myaccount.microsoft.com/";

/**
 * Read-only account page. Sign-in is Microsoft Entra ID, so LicenseMeter holds
 * no password, no multi-factor setup and no editable profile: it shows what the
 * sign-in told us and points to Microsoft for everything else.
 */
export default async function AccountPage() {
  // Same gate as the rest of /app (also keeps the sidebar/layout consistent).
  const ctx = await requireAccess("viewer");

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
                This shared demo has no personal identity behind it. In a real
                workspace this page shows the name, email and Microsoft tenant
                you signed in with, your role, and the workspaces you belong to.
              </p>
              <p className="text-ink-faint text-xs">
                Password, multi-factor authentication and profile stay in your
                Microsoft account. The demo remains read-only so one visitor
                cannot affect another.
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

  // The email is a display value from the Microsoft sign-in. It is never used
  // to decide access; membership is keyed on the Entra object id.
  const session = await auth();
  const email = session?.user.email ?? ctx.user.upn;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Account</h1>
        <p className="text-ink-soft mt-1 text-sm">
          What LicenseMeter received when you signed in with Microsoft.
        </p>
      </header>

      <div className="rise rise-2">
        <Card title="Signed in as">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-faint">Name</dt>
              <dd className="mt-0.5 font-medium">
                {ctx.user.name || "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Email</dt>
              <dd className="mt-0.5 break-all">{email || "Not provided"}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Microsoft tenant ID</dt>
              <dd className="mt-0.5 font-mono text-xs break-all">
                {ctx.user.tid}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Role in this workspace</dt>
              <dd className="mt-0.5 capitalize">{ctx.membership.role}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="rise rise-3">
        <Card title="Workspaces">
          <ul className="divide-line divide-y text-sm">
            {ctx.workspaces.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate font-medium">{w.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {w.id === ctx.tenant.id && <Pill tone="brand">Active</Pill>}
                  <Pill tone="outline">{w.role}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="rise rise-4">
        <Card title="Password and security">
          <div className="flex flex-col gap-4">
            <p className="text-ink-soft text-sm">
              Your password, multi-factor authentication and profile are managed
              in your Microsoft account, not in LicenseMeter. Change them at{" "}
              <a
                href={MICROSOFT_ACCOUNT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
              >
                myaccount.microsoft.com
              </a>
              . A new name or email shows here the next time you sign in.
            </p>
            <form action={signOutAction}>
              <Button>Sign out</Button>
            </form>
            <p className="text-ink-faint text-xs">
              Signing out ends your LicenseMeter session on this browser. You
              stay signed in to Microsoft.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
