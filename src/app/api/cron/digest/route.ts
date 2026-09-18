import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { emailEnabled } from "~/server/email";
import { runDigestJob } from "~/server/scheduledEmails";

export const maxDuration = 300;

/**
 * Weekly digest to workspace owners/admins. No-op until Resend is configured.
 *
 * Safe to run again at any time: every recipient's email for the current ISO
 * week is claimed in the delivery ledger before it is sent, so a scheduler
 * restart, a manual re-trigger or a run cut off by the time limit never sends
 * a second copy. The job stops starting new tenants after 240 s and reports
 * the rest as unprocessedTenants; calling the route again finishes exactly
 * the remainder. The logic lives in ~/server/scheduledEmails.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }
  return NextResponse.json(await runDigestJob());
};
