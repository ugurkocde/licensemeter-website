import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { notifyOps } from "~/server/ops";
import { runRetention } from "~/server/retention";

export const maxDuration = 300;

/**
 * Daily data-minimisation run, protected by CRON_SECRET. Deletes stale
 * sign-in tracking and expired rate-limit rows and pseudonymises old resolved
 * findings (periods in src/lib/retention.ts). Responds with counts only.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const result = await runRetention();
    console.log("[retention]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    void notifyOps("retention run failed; see the function log", {
      key: "cron:retention",
      cooldownMs: 24 * 60 * 60 * 1000,
    });
    console.error("[retention] failed", err);
    return NextResponse.json({ error: "retention failed" }, { status: 500 });
  }
};
