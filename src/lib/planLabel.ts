import { fmtDate } from "~/lib/format";
import type { Entitlement, Plan } from "~/server/entitlement";

const PLAN_NAMES: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  msp: "MSP",
};

export const planName = (plan: Plan): string => PLAN_NAMES[plan];

/** A subset of the Pill tones in components/ui. */
export type PlanBadgeTone = "outline" | "brand" | "gold" | "danger";

export type PlanBadge = {
  label: string;
  /** What the owner should know beyond the plan name, when there is anything. */
  detail?: string;
  tone: PlanBadgeTone;
};

/** fmtDate is pinned to en-GB; an explicit locale keeps the same shape. */
const endDate = (d: Date, locale?: string): string =>
  locale
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d)
    : fmtDate(d);

/**
 * The plan badge for the dashboard chrome. Null for self-hosted installs and
 * the demo workspace, which have every feature and never see plan wording.
 */
export function planBadge(
  entitlement: Entitlement,
  locale?: string,
): PlanBadge | null {
  const label = planName(entitlement.plan);
  const end = entitlement.currentPeriodEnd;
  switch (entitlement.state) {
    case "selfHosted":
    case "demo":
      return null;
    case "free":
      return { label, tone: "outline" };
    case "active":
    case "comped":
      return { label, tone: "brand" };
    case "trialing":
      return {
        label,
        detail: end ? `Trial until ${endDate(end, locale)}` : "Trial",
        tone: "brand",
      };
    case "canceling":
      return {
        label,
        detail: end
          ? `Ends ${endDate(end, locale)}`
          : "Ends with the current period",
        tone: "gold",
      };
    case "pastDue":
      return { label, detail: "Payment due", tone: "danger" };
    case "overQuantity":
      return { label, detail: "Not covered by your MSP plan", tone: "gold" };
  }
}
