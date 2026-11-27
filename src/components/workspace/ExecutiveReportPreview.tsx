import { Lock } from "lucide-react";

import { fmtMoney, fmtNumber } from "~/lib/format";
import { brandBand, type ReportBranding } from "~/server/report/brandStyle";
import {
  actionSavings,
  daysLabel,
  EXEC_FOOTNOTE,
  execDay,
  execMonth,
  perMonth,
  perYear,
  renewalsTotal,
  seatCount,
  trendMax,
} from "~/server/report/executiveFormat";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";

/**
 * The executive report as a web page, from the same summary and labels as
 * the PDF, so the preview shows what the download contains. With `teaser`
 * (Free), the sections only the full report carries are shown locked.
 */

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="min-w-0">
    <h2 className="text-ink-faint mb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
      {title}
    </h2>
    {children}
  </section>
);

const Locked = ({ children }: { children: React.ReactNode }) => (
  <div className="border-line bg-canvas text-ink-soft flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs">
    <Lock aria-hidden="true" className="text-ink-faint size-4 shrink-0" />
    <span>{children}</span>
  </div>
);

const Kpi = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone?: "waste" | "brand";
}) => (
  <div className="bg-card min-w-0 px-3 py-3">
    <dt className="text-ink-faint text-[10px] font-medium tracking-[0.1em] uppercase">
      {label}
    </dt>
    <dd
      className={`font-display mt-1 text-xl tracking-tight break-words ${
        tone === "waste"
          ? "text-waste-text"
          : tone === "brand"
            ? "text-brand-deep"
            : "text-ink"
      }`}
    >
      {value}
    </dd>
    <dd className="text-ink-soft mt-0.5 text-xs">{sub}</dd>
  </div>
);

const Header = ({
  summary,
  branding,
}: {
  summary: ExecutiveSummary;
  branding: ReportBranding | null;
}) => {
  const meta = (
    <div className="text-ink-soft text-xs sm:text-right">
      <p>{summary.workspace}</p>
      <p>Generated {execDay(summary.generatedAt)}</p>
    </div>
  );
  if (!branding) {
    return (
      <header className="border-ink flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <p className="font-display text-xl">
            License<span className="text-brand">Meter</span>
          </p>
          <p className="text-ink-soft text-sm">Executive savings report</p>
        </div>
        {meta}
      </header>
    );
  }
  // The white-label header as the PDF draws it.
  const band = brandBand(branding.color);
  const name = branding.name?.trim() ?? "";
  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        {branding.logo ? (
          // A stored data URL: next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo}
            alt={name ? `${name} logo` : "Brand logo"}
            className="h-8 max-w-[60%] object-contain object-left"
          />
        ) : (
          <p className="font-display text-xl">{name}</p>
        )}
        {meta}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
        style={{ backgroundColor: band.background, color: band.text }}
      >
        <span>Executive savings report</span>
        {name && <span className="text-xs">Prepared by {name}</span>}
      </div>
    </header>
  );
};

export function ExecutiveReportPreview({
  summary,
  teaser = false,
  branding = null,
}: {
  summary: ExecutiveSummary;
  teaser?: boolean;
  /** White-label marks, as the PDF uses them; null for LicenseMeter. */
  branding?: ReportBranding | null;
}) {
  const { currency, waste, savings, renewals } = summary;
  const name = branding?.name?.trim() ?? "";
  const max = trendMax(summary);
  const height = (cents: number | null) =>
    cents ? `${Math.max(3, (cents * 100) / max)}%` : "2%";
  return (
    <article
      aria-label="Executive savings report preview"
      className="border-line shadow-card mx-auto w-full max-w-[52rem] rounded-sm border bg-white px-4 py-5 sm:px-10 sm:py-9"
    >
      <Header summary={summary} branding={branding} />

      <dl className="border-line bg-line mt-5 grid grid-cols-2 gap-px border lg:grid-cols-4">
        <Kpi
          label="License spend"
          value={perYear(summary.spend.annualCents, currency)}
          sub={`${perMonth(summary.spend.monthlyCents, currency)} today`}
        />
        <Kpi
          label="Open waste"
          value={perYear(waste.annualCents, currency)}
          sub={`${fmtNumber(waste.openFindings, currency)} open ${waste.openFindings === 1 ? "finding" : "findings"}`}
          tone="waste"
        />
        <Kpi
          label="Realized savings"
          value={
            savings ? (
              perYear(savings.annualRunRateCents, currency)
            ) : (
              <span className="text-ink-faint inline-flex items-center gap-1 text-base">
                <Lock aria-hidden="true" className="size-4" />
                {teaser ? "Pro" : "-"}
              </span>
            )
          }
          sub={
            savings
              ? `${fmtMoney(savings.cumulativeCents, currency)} accrued to date`
              : teaser
                ? "From the savings ledger"
                : "Savings ledger not enabled"
          }
          tone="brand"
        />
        <Kpi
          label={`Renewals, next ${renewals.windowDays} days`}
          value={renewalsTotal(summary)}
          sub={`${seatCount(renewals.cutSeats, currency)} to cut across ${renewals.count} ${renewals.count === 1 ? "renewal" : "renewals"}${renewals.estimate ? " (estimate)" : ""}`}
          tone="waste"
        />
      </dl>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section title="6-month trend">
          <ol
            className="border-line flex h-24 items-end gap-2 border-b"
            aria-label={
              teaser
                ? "Open waste per month"
                : "Open waste and realized savings per month"
            }
          >
            {summary.trend.map((p) => (
              <li
                key={p.month}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
              >
                <span
                  className="bg-waste w-2.5 rounded-t-sm"
                  style={{
                    height: height(p.wasteCents),
                    opacity: p.wasteCents ? 1 : 0.25,
                  }}
                />
                {!teaser && (
                  <span
                    className="bg-brand w-2.5 rounded-t-sm"
                    style={{
                      height: height(p.realizedCents),
                      opacity: p.realizedCents ? 1 : 0.25,
                    }}
                  />
                )}
                <span className="sr-only">
                  {execMonth(p.month)}: open waste{" "}
                  {p.wasteCents === null
                    ? "not recorded"
                    : perMonth(p.wasteCents, currency)}
                  {p.realizedCents !== null &&
                    `, realized ${fmtMoney(p.realizedCents, currency)}`}
                </span>
              </li>
            ))}
          </ol>
          <div
            aria-hidden="true"
            className="text-ink-faint mt-1 flex gap-2 text-[10px]"
          >
            {summary.trend.map((p) => (
              <span key={p.month} className="flex-1 text-center">
                {execMonth(p.month)}
              </span>
            ))}
          </div>
          <div className="text-ink-soft mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="bg-waste size-2.5" />
              Open waste per month
            </span>
            {teaser ? (
              <span className="text-ink-faint inline-flex items-center gap-1.5">
                <Lock aria-hidden="true" className="size-3" />
                Realized savings in Pro
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="bg-brand size-2.5" />
                Savings realized that month
              </span>
            )}
          </div>
        </Section>

        <Section title="Open waste by rule">
          {teaser ? (
            <Locked>Pro breaks open waste down by rule.</Locked>
          ) : waste.byRule.length ? (
            <dl className="divide-line divide-y text-sm">
              {waste.byRule.map((r) => (
                <div
                  key={r.label}
                  className="flex justify-between gap-3 py-1.5"
                >
                  <dt className="min-w-0">
                    {r.label}{" "}
                    <span className="text-ink-faint">
                      ({fmtNumber(r.count, currency)})
                    </span>
                  </dt>
                  <dd className="text-waste-text shrink-0 whitespace-nowrap">
                    {r.monthlyCents > 0
                      ? perMonth(r.monthlyCents, currency)
                      : "-"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-ink-soft text-sm">No open findings.</p>
          )}
          {!teaser && waste.capped && (
            <p className="text-ink-faint mt-1 text-xs">
              Total capped at comparable spend:{" "}
              {perMonth(waste.monthlyCents, currency)}.
            </p>
          )}
        </Section>
      </div>

      <div className="mt-6">
        <Section title={`Renewal actions, next ${renewals.windowDays} days`}>
          {teaser ? (
            <Locked>
              {renewals.count > 0
                ? `Pro lists the ${renewals.count === 1 ? "renewal" : `${renewals.count} renewals`} with the seats to renew at, the seats to cut and the date to decide by.`
                : "Pro lists each renewal with the seats to renew at, the seats to cut and the date to decide by."}
            </Locked>
          ) : renewals.actions.length ? (
            <div
              className="max-w-full overflow-x-auto"
              role="region"
              aria-label="Renewal actions"
              tabIndex={0}
            >
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-ink-faint border-line border-b text-[10px] tracking-[0.08em] uppercase">
                  <tr>
                    <th scope="col" className="py-1.5 pr-2 font-medium">
                      Subscription
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Renews
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      Decide by
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-1.5 text-right font-medium"
                    >
                      Renew at
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-1.5 text-right font-medium"
                    >
                      Cut
                    </th>
                    <th
                      scope="col"
                      className="py-1.5 pl-2 text-right font-medium"
                    >
                      Savings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.actions.map((a, i) => (
                    <tr
                      key={`${i}-${a.kind}-${a.vendor}-${a.label}`}
                      className="border-line border-b last:border-b-0"
                    >
                      <td className="py-2 pr-2">
                        {a.label}
                        <div className="text-ink-faint text-xs">
                          {a.vendor} · {daysLabel(a.daysUntil)}
                          {a.estimate && " · estimate"}
                        </div>
                      </td>
                      <td className="tnum px-2 py-2 whitespace-nowrap">
                        {execDay(a.renewalDate)}
                      </td>
                      <td className="tnum px-2 py-2 whitespace-nowrap">
                        {execDay(a.decideBy)}
                      </td>
                      <td className="tnum px-2 py-2 text-right whitespace-nowrap">
                        {fmtNumber(a.recommendedSeats, currency)} of{" "}
                        {fmtNumber(a.paidSeats, currency)}
                      </td>
                      <td className="tnum px-2 py-2 text-right">
                        {fmtNumber(a.cutSeats, currency)}
                      </td>
                      <td className="tnum text-waste-text py-2 pl-2 text-right whitespace-nowrap">
                        {actionSavings(a, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renewals.count > renewals.actions.length && (
                <p className="text-ink-faint mt-1 text-xs">
                  {renewals.count - renewals.actions.length} more{" "}
                  {renewals.count - renewals.actions.length === 1
                    ? "renewal"
                    : "renewals"}{" "}
                  in the renewal savings plan.
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-soft text-sm">
              No renewal in the next {renewals.windowDays} days has seats to
              cut.
            </p>
          )}
        </Section>
      </div>

      <p className="border-line text-ink-faint mt-8 border-t pt-3 text-[11px] leading-relaxed">
        {name ? `Prepared by ${name}. ` : ""}
        {EXEC_FOOTNOTE}
        {branding
          ? " Generated with LicenseMeter (licensemeter.com)."
          : " Generated by LicenseMeter (licensemeter.com)."}
      </p>
    </article>
  );
}
