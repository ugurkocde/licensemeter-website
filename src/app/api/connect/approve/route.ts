import { type NextRequest } from "next/server";

import {
  handoffFailurePath,
  handoffRedirect,
  newHandoffAuthState,
} from "~/server/auth/consentHandoff";
import {
  getSignInClient,
  msalCrypto,
  signInRedirectUri,
  SIGNIN_SCOPES,
} from "~/server/auth/msal";
import { loadPendingHandoff } from "~/server/consentState";

export const GET = async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!(await loadPendingHandoff(token)))
    return handoffRedirect(handoffFailurePath("invalid_state"));

  const { verifier, challenge } = await msalCrypto.generatePkceCodes();
  const state = newHandoffAuthState();
  const url = await getSignInClient().getAuthCodeUrl({
    scopes: SIGNIN_SCOPES,
    redirectUri: signInRedirectUri(),
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  });
  return handoffRedirect(url, {
    phase: "authenticate",
    token,
    state,
    verifier,
  });
};
