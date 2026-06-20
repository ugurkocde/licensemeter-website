import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import Link from "next/link";

import {
  AdobeConnectForm,
  AdobeDisconnectButton,
} from "~/components/workspace/AdobeConnectForm";
import { Card } from "~/components/ui";
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
          Adobe connector
        </h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo ? (
            <p className="text-sm text-ink-soft">
              Connected with demo data: {adobeCount} Adobe seats correlated
              against the directory. On a real workspace this uses your Adobe
              Admin Console credentials.
            </p>
          ) : ctx.tenant.consentedAt === null ? (
            /* CSV-trial workspace: a connector can never sync without the
               Microsoft connection, so don't collect credentials that would
               sit idle. */
            <p className="text-sm text-ink-soft">
              Connectors cross-check seats against your Microsoft 365
              directory, so{" "}
              <Link
                href="/app/connect"
                className="underline underline-offset-4 hover:text-ink"
              >
                connect your tenant
              </Link>{" "}
              first.
            </p>
          ) : adobeConn ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium">
                  Connected: {adobeCount} Adobe seats
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  Org {adobeConn.orgId} ·{" "}
                  {adobeConn.lastSyncAt
                    ? `last sync ${fmtDate(adobeConn.lastSyncAt)} (${adobeConn.lastSyncStatus ?? "pending"})`
                    : "first sync pending"}
                </div>
              </div>
              {isAdmin && <AdobeDisconnectButton />}
            </div>
          ) : isAdmin ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                Detect Adobe seats still assigned to people who are disabled or
                gone in Entra ID. Create an OAuth server-to-server project with
                the User Management API in the Adobe Developer Console (System
                Admin required), then paste the credentials. They are stored
                encrypted and used read-only.
              </p>
              <AdobeConnectForm />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Not connected. A workspace admin can connect the Adobe Admin
              Console here.
            </p>
          )}
        </Card>

        <Card title="What it detects">
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 text-brand-text">
                ·
              </span>
              Adobe seats whose owner is disabled in Entra ID: paid Creative
              Cloud for accounts that can no longer sign in.
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 text-brand-text">
                ·
              </span>
              Orphaned Adobe seats with no matching directory account at all.
            </li>
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            Entitlements only: no Adobe documents or content are read. Prices
            come from the adobe:&lt;product&gt; keys in your price book.
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            The{" "}
            <Link
              href="/connectors/adobe"
              className="underline underline-offset-4 hover:text-ink"
            >
              step-by-step setup guide
            </Link>{" "}
            links the official Adobe documentation for every step.
          </p>
        </Card>
      </div>
    </div>
  );
}
