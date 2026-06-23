import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import Link from "next/link";

import {
  ClearSeatsButton,
  ImportSeatsForm,
} from "~/components/workspace/ImportSeatsForm";
import {
  SaasConnectForm,
  SaasDisconnectButton,
} from "~/components/workspace/SaasConnectForm";
import { ConnectPoller } from "~/components/workspace/ConnectPoller";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import { Card } from "~/components/ui";
import { connectorSpec } from "~/lib/connectors";
import { fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { saasConnections, saasSeats } from "~/server/db/schema";
import type { SaasProvider } from "~/server/types";

/**
 * Shared settings subpage for the generic SaaS connectors: one route per
 * provider wraps this with its provider id (the Adobe page predates the
 * framework and keeps its own implementation).
 */
export const SaasConnectorPage = async ({
  provider,
}: {
  provider: SaasProvider;
}) => {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");
  const spec = connectorSpec(provider);

  const [conn, seats] = await Promise.all([
    db.query.saasConnections.findFirst({
      where: and(
        eq(saasConnections.tenantId, ctx.tenant.id),
        eq(saasConnections.provider, provider),
      ),
    }),
    db
      .select({
        n: sql<number>`count(*)::int`,
        lastImportAt: sql<Date | string | null>`max(${saasSeats.syncedAt})`,
      })
      .from(saasSeats)
      .where(
        and(
          eq(saasSeats.tenantId, ctx.tenant.id),
          eq(saasSeats.provider, provider),
        ),
      )
      .then((r) => r[0] ?? { n: 0, lastImportAt: null }),
  ]);
  const seatCount = seats.n;
  /* AI connectors store a fixed sentinel as orgRef. Only show the value
     when the spec actually collects one. */
  const showOrgRef = spec.fields.some((f) => f.name === "orgRef");

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
          {spec.label} connector
        </h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo ? (
            <p className="text-sm text-ink-soft">
              Connected with demo data: {seatCount} {spec.seatNoun} correlated
              against the directory.{" "}
              {spec.kind === "import"
                ? `On a real workspace an admin pastes the member export from ${spec.label} here.`
                : `On a real workspace this uses credentials your ${spec.label} admin creates.`}
            </p>
          ) : ctx.tenant.consentedAt === null ? (
            /* CSV-trial workspace: a connector can never sync without the
               Microsoft connection, so don't collect credentials that would
               sit idle. */
            <p className="text-sm text-ink-soft">
              Connectors cross-check seats against your Microsoft 365
              directory, so{" "}
              <Link
                href="/app/settings/microsoft"
                className="underline underline-offset-4 hover:text-ink"
              >
                connect your tenant
              </Link>{" "}
              first.
            </p>
          ) : spec.kind === "import" ? (
            <div className="flex flex-col gap-3">
              {seatCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Imported: {seatCount} {spec.seatNoun}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-soft">
                      last import {fmtDate(seats.lastImportAt)}
                    </div>
                  </div>
                  {isAdmin && <ClearSeatsButton spec={spec} />}
                </div>
              ) : isAdmin ? (
                <p className="text-sm text-ink-soft">{spec.setupHint}</p>
              ) : (
                <p className="text-sm text-ink-soft">
                  Not connected. A workspace admin can import the {spec.label}{" "}
                  member list here.
                </p>
              )}
              {isAdmin && <ImportSeatsForm spec={spec} />}
            </div>
          ) : conn ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm">
                  <div className="font-medium">
                    Connected: {seatCount} {spec.seatNoun}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-soft">
                    {showOrgRef && (
                      <>
                        <span className="break-all">{conn.orgRef}</span> ·{" "}
                      </>
                    )}
                    {conn.lastSyncAt
                      ? `last sync ${fmtDate(conn.lastSyncAt)} (${conn.lastSyncStatus ?? "pending"})`
                      : "first sync pending"}
                  </div>
                  {conn.lastSyncStatus === "failed" && (
                    <p className="mt-2 max-w-md text-xs text-danger-text">
                      The last sync could not reach {spec.label}. Findings are
                      based on the previous snapshot. If the credentials were
                      changed or revoked, disconnect and reconnect with fresh
                      values.
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <SyncNowButton />
                    <SaasDisconnectButton spec={spec} />
                  </div>
                )}
              </div>
              {/* First sync hasn't landed yet: poll until it does, matching the
                  Microsoft connector's post-connect experience. */}
              {!conn.lastSyncAt && <ConnectPoller />}
            </div>
          ) : isAdmin ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">{spec.setupHint}</p>
              <SaasConnectForm spec={spec} />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Not connected. A workspace admin can connect {spec.label} here.
            </p>
          )}
        </Card>

        <Card title="What it detects">
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            {spec.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-brand-text">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
          {spec.unpriced ? (
            <p className="mt-3 text-xs text-ink-faint">
              Costs are reported by the provider in USD and shown on the{" "}
              <Link
                href="/app/ai-costs"
                className="underline underline-offset-4 hover:text-ink"
              >
                AI costs
              </Link>{" "}
              page. Console membership itself carries no per-seat price.
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-faint">
              Seat assignments only: nothing is read from inside {spec.label}.
              Prices come from the {provider}:&lt;product&gt; keys in your
              price book.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            The{" "}
            <Link
              href={`/connectors/${provider}`}
              className="underline underline-offset-4 hover:text-ink"
            >
              step-by-step setup guide
            </Link>{" "}
            links the official {spec.label} documentation for every step.
          </p>
        </Card>
      </div>
    </div>
  );
};
