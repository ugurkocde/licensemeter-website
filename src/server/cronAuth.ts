import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import { notifyOps } from "~/server/ops";

/** Constant-time bearer check; a length mismatch is false, never a throw. */
const authorized = (req: NextRequest, secret: string): boolean => {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/**
 * Shared cron bearer-auth gate for all /api/cron routes.
 *
 * Returns a 401 NextResponse to short-circuit with when the request is not
 * authorized, or null when it is. Callers do: `const denied =
 * requireCronAuth(req); if (denied) return denied;`.
 *
 * When CRON_SECRET is unset/empty, every legitimate Vercel cron call would
 * 401 forever with no signal, so we fire a keyed + cooldown ops warning to
 * surface the misconfiguration. We still deny (secure default: never open the
 * endpoint just because the secret is missing). A set-but-mismatched bearer
 * behaves as before: a plain 401 with no alert, so a probing scanner can't
 * spam ops.
 */
export const requireCronAuth = (req: NextRequest): NextResponse | null => {
  if (!env.CRON_SECRET) {
    void notifyOps(
      "CRON_SECRET is unset; all cron invocations are being rejected with 401. Set CRON_SECRET to restore scheduled jobs.",
      { key: "cron-secret-unconfigured", cooldownMs: 24 * 60 * 60 * 1000 },
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!authorized(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
};
