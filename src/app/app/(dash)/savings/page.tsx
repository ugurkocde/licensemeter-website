import type { Metadata } from "next";

import { Card } from "~/components/ui";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import {
  PriceConfidenceBadge,
  savingsTrialLabel,
} from "~/components/workspace/PriceConfidence";
import { fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import { RULE_META } from "~/lib/rules";
import { requireAccess } from "~/server/access";
import { hasFeature } from "~/server/entitlement";
import { skuDisplayName } from "~/server/graph/skuCatalog";
import { loadSavingsLedger, RESOLUTION_LABELS } from "~/server/savings/ledger";
import { priceConfidence } from "~/server/waste/spend";
import { loadLicenseSpend } from "~/server/waste/spendStore";

export const metadata: Metadata = { title: "Savings ledger" };

const monthLabel = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

export default async function SavingsPage() {
  const { tenant, entitlement } = await requireAccess("viewer");
  const heading = (
    <h1 className="font-display text-3xl tracking-tight">Savings ledger</h1>
  );

  if (!hasFeature(entitlement, "savingsLedger")) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {heading}
        <FeatureLockPanel
          feature="savingsLedger"
          actionLabel={savingsTrialLabel}
          overQuantity={entitlement.state === "overQuantity"}
        />
      </div>
    );
  }

  const [ledger, { spend }] = await Promise.all([
    loadSavingsLedger(tenant.id, tenant.currency),
    loadLicenseSpend(tenant.id),
  ]);
  const currency = tenant.currency;
  const max = Math.max(1, ...ledger.series.map((point) => point.cents));
  const metrics = [
    [
      "Realized this month",
      ledger.realizedThisMonth,
      "Monthly value recorded this month, including later reversals.",
    ],
    [
      "Current run-rate",
      ledger.runRate,
      "Monthly value of savings that are still active.",
    ],
    [
      "Cumulative savings",
      ledger.cumulative,
      "Estimated value accrued by day until reversal or today.",
    ],
  ] as const;

  return (
    <div className="mx-auto grid max-w-5xl min-w-0 grid-cols-1 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {heading}
        <PriceConfidenceBadge confidence={priceConfidence(spend)} />
      </header>
      <dl className="border-line bg-line grid gap-px border sm:grid-cols-3">
        {metrics.map(([label, cents, definition]) => (
          <div className="bg-card px-4 py-3" key={label}>
            <dt className="text-ink-soft text-sm">{label}</dt>
            <dd className="font-display text-2xl tracking-tight">
              {fmtMoney(cents, currency)}
            </dd>
            <dd className="text-ink-soft text-xs">{definition}</dd>
          </div>
        ))}
      </dl>
      <Card title="Monthly value reclaimed">
        <p className="text-ink-soft mb-3 text-xs">
          Monthly value recorded in each of the last 24 months.
        </p>
        <ol
          className="border-line flex h-28 items-end gap-1 border-b"
          aria-label="Monthly value reclaimed"
        >
          {ledger.series.map(({ month, cents }) => (
            <li
              key={month}
              className="bg-brand min-w-0 flex-1 rounded-t-sm"
              style={{
                height: `${cents ? Math.max(3, (cents * 100) / max) : 1}%`,
                opacity: cents ? 1 : 0.2,
              }}
              title={`${monthLabel.format(new Date(month))} · ${fmtMoney(cents, currency)}`}
            >
              <span className="sr-only">
                {monthLabel.format(new Date(month))} {fmtMoney(cents, currency)}
              </span>
            </li>
          ))}
        </ol>
        <div className="text-ink-soft mt-2 flex justify-between text-xs">
          <span>{monthLabel.format(new Date(ledger.series[0]!.month))}</span>
          <span>
            {monthLabel.format(new Date(ledger.series.at(-1)!.month))}
          </span>
        </div>
      </Card>

      <Card title="Ledger entries">
        {ledger.entries.length ? (
          <div
            className="max-w-full overflow-x-auto"
            role="region"
            aria-label="Ledger entries"
            tabIndex={0}
          >
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="text-ink-soft border-line border-b">
                <tr>
                  {[
                    "Month",
                    "Rule",
                    "Vendor / SKU",
                    "Reason",
                    "Monthly amount",
                    "State",
                  ].map((column) => (
                    <th
                      className="px-2 py-2 font-medium"
                      scope="col"
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-line border-b last:border-b-0"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {monthLabel.format(entry.realizedAt)}
                    </td>
                    <td className="px-2 py-2">{RULE_META[entry.rule].label}</td>
                    <td className="px-2 py-2">
                      {entry.vendor}
                      {entry.skuId && (
                        <div className="text-ink-soft text-xs">
                          {skuDisplayName(entry.skuId)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {RESOLUTION_LABELS[entry.reason]}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {fmtMoney(entry.monthlyCents, entry.currency)}
                    </td>
                    <td className="px-2 py-2">
                      {entry.reversedAt
                        ? `Reversed ${fmtDate(entry.reversedAt)}`
                        : "Active"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-soft text-sm">
            No reclaimed licenses or reduced purchases recorded in the last 24
            months.
          </p>
        )}
      </Card>

      <Card title="No longer flagged">
        <p className="text-ink-soft mb-3 text-xs">
          Findings resolved for other reasons in the last 24 months.
        </p>
        {ledger.noLongerFlagged.length ? (
          <dl className="divide-line divide-y">
            {ledger.noLongerFlagged.map(({ reason, count }) => (
              <div
                key={reason ?? "unrecorded"}
                className="flex justify-between gap-2 py-2 text-sm"
              >
                <dt>{RESOLUTION_LABELS[reason ?? "unrecorded"]}</dt>
                <dd>{fmtNumber(count, currency)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-ink-soft text-sm">
            No other resolutions recorded.
          </p>
        )}
      </Card>
    </div>
  );
}
