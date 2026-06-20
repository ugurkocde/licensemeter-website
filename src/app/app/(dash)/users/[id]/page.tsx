import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FindingChip } from "~/components/workspace/FindingChip";
import { Pill } from "~/components/ui";
import { fmtDate, fmtMoney } from "~/lib/format";
import { skuDisplayName } from "~/server/graph/skuCatalog";
import { requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { findings, priceBook, tenantUsers } from "~/server/db/schema";

export const metadata: Metadata = { title: "User detail" };

const ACTIVITY_LABELS: Record<string, string> = {
  exchange: "Exchange",
  oneDrive: "OneDrive",
  sharePoint: "SharePoint",
  teams: "Teams",
  copilot: "Copilot",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAccess("viewer");
  const { id } = await params;

  const user = await db.query.tenantUsers.findFirst({
    where: and(
      eq(tenantUsers.tenantId, ctx.tenant.id),
      eq(tenantUsers.graphId, id),
    ),
  });
  if (!user) notFound();

  const [userFindings, prices] = await Promise.all([
    db.query.findings.findMany({
      where: and(
        eq(findings.tenantId, ctx.tenant.id),
        eq(findings.graphUserId, id),
      ),
      orderBy: desc(findings.monthlyImpactCents),
    }),
    db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, ctx.tenant.id),
    }),
  ]);
  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));
  const monthlyCost = user.licenses.reduce(
    (sum, l) => sum + (priceBySku.get(l.skuId) ?? 0),
    0,
  );
  const currency = ctx.tenant.currency;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/app/findings"
        className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        ← Back to findings
      </Link>

      <header className="rise rise-1 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            {user.displayName ?? user.upn}
          </h1>
          <p className="mt-1 font-mono text-sm break-all text-ink-soft">
            {user.upn}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={user.accountEnabled ? "moss" : "danger"}>
            {user.accountEnabled ? "enabled" : "disabled"}
          </Pill>
          {user.userType === "Guest" && <Pill tone="teal">guest</Pill>}
        </div>
      </header>

      <section className="rise rise-2 mt-8 grid gap-px border border-line bg-line sm:grid-cols-3">
        {[
          {
            label: "Monthly license cost",
            value: fmtMoney(monthlyCost, currency),
          },
          { label: "Last activity", value: fmtDate(user.lastActivity) },
          { label: "Account created", value: fmtDate(user.createdDateTime) },
        ].map((c) => (
          <div key={c.label} className="bg-card p-5">
            <div className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
              {c.label}
            </div>
            <div className="mt-2 font-display text-2xl tracking-tight">
              {c.value}
            </div>
          </div>
        ))}
      </section>

      <section className="rise rise-3 mt-8">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Licenses
        </h2>
        <ul className="mt-3 border border-line bg-card">
          {user.licenses.map((l) => (
            <li
              key={l.skuId}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div>
                <span className="font-medium">{skuDisplayName(l.skuId)}</span>
                {l.assignedByGroup && (
                  <span className="ml-2 text-xs text-ink-faint">
                    via group {l.assignedByGroup.slice(0, 8)}…
                  </span>
                )}
                {l.disabledPlans.length > 0 && (
                  <span className="ml-2 text-xs text-gold-text">
                    {l.disabledPlans.length} plans disabled
                  </span>
                )}
              </div>
              <span className="tnum font-mono text-sm">
                {fmtMoney(priceBySku.get(l.skuId) ?? 0, currency)}/mo
              </span>
            </li>
          ))}
          {user.licenses.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-soft">
              No licenses assigned.
            </li>
          )}
        </ul>
      </section>

      <section className="rise rise-4 mt-8">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Activity by workload
        </h2>
        <dl className="tnum mt-3 grid grid-cols-2 gap-px border border-line bg-line font-mono text-sm sm:grid-cols-5">
          {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
            <div key={key} className="bg-card p-4">
              <dt className="font-sans text-xs text-ink-faint">{label}</dt>
              <dd className="mt-1">
                {fmtDate(
                  user.workloadActivity?.[
                    key as keyof typeof user.workloadActivity
                  ] ?? null,
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-faint">
          Last interactive sign-in {fmtDate(user.lastInteractiveSignIn)} ·
          non-interactive {fmtDate(user.lastNonInteractiveSignIn)} · synced{" "}
          {fmtDate(user.syncedAt)}
        </p>
      </section>

      <section className="rise rise-5 mt-8 mb-8">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Findings for this user
        </h2>
        <ul className="mt-3 border border-line bg-card">
          {userFindings.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FindingChip rule={f.rule} detail={f.detail} />
                <span className="truncate text-sm">{f.title}</span>
                <Pill
                  tone={
                    f.status === "open"
                      ? "brand"
                      : f.status === "acknowledged"
                        ? "outline"
                        : "moss"
                  }
                >
                  {f.status}
                </Pill>
              </div>
              <span className="tnum shrink-0 font-mono text-sm font-medium text-waste-text">
                {f.monthlyImpactCents > 0
                  ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                  : "-"}
              </span>
            </li>
          ))}
          {userFindings.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-soft">
              No findings for this user.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
