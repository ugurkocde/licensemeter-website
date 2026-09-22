import { type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";

/**
 * End-to-end check of crash alerting. Protected by CRON_SECRET. Throws on
 * purpose so the error travels the real path: Next's onRequestError hook,
 * notifyOps dedup, then the ops email and webhook. Repeat calls within the
 * crash cooldown are suppressed like any other crash.
 */
export const GET = (req: NextRequest): Response => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  throw new Error("test alert: ops email pipeline check");
};
