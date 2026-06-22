import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";

/**
 * Validates returnTo paths: must start with /app and not contain
 * protocol-relative, absolute, or dangerous characters.
 */
const validateReturnTo = (value: string | null): string | null => {
  if (!value) return null;
  if (!value.startsWith("/app") || value.startsWith("//")) return null;
  if (value.includes("://") || /[\\\r\n]/.test(value)) return null;
  return value;
};

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
