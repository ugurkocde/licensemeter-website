import { requestBaseUrl } from "~/server/auth/requestBaseUrl";
import { NextResponse } from "next/server";

import { revokeCurrentSession } from "~/server/auth";
import { isSameOrigin } from "~/server/auth/origin";
import { expiredSessionCookie } from "~/server/auth/session";

export const POST = async (req: Request) => {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Record the session as revoked so a stolen cookie stops working now, not at
  // its 30-day expiry. Best effort: signing out must not fail if the DB is down.
  await revokeCurrentSession().catch(() => undefined);
  const res = NextResponse.redirect(new URL("/", requestBaseUrl(req)), 303);
  // Expire with full attributes: a bare delete() lacks Secure and the
  // browser would reject it for the prod __Host- cookie name.
  res.cookies.set(expiredSessionCookie());
  return res;
};
