"use client";

import { useId, useState } from "react";

import { demoEuros } from "~/lib/demoFigures";
import {
  computeRoi,
  DEMO_WASTE_PCT,
  OVER_CAP,
  parseEuroToCents,
  parseSeats,
} from "~/components/roiMath";

/** "1.250": seat counts in the same German convention as the money. */
const fmtSeats = (n: number): string =>
  new Intl.NumberFormat("de-DE").format(n);

const fmtMultiplier = (n: number): string =>
  new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(n);

const inputClass =
  "tnum mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none";

/**
 * Interactive waste estimate for the landing page. Every number on screen is
 * the visitor's own assumption: we assert nothing; the math (integer cents,
 * plan pick, break-even) lives in roiMath.ts where it is unit-tested.
 */
export const RoiCalculator = () => {
  const seatsId = useId();
  const seatsHintId = useId();
  const costId = useId();
  const costHintId = useId();
  const shareId = useId();
  const shareHintId = useId();

  const [seatsRaw, setSeatsRaw] = useState("250");
  const [costRaw, setCostRaw] = useState("36.70");
  const [wastePct, setWastePct] = useState(8);

  const seats = parseSeats(seatsRaw);
  const costPerSeatCents = parseEuroToCents(costRaw);
  const result = computeRoi(seats, costPerSeatCents, wastePct);

  return (
    <div className="border-line bg-card shadow-card overflow-hidden rounded-2xl border">
      <div className="border-line flex items-baseline justify-between gap-3 border-b px-6 py-4">
        <span className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          Waste estimate · your assumptions
        </span>
        <span className="text-ink-faint font-mono text-xs whitespace-nowrap">
          No data leaves this page
        </span>
      </div>

      <div className="grid md:grid-cols-[1fr_1.15fr]">
        <div className="border-line flex flex-col gap-5 border-b px-6 py-6 md:border-r md:border-b-0">
          <div>
            <label htmlFor={seatsId} className="text-sm font-medium">
              Paid seats
            </label>
            <input
              id={seatsId}
              type="number"
              inputMode="numeric"
              name="paidSeats"
              autoComplete="off"
              min={25}
              max={5000}
              step={1}
              value={seatsRaw}
              onChange={(e) => setSeatsRaw(e.currentTarget.value)}
              aria-describedby={seatsHintId}
              className={inputClass}
            />
            <p id={seatsHintId} className="text-ink-faint mt-1.5 text-xs">
              Use the paid seat count from your renewal, billing export or admin
              center.
            </p>
          </div>

          <div>
            <label htmlFor={costId} className="text-sm font-medium">
              Monthly cost estimate per seat (EUR)
            </label>
            <input
              id={costId}
              type="number"
              inputMode="decimal"
              name="monthlyCostPerSeatEur"
              autoComplete="off"
              min={0}
              step={0.01}
              value={costRaw}
              onChange={(e) => setCostRaw(e.currentTarget.value)}
              aria-describedby={costHintId}
              className={inputClass}
            />
            <p id={costHintId} className="text-ink-faint mt-1.5 text-xs">
              Default uses this app&apos;s Microsoft 365 E3 list-price estimate.
              Replace it with your blended monthly cost if procurement has one.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={shareId} className="text-sm font-medium">
                Assumed waste share
              </label>
              <span className="tnum font-mono text-sm whitespace-nowrap">
                {wastePct} %
              </span>
            </div>
            <input
              id={shareId}
              type="range"
              name="assumedWasteShare"
              min={1}
              max={25}
              step={1}
              value={wastePct}
              onChange={(e) => setWastePct(Number(e.currentTarget.value))}
              aria-describedby={shareHintId}
              aria-valuetext={`${wastePct} percent assumed waste share`}
              className="accent-brand mt-1.5 block min-h-11 w-full cursor-pointer"
            />
            <p
              id={shareHintId}
              className="text-ink-faint mt-1 text-xs leading-relaxed"
            >
              Start with a conservative pre-scan assumption. The sample tenant
              is {DEMO_WASTE_PCT} percent, but your free scan replaces this with
              tenant data.
            </p>
          </div>
        </div>

        <div className="px-6 py-6">
          <div aria-live="polite" aria-atomic="true">
            <div className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
              Assumption-based estimate
            </div>
            <div className="font-display text-waste-text mt-3 text-5xl tracking-tight">
              € {demoEuros(result.monthlyWasteCents)}
            </div>
            <div className="text-ink-soft mt-1 text-sm">
              estimated monthly waste · € {demoEuros(result.annualWasteCents)} a
              year before remediation
            </div>
            <p className="border-line text-ink-soft mt-5 border-t pt-4 text-sm leading-relaxed">
              {result.plan === OVER_CAP ? (
                <>
                  More than 2.500 seats: the waste estimate still runs locally,
                  but published pricing moves to a tenant-specific conversation.
                </>
              ) : result.paysOff ? (
                <>
                  At {fmtSeats(seats)} seats the {result.plan.name} plan is €{" "}
                  {result.plan.priceEur}/month. Your assumed waste is{" "}
                  {fmtMultiplier(
                    result.monthlyWasteCents / (result.plan.priceEur * 100),
                  )}
                  x that monthly plan cost.
                </>
              ) : result.breakEvenSeats !== null ? (
                <>
                  At this assumption, published pricing only pays back above{" "}
                  {fmtSeats(result.breakEvenSeats)} seats. Run the free scan
                  before buying and use the real tenant result.
                </>
              ) : (
                <>
                  Enter a seat cost and the estimate compares your assumed waste
                  with the published plans.
                </>
              )}
            </p>
          </div>
          <a
            href="#get-started"
            className="text-brand-text mt-4 inline-block text-sm font-medium underline underline-offset-4 hover:opacity-80"
          >
            Start free instead →
          </a>
        </div>
      </div>
    </div>
  );
};
