import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";

import { Card } from "~/components/ui";
import { RenewalManager } from "~/components/workspace/RenewalManager";
import { lifecycleLabel } from "~/components/workspace/SkuTerms";
import { fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { isKnownFreeSku } from "~/server/graph/skuCatalog";
import { memberships, tenantSkus, vendorRenewals } from "~/server/db/schema";

export const metadata: Metadata = { title: "Renewals" };

export default async function RenewalsPage() {
  const ctx = await requireAccess("viewer");
  const [renewals, members, microsoftTerms] = await Promise.all([
    db.query.vendorRenewals.findMany({
      where: eq(vendorRenewals.tenantId, ctx.tenant.id),
      orderBy: asc(vendorRenewals.renewalDate),
    }),
    db.query.memberships.findMany({
      where: eq(memberships.tenantId, ctx.tenant.id),
      columns: { id: true, name: true, email: true },
    }),
    db.query.tenantSkus.findMany({
      where: and(
        eq(tenantSkus.tenantId, ctx.tenant.id),
        isNotNull(tenantSkus.nextLifecycleAt),
      ),
      orderBy: asc(tenantSkus.nextLifecycleAt),
    }),
  ]);
  const microsoftDates = microsoftTerms.filter(
    (s) => !isKnownFreeSku(s.skuId, s.skuPartNumber),
  );
  const canEdit = hasRole(ctx, "admin") && !ctx.tenant.isDemo;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Renewals</h1>
        <p className="text-ink-soft mt-1 max-w-2xl text-sm">
          Track contract dates, cancellation notice periods, owners and annual
          value across every vendor.
        </p>
      </header>
      <div className="rise rise-2">
        <RenewalManager
          renewals={renewals}
          members={members.map((member) => ({
            id: member.id,
            label: member.name
              ? `${member.name} (${member.email})`
              : member.email,
          }))}
          currency={ctx.tenant.currency}
          canEdit={canEdit}
          nowMs={Date.now()}
        />
      </div>
      {microsoftDates.length > 0 && (
        <div className="rise rise-3">
          <Card title="Microsoft subscription dates">
            <p className="text-ink-soft text-sm">
              Read from Microsoft 365 on every sync. Add a contract above to
              track its notice period.
            </p>
            <ul className="border-line mt-3 border-t">
              {microsoftDates.map((s) => (
                <li
                  key={s.skuId}
                  className="border-line flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="font-medium">
                    {s.displayName ?? s.skuPartNumber}
                  </span>
                  <span className="text-ink-soft tnum">
                    {lifecycleLabel(s)} {fmtDate(s.nextLifecycleAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
