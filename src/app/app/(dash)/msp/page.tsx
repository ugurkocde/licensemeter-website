import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { mspEnabled } from "~/env";
import { Card, Pill } from "~/components/ui";
import type { PillTone } from "~/components/ui";
import { MspBillingActions } from "~/components/workspace/MspBillingActions";
import { MspCreateForm } from "~/components/workspace/MspCreateForm";
import { MspPortfolioActions } from "~/components/workspace/MspPortfolioActions";
import { fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import {
  MSP_LARGE_TENANT_SEATS,
  MSP_PRICE_ANNUAL_EUR,
  MSP_PRICE_EUR,
} from "~/lib/plans";
import {
  attachWorkspace,
  createMspAccount,
  currentMspAccount,
  detachWorkspace,
  mspPortfolio,
} from "~/server/msp";
import type { SubscriptionStatus } from "~/server/types";

/* Auth gates this route; noindex closes the gap robots.txt leaves. */
export const metadata: Metadata = {
  title: "MSP portfolio",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  trialing: "Free trial",
  past_due: "Past due",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Payment incomplete",
  incomplete_expired: "Payment incomplete",
  paused: "Paused",
};

const STATUS_TONE: Record<SubscriptionStatus, PillTone> = {
  active: "good",
  trialing: "brand",
  past_due: "gold",
  canceled: "slate",
  unpaid: "danger",
  incomplete: "danger",
  incomplete_expired: "danger",
  paused: "slate",
};

/** Statuses we treat as a live subscription that is managed via the portal. */
const MANAGEABLE: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due",
]);

/** German thousands separators, whole euros, matching the rest of the site. */
const fmtEuros = (n: number): string => new Intl.NumberFormat("de-DE").format(n);

const LARGE_TENANT_LABEL = fmtNumber(MSP_LARGE_TENANT_SEATS, "EUR");

export default async function MspPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The nav link is already gated on mspEnabled(), but the route is directly
  // reachable by URL — close that gap so the create/attach pathway (which can
  // cancel a tenant's own subscription) is unreachable when MSP is unconfigured.
  if (!mspEnabled()) redirect("/app");
  const account = await currentMspAccount();
  const sp = await searchParams;
  const checkoutParam = typeof sp.checkout === "string" ? sp.checkout : undefined;

  if (!account) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">MSP portfolio</h1>
          <p className="mt-1 text-sm text-ink-soft">
            One workspace per client tenant. One waste ledger across them all.
          </p>
        </header>

        <div className="rise rise-2">
          <Card title="Create your MSP account">
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-ink-soft">
                An MSP account binds the client workspaces you own into a single
                portfolio, billed by quantity on one subscription. You attach a
                client tenant and it inherits entitlement from the account —{" "}
                <span className="font-medium text-ink">
                  € {fmtEuros(MSP_PRICE_EUR)}
                </span>{" "}
                per attached client tenant a month, or €{" "}
                {fmtEuros(MSP_PRICE_ANNUAL_EUR)} a year (two months free). Client
                tenants over {LARGE_TENANT_LABEL} seats are priced separately.
              </p>
              <MspCreateForm action={createMspAccount} />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const portfolio = await mspPortfolio();
  // Attached first, then by waste desc within each group (mspPortfolio already
  // sorts by waste, but mixes attached/unattached; this groups the billed
  // tenants to the top where the QBR numbers live).
  const rows = [...portfolio].sort((a, b) => {
    if (a.attached !== b.attached) return a.attached ? -1 : 1;
    return (b.summary?.wasteCents ?? -1) - (a.summary?.wasteCents ?? -1);
  });

  const status = account.subscriptionStatus;
  const subscribed = Boolean(account.stripeSubscriptionId);
  const manageable = subscribed && status !== null && MANAGEABLE.has(status);
  const attachedCount = rows.filter((r) => r.attached).length;
  const interval = account.interval;
  const unitPrice =
    interval === "year" ? MSP_PRICE_ANNUAL_EUR : MSP_PRICE_EUR;
  const intervalSuffix = interval === "year" ? "yr" : "mo";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">MSP portfolio</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {account.name ??
            "Every client tenant you own, billed on one subscription."}
        </p>
      </header>

      <div className="rise rise-2">
        <Card title="Billing">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {subscribed && status ? (
                  <>
                    <Pill tone={STATUS_TONE[status]}>
                      {STATUS_LABEL[status]}
                    </Pill>
                    {interval && (
                      <span className="text-sm">
                        <span className="font-medium">
                          € {fmtEuros(unitPrice)}
                        </span>{" "}
                        <span className="text-ink-soft">
                          / tenant / {intervalSuffix}
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  <Pill tone="slate">Not subscribed yet</Pill>
                )}
              </div>
              <p className="text-sm text-ink-soft">
                {attachedCount === 1
                  ? "1 attached tenant"
                  : `${attachedCount} attached tenants`}{" "}
                {subscribed ? "billed on this subscription." : "ready to bill."}
              </p>
              {account.cancelAtPeriodEnd && account.currentPeriodEnd ? (
                <p className="text-sm text-ink-soft">
                  Cancels on {fmtDate(account.currentPeriodEnd)}
                </p>
              ) : status === "trialing" && account.currentPeriodEnd ? (
                <p className="text-sm text-ink-soft">
                  Free trial — first charge {fmtDate(account.currentPeriodEnd)}
                </p>
              ) : subscribed && account.currentPeriodEnd ? (
                <p className="text-sm text-ink-soft">
                  Renews on {fmtDate(account.currentPeriodEnd)}
                </p>
              ) : null}
            </div>
            <MspBillingActions
              manageable={manageable}
              checkoutParam={checkoutParam}
            />
          </div>
        </Card>
      </div>

      <div className="rise rise-3">
        <Card title="Portfolio">
          {rows.length === 0 ? (
            <p className="text-sm text-ink-soft">
              You don&rsquo;t own any client workspaces yet. Connect a client
              tenant, then attach it here to bill it on this account.
            </p>
          ) : (
            <div className="-mx-5 -my-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-4 py-3 text-right font-medium">Seats</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Spend / mo
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Waste / mo
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Findings
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const blocked =
                      row.hasSync && row.seats > MSP_LARGE_TENANT_SEATS;
                    return (
                      <tr
                        key={row.tenantId}
                        className="border-b border-line last:border-b-0"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{row.name}</span>
                            {row.attached && (
                              <Pill tone="brand">Attached</Pill>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tnum">
                          {row.hasSync
                            ? fmtNumber(row.seats, row.currency)
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right tnum">
                          {row.summary
                            ? fmtMoney(row.summary.spendCents, row.currency)
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right tnum text-waste-text">
                          {row.summary
                            ? fmtMoney(row.summary.wasteCents, row.currency)
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right tnum">
                          {row.summary ? row.summary.openFindings : "-"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <MspPortfolioActions
                            tenantId={row.tenantId}
                            attached={row.attached}
                            blocked={blocked}
                            blockedReason={`Over ${LARGE_TENANT_LABEL} seats - priced separately, contact us`}
                            attachAction={attachWorkspace}
                            detachAction={detachWorkspace}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
