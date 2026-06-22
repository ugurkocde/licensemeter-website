import Link from "next/link";
import { redirect } from "next/navigation";

import { ConnectPoller } from "~/components/workspace/ConnectPoller";
import { ButtonLink, buttonClass } from "~/components/ui";
import { env } from "~/env";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { getAccessContext, requireSession } from "~/server/access";

const ERROR_TEXT: Record<string, string> = {
  not_configured:
    "The connector app registration is not configured on this deployment (CONNECTOR_CLIENT_ID missing).",
  missing_state: "The consent response was missing its state value. Please retry.",
  invalid_state:
    "That link was already used or has expired. Start again from this page.",
  expired_state: "The consent link expired (15 minutes). Please retry.",
  consent_declined: "Consent was declined in the Microsoft dialog.",
  consent_incomplete: "Microsoft did not confirm the consent. Please retry.",
  not_allowed:
    "You need to be an admin or owner of this workspace to connect Microsoft. Ask a workspace owner to connect it.",
  tenant_taken:
    "That Microsoft tenant is already connected to another LicenseMeter workspace. Ask an admin there for an invite.",
  already_connected:
    "This workspace is already connected to a different Microsoft tenant. Disconnect it first in Settings, then retry.",
  scan_declined:
    "The Microsoft permissions dialog was cancelled or declined, so no scan was run. You can retry any time.",
  scan_needs_admin:
    "Your organization requires admin approval for the scan's delegated permissions. An Application Administrator or Cloud Application Administrator can run it, or you can start with the CSV trial below.",
  scan_demo: "The instant scan is not available for the demo workspace.",
  scan_already_synced:
    "Your organization already has a connected workspace with the nightly sync. Open it from the workspace switcher.",
  scan_already_synced_invite:
    "Your organization already has a connected workspace. Ask an admin there for an invite.",
  scan_trial_invite:
    "A trial workspace for your organization already exists. Ask the colleague who created it for an invite.",
  scan_trial_role:
    "This trial workspace already has data, and refreshing it needs an admin role. Ask a workspace admin to refresh it.",
  scan_mismatch:
    "The account that approved the scan does not match your signed-in account. Sign in with the account you want to scan with and retry.",
};

export const metadata = {
  title: "Connect a tenant",
  robots: { index: false, follow: false },
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const ctx = await getAccessContext();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  // Only offer the paths this deployment can actually complete: managed consent
  // needs the central connector app; the instant scan needs the Entra sign-in
  // app. The CSV trial is always available. Avoids buttons that dead-end.
  const connectorConfigured = Boolean(env.CONNECTOR_CLIENT_ID);
  const scanConfigured = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);

  // Already connected and syncing finished -> straight to the dashboard.
  // Trial workspaces (consentedAt null, instant scan or CSV) stay: this
  // page IS their upgrade path to the real read-only sync.
  if (ctx?.tenant.consentedAt && status !== "syncing") redirect("/app");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-xl tracking-tight">
        License<span className="text-brand-text">Meter</span>
      </Link>

      <h1 className="mt-10 font-display text-4xl tracking-tight">
        {status === "syncing" ? "Tenant connected." : "Connect your tenant"}
      </h1>

      {error && (
        <div className="mt-6 border border-danger-soft bg-danger-soft/50 p-4 text-sm text-danger-text">
          {ERROR_TEXT[error] ?? "Something went wrong. Please retry."}
        </div>
      )}

      {status === "syncing" ? (
        <div className="mt-6">
          <ConnectPoller />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm font-medium text-ink">
            Connect the read-only sync
          </p>
          <p className="mt-1 text-ink-soft">
            A Global Administrator or Privileged Role Administrator of your
            Microsoft 365 tenant grants LicenseMeter{" "}
            <strong className="text-ink">read-only</strong> application
            permissions once. That unlocks nightly monitoring, leak alerts
            and trends. Nothing is ever written to your tenant, and mailbox
            or file contents are never readable.
          </p>

          <ul className="mt-6 border border-line bg-card">
            {CONNECTOR_SCOPES.map((s) => (
              <li
                key={s.scope}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <code className="font-mono text-xs">{s.scope}</code>
                <span className="text-xs text-ink-soft">{s.why}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-soft">
            Full details for your security team:{" "}
            <Link
              href="/security"
              className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
            >
              security overview
            </Link>
            .
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {session.user.isDemo ? (
              <Link href="/app" className={buttonClass("primary")}>
                Back to the demo workspace
              </Link>
            ) : connectorConfigured ? (
              <a href="/api/connect/start" className={buttonClass("primary")}>
                Grant admin consent
              </a>
            ) : (
              <span className="text-sm text-ink-soft">
                One-click managed consent is not enabled on this deployment. Use
                the instant scan or CSV import below.
              </span>
            )}
            <span className="text-xs text-ink-faint">
              Signed in as {session.user.upn || session.user.email}
            </span>
          </div>

          {!session.user.isDemo && (
            <>
              <p className="mt-6 text-xs text-ink-faint">
                Not a Global Administrator (or Privileged Role Administrator)?
                Forward this page to one. Managing a customer&apos;s tenant as
                a partner works too: you start the flow, their Global
                Administrator completes the Microsoft dialog, and you become
                the workspace owner.
              </p>

              {scanConfigured && (
                <div className="mt-8 border border-line bg-card p-4">
                  <p className="text-sm font-medium text-ink">
                    Run an instant scan
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    One-time scan with the same read-only scopes, running with{" "}
                    <strong className="text-ink">your</strong> permissions while
                    you are signed in. No standing access, no stored tokens.
                    Works for Application Administrators and Cloud Application
                    Administrators, who cannot grant the consent above.
                  </p>
                  <p className="mt-2 text-xs text-ink-faint">
                    Data quality note: usage-based inactivity detection needs a
                    reports-capable role (Reports Reader, Global Reader).
                    Without one, the scan still finds disabled accounts, guests,
                    shelfware and license overlaps.
                  </p>
                  <div className="mt-3">
                    <a href="/api/scan/start" className={buttonClass("secondary")}>
                      Run an instant scan
                    </a>
                  </div>
                </div>
              )}

              <div className="mt-4 border border-line bg-card p-4">
                <p className="text-sm text-ink-soft">
                  No admin with consent rights at hand? Start with the CSV
                  trial: two admin-center exports, no consent at all.
                </p>
                <div className="mt-3">
                  <ButtonLink href="/app/connect/csv">
                    Try it with CSV exports
                  </ButtonLink>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
