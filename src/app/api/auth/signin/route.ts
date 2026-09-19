import { requestBaseUrl } from "~/server/auth/requestBaseUrl";
import { NextResponse } from "next/server";

import { env } from "~/env";
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

  // Already signed in: land directly, no Entra round-trip needed.
  const session = await auth();
  if (session?.user) {
    return NextResponse.redirect(
      new URL(returnTo ?? "/app", requestBaseUrl(req)),
    );
  }

  if (!env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return NextResponse.redirect(new URL("/", requestBaseUrl(req)));
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
