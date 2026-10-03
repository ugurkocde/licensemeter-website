import { eq, sql } from "drizzle-orm";
import { ConnectorCatalog } from "~/components/workspace/ConnectorCatalog";
import { ButtonLink } from "~/components/ui";
import {
  WORKSPACE_CONNECTORS,
  connectorStatus,
} from "~/lib/workspaceConnectors";
import { fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  msConnections,
  adobeConnections,
  saasConnections,
  saasSeats,
} from "~/server/db/schema";

export const metadata = { title: "Connectors" };

export default async function ConnectorsPage() {
  const ctx = await requireAccess("viewer");
  // Fetch only status metadata. Credentials never enter the catalog payload.
  const [microsoft, adobe, saas, imports] = await Promise.all([
    db.query.msConnections.findFirst({
      where: eq(msConnections.tenantId, ctx.tenant.id),
      columns: { lastVerifyError: true, lastVerifiedAt: true },
    }),
    db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, ctx.tenant.id),
      columns: { lastSyncStatus: true, lastSyncAt: true },
    }),
    db.query.saasConnections.findMany({
      where: eq(saasConnections.tenantId, ctx.tenant.id),
      columns: { provider: true, lastSyncStatus: true, lastSyncAt: true },
    }),
    db
      .select({
        provider: saasSeats.provider,
        lastImportAt: sql<string | null>`max(${saasSeats.syncedAt})`,
      })
      .from(saasSeats)
      .where(eq(saasSeats.tenantId, ctx.tenant.id))
      .groupBy(saasSeats.provider),
  ]);
  const summaries = WORKSPACE_CONNECTORS.map((connector) => {
    const isImport = connector.method === "CSV import";
    const imported = imports.find((row) => row.provider === connector.id);
    const connection =
      connector.id === "adobe"
        ? adobe
        : saas.find((row) => row.provider === connector.id);
    const connected =
      connector.id === "microsoft"
        ? Boolean(microsoft)
        : isImport
          ? Boolean(imported)
          : Boolean(connection);
    const failed =
      connector.id === "microsoft"
        ? Boolean(microsoft?.lastVerifyError)
        : connection?.lastSyncStatus === "failed" ||
          (connected && !ctx.tenant.consentedAt);
    const status = connectorStatus({
      demo: ctx.tenant.isDemo,
      connected,
      imported: isImport,
      failed,
    });
    const date =
      connector.id === "microsoft"
        ? microsoft?.lastVerifiedAt
        : isImport
          ? imported?.lastImportAt
          : connection?.lastSyncAt;
    const detail =
      status === "demo"
        ? "Explore with sample data"
        : status === "attention"
          ? "Review your connection"
          : date
            ? `${isImport ? "Imported" : connector.id === "microsoft" ? "Verified" : "Last sync"} ${fmtDate(date)}`
            : connected
              ? "Ready for the first sync"
              : isImport
                ? "Connect with a member export"
                : "Ready to connect";
    return { id: connector.id, status, detail };
  });
  return (
    <div className="flex flex-col gap-6">
      <ConnectorCatalog
        summaries={summaries}
        isDemo={ctx.tenant.isDemo}
        canManage={hasRole(ctx, "admin") && !ctx.tenant.isDemo}
        microsoftConnected={Boolean(microsoft)}
      />
      <div className="border-line bg-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
        <div>
          <h2 className="font-medium">Windows Software Metering</h2>
          <p className="text-ink-soft mt-1 text-sm">
            Optional application launch evidence through Intune, with separate
            consent.
          </p>
        </div>
        <ButtonLink href="/app/metering">Open Software Metering</ButtonLink>
      </div>
    </div>
  );
}
