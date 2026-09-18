import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonAnchor, ButtonLink } from "~/components/ui";
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
 * connector page (chrome, BYO, scan, CSV). It stays a standalone page (outside
 * the (dash) layout, which requires a workspace) only to serve the one case
 * that has none yet: a brand-new entra-mode user completing first admin consent.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const ctx = await getAccessContext();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  // Has a workspace -> use the in-app connector page (consistent with all other
  // connectors), preserving any error so it isn't lost in the redirect. Only the
  // no-workspace fallback renders below.
  if (ctx) {
    redirect(
      `/app/connectors/microsoft${error ? `?error=${encodeURIComponent(error)}` : ""}`,
    );
  }
  const connectorConfigured = Boolean(env.CONNECTOR_CLIENT_ID);
  const scanConfigured = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-xl tracking-tight">
        License<span className="text-brand-text">Meter</span>
      </Link>

      <h1 className="font-display mt-10 text-4xl tracking-tight">
        Connect your tenant
      </h1>

      {error && (
        <div
          role="alert"
          className="border-danger-soft bg-danger-soft/50 text-danger-text mt-6 border p-4 text-sm"
        >
          {connectErrorText(error)}
        </div>
      )}

      <p className="text-ink mt-6 text-sm font-medium">
        Connect the read-only sync
      </p>
      <p className="text-ink-soft mt-1">
        A Global Administrator or Privileged Role Administrator of your
        Microsoft 365 tenant grants LicenseMeter{" "}
        <strong className="text-ink">read-only</strong> application permissions
        once. That unlocks nightly monitoring, leak alerts and trends. Nothing
        is ever written to your tenant, and mailbox or file contents are never
        readable.
      </p>

      <ul className="border-line bg-card mt-6 border">
        {CONNECTOR_SCOPES.map((s) => (
          <li
            key={s.scope}
            className="border-line flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-2.5 last:border-b-0"
          >
            <code className="font-mono text-xs">{s.scope}</code>
            <span className="text-ink-soft text-xs">{s.why}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {connectorConfigured ? (
          <ButtonAnchor href="/api/connect/start" variant="primary">
            Grant admin consent
          </ButtonAnchor>
        ) : (
          <span className="text-ink-soft text-sm">
            One-click managed consent is not enabled on this deployment. Use the
            instant scan or CSV import below.
          </span>
        )}
        <span className="text-ink-faint text-xs">
          Signed in as {session.user.upn || session.user.email}
        </span>
      </div>

      {scanConfigured && (
        <div className="border-line bg-card mt-8 border p-4">
          <p className="text-ink text-sm font-medium">Run an instant scan</p>
          <p className="text-ink-soft mt-1 text-sm">
            One-time scan with the same read-only scopes, running with{" "}
            <strong className="text-ink">your</strong> permissions while you are
            signed in. No standing access, no stored tokens.
          </p>
          <div className="mt-3">
            <ButtonAnchor href="/api/scan/start">
              Run an instant scan
            </ButtonAnchor>
          </div>
        </div>
      )}

      <div className="border-line bg-card mt-4 border p-4">
        <p className="text-ink-soft text-sm">
          No admin with consent rights at hand? Start with the CSV import: two
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
