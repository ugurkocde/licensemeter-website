import { CalendarPlus, FileCode, ListFilter } from "lucide-react";
import Link from "next/link";

import { ButtonAnchor, ButtonLink, Pill } from "~/components/ui";
import { PlanBadge } from "~/components/workspace/FeatureLock";
import {
  BufferEditor,
  SkuTermSelect,
} from "~/components/workspace/RenewalPlanControls";
import { fmtDate, fmtMoney, fmtNumber, relativeDayLabel } from "~/lib/format";
import { choiceOf } from "~/lib/renewalTerm";
import { upgradePath } from "~/lib/upgrade";
import type {
  PlanItem,
  PlanLine,
  PlanTeaser,
  RenewalPlan,
} from "~/server/renewals/plan";

const dayLabel = (iso: string) => fmtDate(new Date(`${iso}T12:00:00Z`));

const seatsLabel = (n: number, currency: string) =>
  `${fmtNumber(n, currency)} ${n === 1 ? "seat" : "seats"}`;

/** Savings in money when priced, otherwise the seat reduction alone. */
export const savingsLabel = (
  item: Pick<PlanItem, "annualSavingsCents" | "unpricedCutSeats" | "cutSeats">,
  currency: string,
): string => {
  if (item.cutSeats === 0) return "No seats to cut";
  const money =
    item.annualSavingsCents !== null
      ? `${fmtMoney(item.annualSavingsCents, currency)}/yr`
      : null;
  const unpriced =
    item.unpricedCutSeats > 0
      ? `${seatsLabel(item.unpricedCutSeats, currency)} unpriced`
      : null;
  return [money, unpriced].filter(Boolean).join(" + ");
};

export const EstimateBadge = () => (
  <Pill
    tone="gold"
    title="Per-user activity is hidden, so more seats may be reclaimable than shown."
  >
    Conservative estimate
  </Pill>
);

/** Findings drill-down for a line: one SKU, or one other vendor. */
const findingsHref = (line: Pick<PlanLine, "id">, microsoft: boolean) =>
  microsoft
    ? `/app/findings?sku=${encodeURIComponent(line.id)}`
    : `/app/findings?source=${encodeURIComponent(line.id.split(":")[0] ?? "")}`;

const SeatFigures = ({
  item,
  currency,
}: {
  item: PlanItem;
  currency: string;
}) => {
  const figures: [string, number, string?][] = [
    ["Paid", item.paidSeats],
    ["Unassigned", item.unassignedSeats],
    ["Reclaimable", item.reclaimableSeats],
    ["Active", item.activeSeats],
    [
      item.targetSet ? "Target" : "Renew at",
      item.recommendedSeats,
      item.targetSet ? "Set on the contract" : "Active seats plus the buffer",
    ],
    ["Cut", item.cutSeats],
  ];
  return (
    <dl className="border-line bg-line mt-4 grid grid-cols-3 gap-px border sm:grid-cols-6">
      {figures.map(([label, value, hint]) => (
        <div
          key={label}
          className="bg-card px-3 py-2"
          title={hint}
          data-figure={label}
        >
          <dt className="text-ink-faint text-[11px] font-medium tracking-wide uppercase">
            {label}
          </dt>
          <dd
            className={`tnum text-sm font-medium ${
              label === "Cut" && value > 0 ? "text-waste-text" : "text-ink"
            }`}
          >
            {fmtNumber(value, currency)}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const PlanRow = ({
  item,
  currency,
  canEdit,
}: {
  item: PlanItem;
  currency: string;
  canEdit: boolean;
}) => {
  const microsoft = item.skuIds.length > 0;
  const singleSku = item.kind === "subscription" ? item.skuIds[0] : undefined;
  return (
    <li
      id={item.key}
      className="border-line bg-card scroll-mt-24 rounded-2xl border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-ink-faint text-xs font-medium uppercase">
            {item.vendor}
            {item.kind === "contract" ? " · Contract" : " · Subscription"}
          </div>
          <h3 className="mt-1 font-medium break-words">{item.label}</h3>
          <p className="text-ink-faint font-mono text-[11px] break-all">
            {item.sub}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.trialOnly && <Pill tone="plum">Trial only</Pill>}
            {item.estimate && <EstimateBadge />}
            {item.targetSet && <Pill tone="slate">Target seats</Pill>}
            {item.kind === "subscription" && item.term === "monthly" && (
              <Pill tone="outline">Monthly term</Pill>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-0.5 sm:items-end">
          <span
            className={`font-display text-xl tracking-tight ${
              item.cutSeats > 0 && !item.trialOnly
                ? "text-waste-text"
                : "text-ink"
            }`}
          >
            {item.trialOnly ? "No paid seats" : savingsLabel(item, currency)}
          </span>
          <span className="text-ink-soft text-sm">
            {item.trialOnly ? "Trial ends" : "Renews"}{" "}
            <time className="tnum" dateTime={item.renewalDate}>
              {dayLabel(item.renewalDate)}
            </time>{" "}
            · {relativeDayLabel(item.daysUntil)}
          </span>
          {!item.trialOnly && (
            <span
              className={`text-xs ${
                item.noticeDaysUntil <= 14 && item.cutSeats > 0
                  ? "text-waste-text font-medium"
                  : "text-ink-faint"
              }`}
            >
              Decide by{" "}
              <time className="tnum" dateTime={item.noticeDate}>
                {dayLabel(item.noticeDate)}
              </time>
            </span>
          )}
        </div>
      </div>

      {item.trialOnly ? (
        <p className="text-ink-soft mt-3 text-sm">
          Every seat of this subscription is on trial, so there is nothing paid
          to cut and no savings are claimed.
        </p>
      ) : (
        <SeatFigures item={item} currency={currency} />
      )}

      {item.lines.length > 1 && (
        <ul className="border-line mt-3 border-t text-sm">
          {item.lines.map((line) => (
            <li
              key={line.id}
              className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0"
            >
              <span className="min-w-0 break-words">{line.name}</span>
              <span className="text-ink-soft tnum flex items-center gap-3 text-xs">
                {fmtNumber(line.paidSeats, currency)} paid ·{" "}
                {fmtNumber(line.activeSeats, currency)} active
                <Link
                  href={findingsHref(line, microsoft)}
                  className="hover:text-ink underline underline-offset-4"
                >
                  Findings
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-line mt-4 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap gap-2">
          <ButtonAnchor
            href={`/api/renewals/${item.key}/ics`}
            className="!px-4"
            download
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Download .ics
          </ButtonAnchor>
          {item.lines.length === 1 && item.reclaimableSeats > 0 && (
            <ButtonLink
              href={findingsHref(item.lines[0]!, microsoft)}
              className="!px-4"
            >
              <ListFilter aria-hidden="true" className="size-4" />
              View findings
            </ButtonLink>
          )}
          {canEdit && microsoft && item.lines.length === 1 && (
            <ButtonAnchor
              href={`/api/export/remediation?sku=${encodeURIComponent(item.skuIds[0]!)}`}
              className="!px-4"
            >
              <FileCode aria-hidden="true" className="size-4" />
              Export PowerShell
            </ButtonAnchor>
          )}
        </div>
        {canEdit && singleSku && (
          <SkuTermSelect
            skuId={singleSku}
            label={item.label}
            initial={choiceOf(item)}
          />
        )}
      </div>
    </li>
  );
};

/** The Pro plan: summary card on top, then one row per renewal. */
export const RenewalPlanView = ({
  plan,
  currency,
  canEdit,
}: {
  plan: RenewalPlan;
  currency: string;
  canEdit: boolean;
}) => {
  const { summary } = plan;
  const next = summary.next;
  return (
    <section
      aria-labelledby="renewal-plan-heading"
      className="flex flex-col gap-4"
    >
      <div className="border-line bg-card shadow-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="renewal-plan-heading"
            className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase"
          >
            Renewal savings plan
          </h2>
          <PlanBadge feature="renewalPlans" />
          {summary.estimate && <EstimateBadge />}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="font-display text-ink text-3xl tracking-tight">
              {summary.annualSavingsCents > 0
                ? `${fmtMoney(summary.annualSavingsCents, currency)} a year`
                : summary.cutSeats > 0
                  ? seatsLabel(summary.cutSeats, currency)
                  : "Nothing to cut yet"}
            </p>
            <p className="text-ink-soft mt-1 max-w-xl text-sm">
              {summary.actionable > 0
                ? `Cut ${seatsLabel(summary.cutSeats, currency)} across ${summary.actionable} of ${summary.renewals} upcoming ${summary.renewals === 1 ? "renewal" : "renewals"}.`
                : summary.renewals > 0
                  ? `None of the ${summary.renewals} upcoming ${summary.renewals === 1 ? "renewal" : "renewals"} has more paid seats than active seats plus the buffer.`
                  : "No upcoming renewal dates yet. Microsoft dates appear after the next sync; add other contracts below."}
              {summary.unpricedCutSeats > 0 &&
                summary.annualSavingsCents > 0 &&
                ` ${seatsLabel(summary.unpricedCutSeats, currency)} of these have no price yet.`}
            </p>
            {next && (
              <p className="text-ink mt-3 text-sm">
                Next:{" "}
                <a
                  href={`#${next.key}`}
                  className="font-medium underline underline-offset-4"
                >
                  {next.label}
                </a>
                , decide by{" "}
                <time className="tnum" dateTime={next.noticeDate}>
                  {dayLabel(next.noticeDate)}
                </time>
                .
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-3">
            {canEdit ? (
              <BufferEditor initial={plan.bufferPct} />
            ) : (
              <p className="text-ink-soft text-sm">
                Buffer on active seats: {plan.bufferPct}%
              </p>
            )}
            {plan.items.length > 0 && (
              <ButtonAnchor href="/api/renewals/all/ics" download>
                <CalendarPlus aria-hidden="true" className="size-4" />
                All renewals (.ics)
              </ButtonAnchor>
            )}
          </div>
        </div>
        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Renew at = seats in use after reclaiming open findings, plus the
          buffer. Each person counts once per subscription. Trial seats are
          never counted as savings, and seats without a price show as seats
          only.
        </p>
      </div>

      {plan.unsizedContracts > 0 && (
        <p className="text-ink-soft text-sm">
          {plan.unsizedContracts === 1
            ? "One contract has"
            : `${plan.unsizedContracts} contracts have`}{" "}
          no seat data yet. Link its Microsoft subscriptions in the contract
          below, or connect the vendor, to plan it.
        </p>
      )}

      {plan.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {plan.items.map((item) => (
            <PlanRow
              key={item.key}
              item={item}
              currency={currency}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
};

/** Free: real totals from the workspace's own data, pointing to Pro. */
export const RenewalPlanTeaser = ({
  teaser,
  currency,
  ctaLabel,
}: {
  teaser: PlanTeaser;
  currency: string;
  ctaLabel: string;
}) => (
  <section
    aria-labelledby="renewal-teaser-heading"
    className="border-brand/40 bg-brand-soft/40 rounded-2xl border p-5"
  >
    <div className="flex flex-wrap items-center gap-2">
      <h2
        id="renewal-teaser-heading"
        className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase"
      >
        Renewal savings plan
      </h2>
      <PlanBadge feature="renewalPlans" locked />
      {teaser.estimate && <EstimateBadge />}
    </div>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
      <p className="text-ink max-w-xl text-sm">
        {teaser.actionable > 0 ? (
          <>
            <span className="font-display text-2xl tracking-tight">
              {teaser.annualSavingsCents > 0
                ? `${fmtMoney(teaser.annualSavingsCents, currency)} a year`
                : seatsLabel(teaser.cutSeats, currency)}
            </span>
            <br />
            {`Your data shows ${seatsLabel(teaser.cutSeats, currency)} to cut across ${teaser.actionable} upcoming ${teaser.actionable === 1 ? "renewal" : "renewals"}`}
            {teaser.nextDaysUntil !== null &&
              `, the first ${teaser.nextDaysUntil === 0 ? "today" : `in ${teaser.nextDaysUntil} ${teaser.nextDaysUntil === 1 ? "day" : "days"}`}`}
            . Pro shows which subscriptions, how many seats to renew and when to
            decide, with a calendar export.
          </>
        ) : (
          "Pro plans the seat count for every upcoming renewal from your own data: seats to renew, seats to cut, the yearly savings and a calendar export."
        )}
      </p>
      <ButtonLink href={upgradePath("renewalPlans")} variant="primary">
        {ctaLabel}
      </ButtonLink>
    </div>
  </section>
);

/** Overview: the earliest renewal within 90 days that has seats to cut. */
export const NextRenewalAction = ({
  item,
  teaser,
  currency,
}: {
  item: PlanItem;
  /** Free gets the same numbers without the subscription name. */
  teaser: boolean;
  currency: string;
}) => (
  <section
    aria-label="Next renewal action"
    className="border-line bg-card rise rise-2 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3"
  >
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase">
        Next renewal action
      </span>
      <PlanBadge feature="renewalPlans" locked={teaser} />
      <span className="text-ink min-w-0">
        {teaser ? (
          `A renewal ${item.daysUntil === 0 ? "today" : `in ${item.daysUntil} ${item.daysUntil === 1 ? "day" : "days"}`} has ${seatsLabel(item.cutSeats, currency)} to cut`
        ) : (
          <>
            <span className="font-medium">{item.label}</span> renews{" "}
            {relativeDayLabel(item.daysUntil).toLowerCase()}: cut{" "}
            {seatsLabel(item.cutSeats, currency)}
          </>
        )}
        {item.annualSavingsCents !== null && (
          <>
            ,{" "}
            <span className="text-waste-text font-medium">
              {fmtMoney(item.annualSavingsCents, currency)}/yr
            </span>
          </>
        )}
        {!teaser && (
          <>
            . Decide by{" "}
            <time className="tnum" dateTime={item.noticeDate}>
              {dayLabel(item.noticeDate)}
            </time>
          </>
        )}
        .
      </span>
    </div>
    {teaser ? (
      <ButtonLink href={upgradePath("renewalPlans")} className="!px-4">
        See the plan in Pro
      </ButtonLink>
    ) : (
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/app/renewals#${item.key}`} className="!px-4">
          Open plan
        </ButtonLink>
        <ButtonAnchor
          href={`/api/renewals/${item.key}/ics`}
          className="!px-4"
          download
        >
          <CalendarPlus aria-hidden="true" className="size-4" />
          .ics
        </ButtonAnchor>
      </div>
    )}
  </section>
);
