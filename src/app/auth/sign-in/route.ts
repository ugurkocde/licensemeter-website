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

  // WorkOS supports state parameter to pass custom data through the auth flow
  const signInUrl = await getSignInUrl({
    state: returnTo ? JSON.stringify({ returnTo }) : undefined,
  });
  return redirect(signInUrl);
};
