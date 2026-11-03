import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import Link from "next/link";

import {
  AdobeConnectForm,
  AdobeDisconnectButton,
} from "~/components/workspace/AdobeConnectForm";
import { ConnectPoller } from "~/components/workspace/ConnectPoller";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import {
  SyncStatusPanel,
  SyncStatusProvider,
} from "~/components/workspace/SyncStatus";
import { Card, buttonClass } from "~/components/ui";
import { fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { adobeConnections, adobeUsers } from "~/server/db/schema";

export const metadata = { title: "Adobe connector" };
// Connect action syncs in after(); needs the same 300s budget as other sync paths.
export const maxDuration = 300;

export default async function AdobeConnectorPage() {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");

  const [adobeConn, adobeCount] = await Promise.all([
    db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, ctx.tenant.id),
    }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(adobeUsers)
      .where(eq(adobeUsers.tenantId, ctx.tenant.id))
      .then((r) => r[0]?.n ?? 0),
  ]);

  const microsoftDisconnected =
    !ctx.tenant.isDemo && ctx.tenant.consentedAt === null;
  const reconnectNotice = microsoftDisconnected ? (
    <p className="border-gold-soft bg-gold-soft/40 text-gold-text border p-3 text-xs">
      Microsoft 365 is disconnected, so this connector can&rsquo;t cross-check
      seats against your directory or run new syncs.{" "}
      <Link
        href="/app/connectors/microsoft"
        className="hover:text-ink underline underline-offset-4"
      >
        Reconnect Microsoft
      </Link>{" "}
      to resume.
    </p>
  ) : null;

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
            Adobe
          </span>
        </nav>
        <h1 className="font-display mt-2 text-3xl tracking-tight">
          Adobe connector
        </h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo ? (
            <div className="flex flex-col gap-4">
              <p className="text-ink-soft text-sm">
                Connected with demo data: {adobeCount} Adobe seats correlated
                against the directory.
              </p>
              <details className="border-line border-t pt-3">
                <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium">
                  Preview real workspace setup
                </summary>
                <div className="text-ink-soft mt-2 space-y-3 text-sm">
                  <p>
                    A System Admin creates an OAuth server-to-server project
                    with the User Management API, then enters the organization
                    ID, client ID, and client secret. The secret is encrypted at
                    rest and used read-only.
                  </p>
                  <Link
                    href="/connectors/adobe"
                    className={buttonClass("secondary")}
                  >
                    Open Adobe Setup Guide
                  </Link>
                </div>
              </details>
            </div>
          ) : microsoftDisconnected && !adobeConn ? (
            /* CSV-import / disconnected workspace with no Adobe connection yet:
               a connector can never sync without Microsoft, so don't collect
               credentials that would sit idle. An existing connection falls
               through to its card with a reconnect notice instead. */
            <p className="text-ink-soft text-sm">
              Connectors cross-check seats against your Microsoft 365 directory,
              so{" "}
              <Link
                href="/app/connectors/microsoft"
                className="hover:text-ink underline underline-offset-4"
              >
                connect your tenant
              </Link>{" "}
              first.
            </p>
          ) : adobeConn ? (
            <SyncStatusProvider initialRun={null}>
              <div className="flex flex-col gap-4">
                {reconnectNotice}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Connected: {adobeCount} Adobe seats
                    </div>
                    <div className="text-ink-soft mt-0.5 text-xs">
                      Org {adobeConn.orgId} ·{" "}
                      {adobeConn.lastSyncAt
                        ? `last sync ${fmtDate(adobeConn.lastSyncAt)} (${adobeConn.lastSyncStatus ?? "pending"})`
                        : "first sync pending"}
                    </div>
                    {adobeConn.lastSyncStatus === "failed" && (
                      <p className="text-danger-text mt-2 max-w-md text-xs">
                        The last sync could not reach Adobe. Findings are based
                        on the previous snapshot. If the credentials were
                        changed or revoked, update them below or reconnect with
                        fresh values.
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      {!microsoftDisconnected && <SyncNowButton />}
                      <AdobeDisconnectButton />
                    </div>
                  )}
                </div>
                {/* Sync now reports progress and the outcome right below its row. */}
                <SyncStatusPanel />
                {/* Rotate credentials without a destructive disconnect: connectAdobe
                  upserts the row, so resubmitting replaces the stored secret. */}
                {isAdmin && !microsoftDisconnected && (
                  <details className="text-sm">
                    <summary className="text-ink-soft hover:text-ink cursor-pointer text-xs underline-offset-4 hover:underline">
                      Update credentials
                    </summary>
                    <div className="mt-3">
                      <AdobeConnectForm />
                    </div>
                  </details>
                )}
                {/* First sync hasn't landed yet: poll until it does, matching the
                  Microsoft connector's post-connect experience. */}
                {!adobeConn.lastSyncAt && !microsoftDisconnected && (
                  <ConnectPoller
                    redirectTo="/app/connectors/adobe"
                    retryUnavailable={
                      isAdmin
                        ? undefined
                        : "Ask a workspace admin to run the sync again."
                    }
                  />
                )}
              </div>
            </SyncStatusProvider>
          ) : isAdmin ? (
            <div className="flex flex-col gap-3">
              <p className="text-ink-soft text-sm">
                Detect Adobe seats still assigned to people who are disabled or
                gone in Entra ID. Create an OAuth server-to-server project with
                the User Management API in the Adobe Developer Console (System
                Admin required), then paste the credentials. They are stored
                encrypted and used read-only.
              </p>
              <AdobeConnectForm />
            </div>
          ) : (
            <p className="text-ink-soft text-sm">
              Not connected. A workspace admin can connect the Adobe Admin
              Console here.
            </p>
          )}
        </Card>

        <Card title="What it detects">
          <ul className="text-ink-soft flex flex-col gap-2 text-sm">
            <li className="flex gap-3">
              <span aria-hidden="true" className="text-brand-text mt-0.5">
                ·
              </span>
              Adobe seats whose owner is disabled in Entra ID: paid Creative
              Cloud for accounts that can no longer sign in.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="text-brand-text mt-0.5">
                ·
              </span>
              Orphaned Adobe seats with no matching directory account at all.
            </li>
          </ul>
          <p className="text-ink-faint mt-3 text-xs">
            Entitlements only: no Adobe documents or content are read. Prices
            are editable in your license price book.
          </p>
          <Link
            href="/connectors/adobe"
            className={buttonClass("secondary", "mt-4")}
          >
            Open Adobe Setup Guide
          </Link>
        </Card>
      </div>
    </div>
  );
}
