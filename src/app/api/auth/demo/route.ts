import { NextResponse } from "next/server";

import { isDemoMode } from "~/env";
import { isSameOrigin } from "~/server/auth/origin";
import { notifyOps } from "~/server/ops";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import { DEMO_EMAIL, DEMO_OID, DEMO_TID } from "~/server/demo/constants";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "~/server/auth/session";

/** Credentials-free demo entry; the route exists only while DEMO_MODE=true. */
export const POST = async (req: Request) => {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ip = clientIp(req.headers);
  if (!(await rateLimitDurable(`demo:${ip}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  // Lead signal for the founder; hourly cooldown so curious clicking
  // doesn't flood the channel.
  void notifyOps("someone opened the demo workspace", {
    key: "demo-session",
    cooldownMs: 60 * 60 * 1000,
  });

  const token = await createSessionToken({
    oid: DEMO_OID,
    tid: DEMO_TID,
    upn: DEMO_EMAIL,
    name: "Demo Admin",
    email: DEMO_EMAIL,
    isDemo: true,
  });
  const res = NextResponse.redirect(new URL("/app", req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
};
