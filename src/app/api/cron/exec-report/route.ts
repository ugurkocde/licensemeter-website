import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { emailEnabled } from "~/server/email";
import { runExecReportJob } from "~/server/report/financeDelivery";

export const maxDuration = 300;

/**
 * Monthly executive report to the confirmed finance recipients of Pro and MSP
 * workspaces, on the 1st after the IT admins' monthly report. No-op until
 * Resend is configured.
 *
 * Safe to run again at any time: every send is claimed in the delivery ledger
 * per month and recipient first, so a re-trigger or a run cut off by the time
 * limit never sends a second copy. The logic lives in
 * ~/server/report/financeDelivery.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }
  return NextResponse.json(await runExecReportJob());
};
