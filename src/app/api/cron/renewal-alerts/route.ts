import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { emailEnabled } from "~/server/email";
import { runRenewalAlertJob } from "~/server/renewals/alerts";

export const maxDuration = 300;

/**
 * Daily renewal reminders, 90, 60 and 30 days before each paid renewal. Runs
 * after the nightly sync so subscription dates are fresh. No-op until Resend
 * is configured.
 *
 * Safe to run again at any time: every reminder is claimed in the delivery
 * ledger per renewal, threshold and recipient before it is sent, so a
 * re-trigger or a run cut off by the time limit never sends a second copy.
 * The logic lives in ~/server/renewals/alerts.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }
  return NextResponse.json(await runRenewalAlertJob());
};
