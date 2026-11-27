import { fmtMoney, fmtNumber } from "~/lib/format";
import { buildIcs, type IcsEvent } from "./ics";
import type { PlanItem } from "./plan";

const seats = (n: number, currency: string) =>
  `${fmtNumber(n, currency)} ${n === 1 ? "seat" : "seats"}`;

/** The plan for one renewal in plain sentences, for the event description. */
export const planDescription = (item: PlanItem, currency: string): string => {
  const lines = [
    `Paid seats: ${fmtNumber(item.paidSeats, currency)}`,
    `Unassigned: ${fmtNumber(item.unassignedSeats, currency)}`,
    `Reclaimable from open findings: ${fmtNumber(item.reclaimableSeats, currency)}`,
    `Active: ${fmtNumber(item.activeSeats, currency)}`,
  ];
  if (item.trialOnly) {
    lines.push("Every seat is on trial. There is nothing paid to cut.");
  } else {
    lines.push(
      `${item.targetSet ? "Target" : "Recommended"}: ${seats(item.recommendedSeats, currency)}`,
      `Seats to cut: ${fmtNumber(item.cutSeats, currency)}`,
    );
    if (item.annualSavingsCents !== null)
      lines.push(
        `Savings: ${fmtMoney(item.annualSavingsCents, currency)} per year`,
      );
    if (item.unpricedCutSeats > 0)
      lines.push(
        `${seats(item.unpricedCutSeats, currency)} without a price. Add prices in LicenseMeter to value them.`,
      );
    if (item.estimate)
      lines.push(
        "Conservative estimate: per-user activity is hidden, so more seats may be reclaimable.",
      );
  }
  return lines.join("\n");
};

/** A decision event on the notice date and an event on the renewal date. */
export const planEvents = (
  item: PlanItem,
  opts: { tenantId: string; currency: string; url: string },
): IcsEvent[] => {
  const description = planDescription(item, opts.currency);
  const uid = (kind: string) =>
    `${opts.tenantId}.${item.key}.${kind}@licensemeter`;
  const renewal: IcsEvent = {
    uid: uid("renewal"),
    date: item.renewalDate,
    summary: `${item.vendor} renewal: ${item.label}`,
    description,
    url: opts.url,
  };
  if (item.noticeDate === item.renewalDate) return [renewal];
  const action =
    item.cutSeats > 0
      ? `cut ${seats(item.cutSeats, opts.currency)}`
      : "confirm seat count";
  return [
    {
      uid: uid("notice"),
      date: item.noticeDate,
      summary: `Decide ${item.label} renewal: ${action}`,
      description,
      url: opts.url,
    },
    renewal,
  ];
};

export const planCalendar = (
  items: readonly PlanItem[],
  opts: { tenantId: string; currency: string; url: string; now: Date },
): string =>
  buildIcs({
    prodId: "-//LicenseMeter//Renewal savings plan//EN",
    name: "LicenseMeter renewals",
    now: opts.now,
    events: items.flatMap((item) => planEvents(item, opts)),
  });
