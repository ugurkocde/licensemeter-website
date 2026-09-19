import { NextResponse, type NextRequest } from "next/server";

import { auth } from "~/server/auth";
import { requestBaseUrl } from "~/server/auth/requestBaseUrl";
import { redeemClaim } from "~/server/membershipClaims";

/**
 * Landing of the claim mail. Needs the session that asked for the link: signed
 * out, nothing is consumed and the person can sign in and open the link again;
 * with any other session the token does nothing. A GET that changes state is
 * acceptable here because the unguessable single-use token, bound to the
 * requesting identity, is itself the authorization.
 */
export const GET = async (req: NextRequest) => {
  const base = requestBaseUrl(req);
  const failed = NextResponse.redirect(new URL("/sign-in?claim=expired", base));
  // The token must not travel on in a Referer header.
  failed.headers.set("Referrer-Policy", "no-referrer");

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const session = await auth();
  if (!session?.user?.oid || !token) return failed;
  if (!(await redeemClaim(session, token))) return failed;

  const res = NextResponse.redirect(new URL("/app", base));
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
};
