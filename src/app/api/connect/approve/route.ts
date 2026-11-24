import { type NextRequest } from "next/server";

import {
  allowHandoffRequest,
  handoffFailurePath,
  handoffRedirect,
  newHandoffAuthState,
  readHandoffProof,
} from "~/server/auth/consentHandoff";
import {
  getSignInClient,
  msalCrypto,
  signInRedirectUri,
  SIGNIN_SCOPES,
} from "~/server/auth/msal";
import { isSameOrigin } from "~/server/auth/origin";
import { loadPendingHandoff, microsoftConsentUrl } from "~/server/consentState";

export const POST = async (req: NextRequest) => {
  if (!req.headers.has("origin") || !isSameOrigin(req)) {
    return new Response(null, { status: 403 });
  }
  if (!(await allowHandoffRequest("submit", req.headers))) {
    return handoffRedirect(handoffFailurePath("rate_limited"));
  }

  const form = await req.formData().catch(() => null);
  if (form?.get("intent") === "confirm") {
    const proof = await readHandoffProof();
    if (proof?.phase !== "confirm") {
      return handoffRedirect(handoffFailurePath("invalid_state"));
    }
    const handoff = await loadPendingHandoff(proof.token);
    if (!handoff || handoff.state.tid?.toLowerCase() !== proof.tid) {
      return handoffRedirect(handoffFailurePath("invalid_state"));
    }
    return handoffRedirect(microsoftConsentUrl(proof.token, proof.tid), {
      phase: "grant",
      token: proof.token,
      tid: proof.tid,
      oid: proof.oid,
    });
  }

  const token = form?.get("token");
  if (typeof token !== "string" || !(await loadPendingHandoff(token))) {
    return handoffRedirect(handoffFailurePath("invalid_state"));
  }

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
