import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { RenewalManager } from "~/components/workspace/RenewalManager";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { memberships, vendorRenewals } from "~/server/db/schema";

export const metadata: Metadata = { title: "Renewals" };

export default async function RenewalsPage() {
  const ctx = await requireAccess("viewer");
  const [renewals, members] = await Promise.all([
    db.query.vendorRenewals.findMany({
      where: eq(vendorRenewals.tenantId, ctx.tenant.id),
      orderBy: asc(vendorRenewals.renewalDate),
    }),
    db.query.memberships.findMany({
      where: eq(memberships.tenantId, ctx.tenant.id),
      columns: { id: true, name: true, email: true },
    }),
  ]);
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
    </div>
  );
}
