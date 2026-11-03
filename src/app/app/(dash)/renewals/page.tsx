import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";

import { Card, Pill } from "~/components/ui";
import { RenewalManager } from "~/components/workspace/RenewalManager";
import { lifecycleLabel } from "~/components/workspace/SkuTerms";
import { calendarDaysUntil, fmtDate, relativeDayLabel } from "~/lib/format";
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
  const now = new Date();
  const nowMs = now.getTime();
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
          nowMs={nowMs}
        />
      </div>
      {microsoftDates.length > 0 && (
        <div className="rise rise-3">
          <Card title="Microsoft subscription dates">
            <p className="text-ink-soft max-w-2xl text-sm">
              Read from Microsoft 365 on every sync. Add a contract above to
              track its notice period.
            </p>
            <ul className="border-line mt-4 border-t">
              {microsoftDates.map((s) => {
                const label = lifecycleLabel(s);
                const days = s.nextLifecycleAt
                  ? calendarDaysUntil(s.nextLifecycleAt, now)
                  : null;
                return (
                  <li
                    key={s.skuId}
                    className="border-line flex flex-col gap-2 border-b py-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-medium">
                        {s.displayName ?? s.skuPartNumber}
                      </p>
                      {s.displayName && (
                        <p className="text-ink-faint font-mono text-[11px] break-all">
                          {s.skuPartNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Pill tone={label === "Renews" ? "slate" : "plum"}>
                        {label}
                      </Pill>
                      <div className="flex min-w-24 flex-col sm:items-end">
                        <time
                          className="tnum text-ink text-sm font-medium"
                          dateTime={s.nextLifecycleAt
                            ?.toISOString()
                            .slice(0, 10)}
                        >
                          {fmtDate(s.nextLifecycleAt)}
                        </time>
                        {days !== null && (
                          <span
                            className={`tnum text-xs ${
                              days >= 0 && days <= 30
                                ? "text-waste-text font-medium"
                                : "text-ink-faint"
                            }`}
                          >
                            {relativeDayLabel(days)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
