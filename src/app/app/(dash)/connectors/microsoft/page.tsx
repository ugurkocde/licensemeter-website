import { eq } from "drizzle-orm";
import Link from "next/link";

import { ConnectPoller } from "~/components/workspace/ConnectPoller";
import {
  MicrosoftByoForm,
  MicrosoftDisconnectButton,
} from "~/components/workspace/MicrosoftConnectForm";
import { byoConnectorEnabled, env } from "~/env";
import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { connectErrorText } from "~/lib/connectErrors";
import { MICROSOFT_CONNECTOR } from "~/lib/connectors";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { msConnections } from "~/server/db/schema";

export const metadata = { title: "Microsoft 365 connector" };
// BYO connect action syncs in after(); same 300s budget as other sync paths.
export const maxDuration = 300;

/** Required application permissions, the single source of truth for both paths. */
const ScopeList = () => (
  <ul className="border-line bg-card border">
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
);

/**
 * Managed one-click (default) + BYO (Advanced) + the two no-consent fallbacks
 * (instant scan, CSV). Managed needs the central connector app; the scan needs
 * the Entra sign-in app; each is shown only when its env is configured so no
 * option dead-ends.
 */
const SetupOptions = ({
  byoEnabled,
  connectorConfigured,
  scanConfigured,
}: {
  byoEnabled: boolean;
  connectorConfigured: boolean;
  scanConfigured: boolean;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3">
      <p className="text-ink-soft text-sm">{MICROSOFT_CONNECTOR.managedHint}</p>
      <ScopeList />
      {connectorConfigured ? (
        <div>
          <ButtonAnchor href="/api/connect/start" variant="primary">
            Grant admin consent
          </ButtonAnchor>
        </div>
      ) : (
        <p className="text-ink-soft text-sm">
          One-click managed consent is not enabled on this deployment. Use the
          instant scan or CSV import below.
        </p>
      )}
      <p className="text-ink-faint text-xs">
        Not a Global Administrator or Privileged Role Administrator? Invite one
        to this workspace as Admin under{" "}
        <Link
          href="/app/settings"
          className="hover:text-ink underline underline-offset-4"
        >
          Settings
        </Link>
        . They sign in with their own account and grant the consent from this
        page. A forwarded link does not work: the consent has to finish in the
        session that started it.
      </p>
    </div>

    {byoEnabled && (
      <details className="group border-line border-t pt-4">
        <summary className="text-ink-soft hover:text-ink cursor-pointer text-sm font-medium select-none">
          Advanced: bring your own app registration
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-ink-soft text-sm">
            {MICROSOFT_CONNECTOR.byoHint}{" "}
            <Link
              href="/connectors/microsoft"
              className="hover:text-ink underline underline-offset-4"
            >
              Setup guide and script
            </Link>
            .
          </p>
          <MicrosoftByoForm />
        </div>
      </details>
    )}

    {scanConfigured && (
      <div className="border-line border-t pt-4">
        <p className="text-ink text-sm font-medium">Run an instant scan</p>
        <p className="text-ink-soft mt-1 text-sm">
          One-time scan with the same read-only scopes, running with{" "}
          <strong className="text-ink">your</strong> permissions while you are
          signed in. No standing access, no stored tokens. Works for Application
          and Cloud Application Administrators, who cannot grant the consent
          above.
        </p>
        <div className="mt-3">
          <ButtonAnchor href="/api/scan/start">
            Run an instant scan
          </ButtonAnchor>
        </div>
      </div>
    )}

    <div className="border-line border-t pt-4">
      <p className="text-ink-soft text-sm">
        No admin with consent rights at hand? Start with the CSV import: two
        admin-center exports, no consent at all.
      </p>
      <div className="mt-3">
        <ButtonLink href="/app/connect/csv">Try it with CSV exports</ButtonLink>
      </div>
    </div>
  </div>
);

export default async function MicrosoftConnectorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");
  const sp = await searchParams;
  // Post-consent / post-scan redirects land here with ?status=syncing (poll the
  // first sync) or ?error=<code>.
  const status = typeof sp.status === "string" ? sp.status : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const conn = await db.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, ctx.tenant.id),
  });
  const byoEnabled = byoConnectorEnabled();
  const connectorConfigured = Boolean(env.CONNECTOR_CLIENT_ID);
  const scanConfigured = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <nav
          aria-label="Breadcrumb"
          className="text-ink-faint text-xs font-medium tracking-[0.2em] uppercase"
        >
          <Link
            href="/app/connectors"
            className="hover:text-ink underline-offset-4 hover:underline"
          >
            Connectors
          </Link>{" "}
          /{" "}
          <span aria-current="page" className="text-ink-soft">
            Microsoft 365
          </span>
        </nav>
        <h1 className="font-display mt-2 text-3xl tracking-tight">
          Microsoft 365 connector
        </h1>
      </header>

      {error && (
        <div
          role="alert"
          className="rise rise-2 border-danger-soft bg-danger-soft/50 text-danger-text flex flex-wrap items-center justify-between gap-3 border p-4 text-sm"
        >
          <span>{connectErrorText(error)}</span>
          <Link
            href="/app/connectors/microsoft"
            className="hover:text-ink shrink-0 text-xs font-medium underline underline-offset-4"
          >
            Dismiss
          </Link>
        </div>
      )}

      {status === "syncing" && (
        <div className="rise rise-2">
          <Card title="Tenant connected">
            <ConnectPoller />
          </Card>
        </div>
      )}

      <div className="rise rise-3 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo ? (
            <div className="flex flex-col gap-4">
              <p className="text-ink-soft text-sm">
                Connected with demo data. On a real workspace, a Global
                Administrator grants read-only access in one click, or you bring
                your own Entra app registration.
              </p>
              <details className="border-line border-t pt-3">
                <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium">
                  Preview consent and required permissions
                </summary>
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-ink-soft text-sm">
                    The managed flow opens Microsoft&rsquo;s consent screen. No
                    password or delegated user token is stored.
                  </p>
                  <ScopeList />
                  <Link
                    href="/connectors/microsoft"
                    className="text-ink hover:text-brand-text inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    Open the Microsoft setup guide
                  </Link>
                </div>
              </details>
            </div>
          ) : conn ? (
            <div className="flex flex-col gap-4">
              {(() => {
                // Credential health: a hard auth error takes priority, then a
                // near/past expiry warning (BYO only). Managed has no stored
                // credential to expire.
                const DAY = 24 * 60 * 60 * 1000;
                const expMs = conn.secretExpiresAt
                  ? new Date(conn.secretExpiresAt).getTime() - Date.now()
                  : null;
                if (conn.lastVerifyError) {
                  return (
                    <div className="border-danger-soft bg-danger-soft/50 text-danger-text border p-3 text-sm">
                      {conn.lastVerifyError}
                    </div>
                  );
                }
                if (conn.mode === "byo" && expMs !== null && expMs <= 0) {
                  return (
                    <div className="border-danger-soft bg-danger-soft/50 text-danger-text border p-3 text-sm">
                      The stored credential expired on{" "}
                      {fmtDate(conn.secretExpiresAt)}. Re-enter it below to
                      resume the nightly sync.
                    </div>
                  );
                }
                if (
                  conn.mode === "byo" &&
                  expMs !== null &&
                  expMs <= 14 * DAY
                ) {
                  return (
                    <div className="border-waste-soft bg-waste-soft/50 text-waste-text border p-3 text-sm">
                      The stored credential expires on{" "}
                      {fmtDate(conn.secretExpiresAt)}. Renew it in Entra and
                      re-enter it below before then to avoid a sync gap.
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm">
                  <div className="font-medium">
                    Connected
                    {conn.mode === "managed"
                      ? ": Managed (one-click)"
                      : conn.credType === "cert"
                        ? ": Bring your own app (certificate)"
                        : ": Bring your own app (client secret)"}
                  </div>
                  <div className="text-ink-soft mt-0.5 text-xs">
                    Tenant <span className="font-mono">{conn.tid}</span>
                    {conn.appClientId && (
                      <>
                        {" "}
                        · app{" "}
                        <span className="font-mono">{conn.appClientId}</span>
                      </>
                    )}
                  </div>
                  {conn.mode === "byo" && (
                    <div className="text-ink-soft mt-0.5 text-xs">
                      {conn.credType === "cert" && conn.certThumbprint && (
                        <>
                          thumbprint{" "}
                          <span className="font-mono">
                            {conn.certThumbprint.slice(0, 16)}…
                          </span>{" "}
                          ·{" "}
                        </>
                      )}
                      {conn.secretExpiresAt
                        ? `expires ${fmtDate(conn.secretExpiresAt)}`
                        : "no expiry on file"}
                      {conn.lastVerifiedAt && (
                        <> · verified {fmtDate(conn.lastVerifiedAt)}</>
                      )}
                    </div>
                  )}
                </div>
                {isAdmin && <MicrosoftDisconnectButton />}
              </div>

              {isAdmin && byoEnabled && (
                <details className="group border-line border-t pt-4">
                  <summary className="text-ink-soft hover:text-ink cursor-pointer text-sm font-medium select-none">
                    {conn.mode === "managed"
                      ? "Switch to your own app registration (Advanced)"
                      : "Update credentials"}
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {conn.mode === "managed" && (
                      <p className="text-ink-soft text-sm">
                        {MICROSOFT_CONNECTOR.byoHint}
                      </p>
                    )}
                    <MicrosoftByoForm />
                  </div>
                </details>
              )}
            </div>
          ) : isAdmin ? (
            <SetupOptions
              byoEnabled={byoEnabled}
              connectorConfigured={connectorConfigured}
              scanConfigured={scanConfigured}
            />
          ) : (
            <p className="text-ink-soft text-sm">
              Not connected. A workspace admin can connect Microsoft 365 here.
            </p>
          )}
        </Card>

        <Card title="What it detects">
          <ul className="text-ink-soft flex flex-col gap-2 text-sm">
            {MICROSOFT_CONNECTOR.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="text-brand-text mt-0.5">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
          <p className="text-ink-faint mt-3 text-xs">
            Read-only application permissions only. Nothing is ever written to
            your tenant, and mailbox or file contents are never readable. Full
            details for your security team:{" "}
            <Link
              href="/security"
              className="hover:text-ink underline underline-offset-4"
            >
              security overview
            </Link>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
