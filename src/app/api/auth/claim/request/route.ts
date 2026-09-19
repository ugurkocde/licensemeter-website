import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { isSameOrigin } from "~/server/auth/origin";
import { requestClaim } from "~/server/membershipClaims";

/**
 * Asks for the claim mail. The answer is the same whether or not a mail went
 * out, so it cannot be used to find out which addresses are members.
 */
export const POST = async (req: Request) => {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.oid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await requestClaim(session);
  // A plain form post (no JavaScript) lands back in the app with the notice.
  if (!(req.headers.get("accept") ?? "").includes("application/json")) {
    return NextResponse.redirect(new URL("/app?claim=sent", req.url), 303);
  }
  return NextResponse.json({ ok: true });
};
