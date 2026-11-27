import { fmtMoney, fmtNumber } from "~/lib/format";
import type {
  ExecutiveRenewalAction,
  ExecutiveSummary,
} from "./executiveSummary";

/**
 * Labels shared by the executive PDF and its live preview, so both say the
 * same thing. Pure; dates are formatted in UTC like the renewal plan.
 */

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "27 Nov 2026" from yyyy-mm-dd or an ISO timestamp. */
export const execDay = (iso: string) => dayFormat.format(new Date(iso));
/** "Nov 26" from yyyy-mm. */
export const execMonth = (month: string) =>
  monthFormat.format(new Date(`${month}-01T00:00:00Z`));

export const seatCount = (n: number, currency: string) =>
  `${fmtNumber(n, currency)} ${n === 1 ? "seat" : "seats"}`;

export const perYear = (cents: number, currency: string) =>
  `${fmtMoney(cents, currency)}/yr`;

export const perMonth = (cents: number, currency: string) =>
  `${fmtMoney(cents, currency)}/mo`;

/** Yearly savings of one action; seats only when the cut is unpriced. */
export const actionSavings = (a: ExecutiveRenewalAction, currency: string) =>
  a.annualSavingsCents !== null
    ? perYear(a.annualSavingsCents, currency) +
      (a.unpricedCutSeats > 0
        ? ` + ${seatCount(a.unpricedCutSeats, currency)} unpriced`
        : "")
    : `${seatCount(a.cutSeats, currency)} unpriced`;

export const renewalsTotal = (s: ExecutiveSummary) =>
  s.renewals.annualSavingsCents > 0
    ? perYear(s.renewals.annualSavingsCents, s.currency)
    : s.renewals.cutSeats > 0
      ? seatCount(s.renewals.cutSeats, s.currency)
      : fmtMoney(0, s.currency);

export const daysLabel = (days: number) =>
  days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`;

/** Tallest value in the trend, for bar heights; never 0. */
export const trendMax = (s: ExecutiveSummary) =>
  Math.max(
    1,
    ...s.trend.flatMap((p) => [p.wasteCents ?? 0, p.realizedCents ?? 0]),
  );

export const EXEC_FOOTNOTE =
  "Figures come from read-only Microsoft Graph and connector metadata and your price book. Open waste counts open and acknowledged findings, capped at comparable spend. Realized savings are confirmed by a sync and reversed if the seat is used or bought again. Renewal actions come from the renewal savings plan. The report names no users.";
