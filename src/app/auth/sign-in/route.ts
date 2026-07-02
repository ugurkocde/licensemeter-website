import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { validateReturnTo } from "~/server/auth/session";

export const GET = async (req: NextRequest) => {
  const returnTo = validateReturnTo(req.nextUrl.searchParams.get("returnTo"));

  // Already signed in: land directly, no auth round-trip needed.
  const { user } = await withAuth();
  if (user) {
    return NextResponse.redirect(new URL(returnTo ?? "/app", req.url));
  }

  // returnTo must travel as `returnTo` (AuthKit seals it as returnPathname and
  // the callback redirects there); the `state` option is customState, which the
  // callback never uses for the post-login redirect, so it would be dropped.
  const signInUrl = await getSignInUrl({
    returnTo: returnTo ?? undefined,
  });
  return redirect(signInUrl);
};
