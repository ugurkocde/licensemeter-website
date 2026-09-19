import { requestBaseUrl } from "~/server/auth/requestBaseUrl";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth";
import {
  getSignInClient,
  msalCrypto,
  SCAN_SCOPES,
  signInRedirectUri,
} from "~/server/auth/msal";
import {
  createOAuthToken,
  OAUTH_COOKIE,
  oauthCookieOptions,
} from "~/server/auth/session";

/**
 * Starts the delegated instant scan: signed-in users only, delegated Graph
 * scopes requested dynamically (incremental consent, no app-registration
 * change), PKCE + state + kind:"scan" into the short-lived OAuth cookie,
 * then off to Entra. Reuses the registered sign-in redirect URI; the
 * callback branches on the cookie's kind and never touches the session.
 */
export const GET = async (req: Request) => {
  const session = await auth();
  // Signed-in users only; the delegated Microsoft consent below proves tenant
  // access independently.
  if (!session?.user?.oid) {
    return NextResponse.redirect(new URL("/", requestBaseUrl(req)));
  }
  if (session.user.isDemo) {
    return NextResponse.redirect(new URL("/app", requestBaseUrl(req)));
  }
  if (!env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return NextResponse.redirect(new URL("/app/connect", requestBaseUrl(req)));
  }

  const { verifier, challenge } = await msalCrypto.generatePkceCodes();
  const state = crypto.randomUUID();

  const authUrl = await getSignInClient().getAuthCodeUrl({
    scopes: SCAN_SCOPES,
    redirectUri: signInRedirectUri(),
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    // Same account that is already signed in, no account picker.
    loginHint:
      session.user.upn !== ""
        ? session.user.upn
        : (session.user.email ?? undefined),
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    OAUTH_COOKIE,
    await createOAuthToken({ state, verifier, kind: "scan" }),
    oauthCookieOptions(),
  );
  return res;
};
