import { and, desc, eq } from "drizzle-orm";
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
import {
  SyncStatusPanel,
  SyncStatusProvider,
} from "~/components/workspace/SyncStatus";
import { Card, buttonClass } from "~/components/ui";
import { connectorSpec } from "~/lib/connectors";
import { fmtDate } from "~/lib/format";
import { syncStatusRun } from "~/lib/syncStatusRun";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { saasConnections, saasSeats, syncRuns } from "~/server/db/schema";
import type { SaasProvider } from "~/server/types";
import { getAiPreview, shouldPreviewAi } from "~/server/demo/aiPreview";
import { AiSampleNotice } from "~/components/workspace/AiSampleNotice";
import { AiConnectorPreview } from "~/components/workspace/AiConnectorPreview";

/**
 * Shared settings subpage for the generic SaaS connectors: one route per
 * provider wraps this with its provider id (the Adobe page predates the
 * framework and keeps its own implementation).
 */
export const SaasConnectorPage = async ({
  provider,
  previewRequested = false,
}: {
  provider: SaasProvider;
  previewRequested?: boolean;
}) => {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");
  const spec = connectorSpec(provider);

  const [conn, seats, lastRun] = await Promise.all([
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
    // Only the newest run's state, so a sync already going (nightly, or
    // started elsewhere) is followed live when the page loads.
    db.query.syncRuns.findFirst({
      where: eq(syncRuns.tenantId, ctx.tenant.id),
      orderBy: desc(syncRuns.startedAt),
      columns: { id: true, status: true, startedAt: true },
    }),
  ]);
  const aiProvider =
    provider === "openai" || provider === "anthropic" ? provider : null;
  const preview =
    aiProvider &&
    shouldPreviewAi({
      isDemo: ctx.tenant.isDemo,
      requested: previewRequested,
      hasConnection: Boolean(conn),
      hasData: seats.n > 0,
    })
      ? await getAiPreview(aiProvider)
      : null;
  const seatCount = preview?.members.length ?? seats.n;
  /* AI connectors store a fixed sentinel as orgRef. Only show the value
     when the spec actually collects one. */
  const showOrgRef = spec.fields.some((f) => f.name === "orgRef");

  // An import connector "exists" once seats are imported; an API connector once
  // a credentials row exists. Used so a previously-connected service stays
  // manageable even if Microsoft was later disconnected.
  const hasConnector = spec.kind === "import" ? seatCount > 0 : Boolean(conn);
  const microsoftDisconnected =
    !ctx.tenant.isDemo && ctx.tenant.consentedAt === null;

  // Shown above an existing connection when Microsoft is gone: the connector
  // can no longer cross-check seats or sync until the tenant is reconnected.
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
            {spec.label}
          </span>
        </nav>
        <h1 className="font-display mt-2 text-3xl tracking-tight">
          {spec.label} connector
        </h1>
      </header>

      {preview && (
        <AiSampleNotice
          exitHref={
            ctx.tenant.isDemo ? undefined : `/app/connectors/${provider}`
          }
        />
      )}
      {aiProvider &&
        !ctx.tenant.isDemo &&
        !conn &&
        seats.n === 0 &&
        !preview && (
          <div className="border-line bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
            <p className="text-ink-soft text-sm">
              Explore sample spend and console members before connecting.
            </p>
            <Link
              href={`/app/connectors/${provider}?preview=sample`}
              className={buttonClass("secondary")}
            >
              Preview sample data
            </Link>
          </div>
        )}

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connection">
          {ctx.tenant.isDemo || preview ? (
            <div className="flex flex-col gap-4">
              <p className="text-ink-soft text-sm">
                {preview
                  ? `Sample workspace: ${seatCount} ${spec.seatNoun}. No live connection.`
                  : `Connected with demo data: ${seatCount} ${spec.seatNoun} correlated against the directory.`}
              </p>
              <details className="border-line border-t pt-3">
                <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium">
                  Preview real workspace setup
                </summary>
                <div className="text-ink-soft mt-2 space-y-3 text-sm">
                  <p>{spec.setupHint}</p>
                  {spec.fields.length > 0 && (
                    <p>
                      Required values:{" "}
                      {spec.fields.map((field) => field.label).join(", ")}.
                      Secrets can be shown while reviewing and are encrypted at
                      rest.
                    </p>
                  )}
                  <Link
                    href={`/connectors/${provider}`}
                    className={buttonClass("secondary")}
                  >
                    Open {spec.label} Setup Guide
                  </Link>
                </div>
              </details>
            </div>
          ) : microsoftDisconnected && !hasConnector ? (
            /* CSV-import / disconnected workspace with nothing imported yet: a
               connector can never sync without the Microsoft connection, so
               don't collect credentials that would sit idle. An existing
               connector falls through to its normal card with a reconnect
               notice instead, so it stays manageable. */
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
          ) : spec.kind === "import" ? (
            <div className="flex flex-col gap-3">
              {reconnectNotice}
              {seatCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Imported: {seatCount} {spec.seatNoun}
                    </div>
                    <div className="text-ink-soft mt-0.5 text-xs">
                      last import {fmtDate(seats.lastImportAt)}
                    </div>
                  </div>
                  {isAdmin && <ClearSeatsButton spec={spec} />}
                </div>
              ) : isAdmin ? (
                <p className="text-ink-soft text-sm">{spec.setupHint}</p>
              ) : (
                <p className="text-ink-soft text-sm">
                  Not connected. A workspace admin can import the {spec.label}{" "}
                  member list here.
                </p>
              )}
              {isAdmin && <ImportSeatsForm spec={spec} />}
            </div>
          ) : conn ? (
            <SyncStatusProvider
              // Before the first sync the poller below follows the run.
              initialRun={conn.lastSyncAt ? syncStatusRun(lastRun) : null}
            >
              <div className="flex flex-col gap-4">
                {reconnectNotice}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Connected: {seatCount} {spec.seatNoun}
                    </div>
                    <div className="text-ink-soft mt-0.5 text-xs">
                      {showOrgRef && (
                        <>
                          <span className="break-all">{conn.orgRef}</span>{" "}
                          ·{" "}
                        </>
                      )}
                      {conn.lastSyncAt
                        ? `last sync ${fmtDate(conn.lastSyncAt)} (${conn.lastSyncStatus ?? "pending"})`
                        : "first sync pending"}
                    </div>
                    {conn.lastSyncStatus === "failed" && (
                      <p className="text-danger-text mt-2 max-w-md text-xs">
                        The last sync could not reach {spec.label}. Findings are
                        based on the previous snapshot. If the credentials were
                        changed or revoked, disconnect and reconnect with fresh
                        values.
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      {!microsoftDisconnected && <SyncNowButton />}
                      <SaasDisconnectButton spec={spec} />
                    </div>
                  )}
                </div>
                {/* Sync now reports progress and the outcome right below its row. */}
                <SyncStatusPanel />
                {/* Rotate credentials without a destructive disconnect: the
                  connect action upserts the row, so resubmitting replaces the
                  stored secret in place. */}
                {isAdmin && !microsoftDisconnected && (
                  <details className="text-sm">
                    <summary className="text-ink-soft hover:text-ink cursor-pointer text-xs underline-offset-4 hover:underline">
                      Update credentials
                    </summary>
                    <div className="mt-3">
                      <SaasConnectForm spec={spec} />
                    </div>
                  </details>
                )}
                {/* First sync hasn't landed yet: poll until it does, matching the
                  Microsoft connector's post-connect experience. Stay on this
                  settings page rather than bouncing to the dashboard. */}
                {!conn.lastSyncAt && !microsoftDisconnected && (
                  <ConnectPoller
                    redirectTo={`/app/connectors/${provider}`}
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
              <p className="text-ink-soft text-sm">{spec.setupHint}</p>
              <SaasConnectForm spec={spec} />
            </div>
          ) : (
            <p className="text-ink-soft text-sm">
              Not connected. A workspace admin can connect {spec.label} here.
            </p>
          )}
        </Card>

        {preview && (
          <AiConnectorPreview preview={preview} isDemo={ctx.tenant.isDemo} />
        )}

        <Card title="What it detects">
          <ul className="text-ink-soft flex flex-col gap-2 text-sm">
            {spec.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="text-brand-text mt-0.5">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
          {spec.unpriced ? (
            <p className="text-ink-faint mt-3 text-xs">
              Costs are reported by the provider in USD and shown on the{" "}
              <Link
                href="/app/ai-costs"
                className="hover:text-ink underline underline-offset-4"
              >
                AI costs
              </Link>{" "}
              page. Console membership itself carries no per-seat price.
            </p>
          ) : (
            <p className="text-ink-faint mt-3 text-xs">
              Seat assignments only: nothing is read from inside {spec.label}.
              Product prices are editable in your license price book.
            </p>
          )}
          <Link
            href={`/connectors/${provider}`}
            className={buttonClass("secondary", "mt-4")}
          >
            Open {spec.label} Setup Guide
          </Link>
        </Card>
      </div>
    </div>
  );
};
