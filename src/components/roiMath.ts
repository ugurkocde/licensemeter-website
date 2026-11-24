/**
 * Pure math behind the landing-page ROI calculator. Deliberately React-free
 * so roiMath.test.ts can pin the cents arithmetic; the component only formats
 * what this returns.
 * All money is integer cents, no float euros anywhere.
 */
import { DEMO_FIGURES } from "~/lib/demoFigures";

/**
 * Microsoft waste share of the demo tenant, computed from tested demo figures so
 * the slider hint can never drift from what the live demo actually shows.
 */
export const DEMO_WASTE_PCT = Math.round(
  (DEMO_FIGURES.microsoftMonthlyWasteCents / DEMO_FIGURES.monthlySpendCents) *
    100,
);

/** "36,70" or "36.70" → 3670 cents; anything unparseable or negative → 0. */
export const parseEuroToCents = (raw: string): number => {
  const value = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
};

/** Whole seats only; unparseable or negative → 0, absurd input capped. */
export const parseSeats = (raw: string): number => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1_000_000);
};

export type RoiResult = {
  monthlyWasteCents: number;
  annualWasteCents: number;
};

export const computeRoi = (
  seats: number,
  costPerSeatCents: number,
  wastePct: number,
): RoiResult => {
  const monthlyWasteCents = Math.round(
    (seats * costPerSeatCents * wastePct) / 100,
  );
  return {
    monthlyWasteCents,
    annualWasteCents: monthlyWasteCents * 12,
  };
};
