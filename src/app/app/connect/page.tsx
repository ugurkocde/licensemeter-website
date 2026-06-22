import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink, buttonClass } from "~/components/ui";
import { env } from "~/env";
import { connectErrorText } from "~/lib/connectErrors";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { getAccessContext, requireSession } from "~/server/access";

export const metadata = {
  title: "Connect a tenant",
  robots: { index: false, follow: false },
};

/**
 * Standalone connect entry. In the workspace-first model almost every signed-in
 * user already has a workspace, so this redirects them to the in-app Microsoft
 * connector page (chrome, BYO, scan, CSV). It stays a standalone page — outside
 * the (dash) layout, which requires a workspace — only to serve the one case
 * that has none yet: a brand-new entra-mode user completing first admin consent.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const ctx = await getAccessContext();
  // Has a workspace -> use the in-app connector page (consistent with all other
  // connectors). Only the no-workspace fallback renders below.
  if (ctx) redirect("/app/settings/microsoft");

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const connectorConfigured = Boolean(env.CONNECTOR_CLIENT_ID);
  const scanConfigured = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-xl tracking-tight">
        License<span className="text-brand-text">Meter</span>
      </Link>

      <h1 className="mt-10 font-display text-4xl tracking-tight">
        Connect your tenant
      </h1>

      {error && (
        <div className="mt-6 border border-danger-soft bg-danger-soft/50 p-4 text-sm text-danger-text">
          {connectErrorText(error)}
        </div>
      )}

      <p className="mt-6 text-sm font-medium text-ink">
        Connect the read-only sync
      </p>
      <p className="mt-1 text-ink-soft">
        A Global Administrator or Privileged Role Administrator of your Microsoft
        365 tenant grants LicenseMeter{" "}
        <strong className="text-ink">read-only</strong> application permissions
        once. That unlocks nightly monitoring, leak alerts and trends. Nothing is
        ever written to your tenant, and mailbox or file contents are never
        readable.
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

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {connectorConfigured ? (
          <a href="/api/connect/start" className={buttonClass("primary")}>
            Grant admin consent
          </a>
        ) : (
          <span className="text-sm text-ink-soft">
            One-click managed consent is not enabled on this deployment. Use the
            instant scan or CSV import below.
          </span>
        )}
        <span className="text-xs text-ink-faint">
          Signed in as {session.user.upn || session.user.email}
        </span>
      </div>

      {scanConfigured && (
        <div className="mt-8 border border-line bg-card p-4">
          <p className="text-sm font-medium text-ink">Run an instant scan</p>
          <p className="mt-1 text-sm text-ink-soft">
            One-time scan with the same read-only scopes, running with{" "}
            <strong className="text-ink">your</strong> permissions while you are
            signed in. No standing access, no stored tokens.
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
          No admin with consent rights at hand? Start with the CSV trial: two
          admin-center exports, no consent at all.
        </p>
        <div className="mt-3">
          <ButtonLink href="/app/connect/csv">
            Try it with CSV exports
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
