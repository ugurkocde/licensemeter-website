import { NextResponse } from "next/server";

import { authProvider, env } from "~/env";
import { auth } from "~/server/auth";
import {
  getSignInClient,
  msalCrypto,
  SIGNIN_SCOPES,
  signInRedirectUri,
} from "~/server/auth/msal";
import {
  createOAuthToken,
  OAUTH_COOKIE,
  oauthCookieOptions,
  validateReturnTo,
} from "~/server/auth/session";

/** Starts the Microsoft sign-in: PKCE + state into a short-lived cookie, redirect to Entra. */
export const GET = async (req: Request) => {
  // Optional in-app destination from marketing links, e.g.
  // ?returnTo=/app/connect/csv. Invalid or absent values mean the default.
  const returnTo = validateReturnTo(
    new URL(req.url).searchParams.get("returnTo"),
  );

  // WorkOS is the only sign-in by default; MSAL login is the entra opt-out.
  // Defer any hit on this legacy route to the WorkOS sign-in entry so old
  // links/bookmarks keep working without ever starting an MSAL login.
  if (authProvider() === "workos") {
    const target = returnTo
      ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`
      : "/auth/sign-in";
    return NextResponse.redirect(new URL(target, req.url));
  }

  // Already signed in: land directly, no Entra round-trip needed.
  const session = await auth();
  if (session?.user) {
    return NextResponse.redirect(new URL(returnTo ?? "/app", req.url));
  }

  if (!env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const { verifier, challenge } = await msalCrypto.generatePkceCodes();
  const state = crypto.randomUUID();

  const authUrl = await getSignInClient().getAuthCodeUrl({
    scopes: SIGNIN_SCOPES,
    redirectUri: signInRedirectUri(),
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    OAUTH_COOKIE,
    await createOAuthToken({
      state,
      verifier,
      ...(returnTo ? { returnTo } : {}),
    }),
    oauthCookieOptions(),
  );
  return res;
};
