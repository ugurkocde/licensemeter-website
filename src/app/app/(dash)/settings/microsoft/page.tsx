import { eq } from "drizzle-orm";
import Link from "next/link";

import {
  MicrosoftByoForm,
  MicrosoftDisconnectButton,
} from "~/components/workspace/MicrosoftConnectForm";
import { byoConnectorEnabled } from "~/env";
import { Card, buttonClass } from "~/components/ui";
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
  <ul className="border border-line bg-card">
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
);

/** Managed one-click (default) + BYO behind an Advanced toggle (flag-gated). */
const SetupOptions = ({ byoEnabled }: { byoEnabled: boolean }) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">{MICROSOFT_CONNECTOR.managedHint}</p>
      <ScopeList />
      <div>
        <a href="/api/connect/start" className={buttonClass("primary")}>
          Grant admin consent
        </a>
      </div>
    </div>

    {byoEnabled && (
      <details className="group border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ink-soft select-none hover:text-ink">
          Advanced — bring your own app registration
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            {MICROSOFT_CONNECTOR.byoHint}{" "}
            <Link
              href="/connectors/microsoft"
              className="underline underline-offset-4 hover:text-ink"
            >
              Setup guide and script
            </Link>
            .
          </p>
          <MicrosoftByoForm />
        </div>
      </details>
    )}
  </div>
);

export default async function MicrosoftConnectorPage() {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");

  const conn = await db.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, ctx.tenant.id),
  });
  const byoEnabled = byoConnectorEnabled();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <nav
          aria-label="Breadcrumb"
          className="text-xs font-medium tracking-[0.2em] text-ink-faint uppercase"
        >
          <Link
            href="/app/settings"
            className="underline-offset-4 hover:text-ink hover:underline"
          >
            Settings
          </Link>{" "}
          /{" "}
          <Link
            href="/app/settings#connectors"
            className="underline-offset-4 hover:text-ink hover:underline"
          >
            Connectors
          </Link>
        </nav>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Microsoft 365 connector
        </h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo ? (
            <p className="text-sm text-ink-soft">
              Connected with demo data. On a real workspace, a Global
              Administrator grants read-only access in one click, or you bring
              your own Entra app registration.
            </p>
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
                    <div className="border border-danger-soft bg-danger-soft/50 p-3 text-sm text-danger-text">
                      {conn.lastVerifyError}
                    </div>
                  );
                }
                if (conn.mode === "byo" && expMs !== null && expMs <= 0) {
                  return (
                    <div className="border border-danger-soft bg-danger-soft/50 p-3 text-sm text-danger-text">
                      The stored credential expired on{" "}
                      {fmtDate(conn.secretExpiresAt)}. Re-enter it below to
                      resume the nightly sync.
                    </div>
                  );
                }
                if (conn.mode === "byo" && expMs !== null && expMs <= 14 * DAY) {
                  return (
                    <div className="border border-waste-soft bg-waste-soft/50 p-3 text-sm text-waste-text">
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
                      ? " — Managed (one-click)"
                      : conn.credType === "cert"
                        ? " — Bring your own app (certificate)"
                        : " — Bring your own app (client secret)"}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-soft">
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
                    <div className="mt-0.5 text-xs text-ink-soft">
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
                <details className="group border-t border-line pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft select-none hover:text-ink">
                    {conn.mode === "managed"
                      ? "Switch to your own app registration (Advanced)"
                      : "Update credentials"}
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {conn.mode === "managed" && (
                      <p className="text-sm text-ink-soft">
                        {MICROSOFT_CONNECTOR.byoHint}
                      </p>
                    )}
                    <MicrosoftByoForm />
                  </div>
                </details>
              )}
            </div>
          ) : isAdmin ? (
            <SetupOptions byoEnabled={byoEnabled} />
          ) : (
            <p className="text-sm text-ink-soft">
              Not connected. A workspace admin can connect Microsoft 365 here.
            </p>
          )}
        </Card>

        <Card title="What it detects">
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            {MICROSOFT_CONNECTOR.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-brand-text">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            Read-only application permissions only. Nothing is ever written to
            your tenant, and mailbox or file contents are never readable. Full
            details for your security team:{" "}
            <Link
              href="/security"
              className="underline underline-offset-4 hover:text-ink"
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
