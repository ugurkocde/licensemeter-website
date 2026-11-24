import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { appBaseUrl, env } from "~/env";
import {
  GUID_PATTERN,
  loadPendingHandoff,
  microsoftConsentUrl,
} from "~/server/consentState";
import { getSignInClient, signInRedirectUri, SIGNIN_SCOPES } from "./msal";
import { cookieOptions } from "./session";
import { verifyEntraIdToken } from "./verifyIdToken";

const cookie =
  env.NODE_ENV === "production" ? "__Host-lm_consent" : "lm_consent";
const maxAge = 15 * 60;
const key = new TextEncoder().encode(env.AUTH_SECRET);
const audience = "licensemeter-consent-handoff";
const authStatePrefix = "handoff-auth.";

export const newHandoffAuthState = () => authStatePrefix + crypto.randomUUID();

type HandoffProof =
  | { phase: "authenticate"; token: string; state: string; verifier: string }
  | { phase: "grant"; token: string; tid: string };

export const readHandoffProof = async (): Promise<HandoffProof | null> => {
  const value = (await cookies()).get(cookie)?.value;
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, key, {
      audience,
      algorithms: ["HS256"],
    });
    if (typeof payload.token !== "string") return null;
    if (
      payload.phase === "authenticate" &&
      typeof payload.state === "string" &&
      typeof payload.verifier === "string"
    ) {
      return {
        phase: payload.phase,
        token: payload.token,
        state: payload.state,
        verifier: payload.verifier,
      };
    }
    if (
      payload.phase === "grant" &&
      typeof payload.tid === "string" &&
      GUID_PATTERN.test(payload.tid)
    ) {
      return { phase: payload.phase, token: payload.token, tid: payload.tid };
    }
  } catch {
    // An expired or foreign cookie cannot authorize consent.
  }
  return null;
};

export const handoffFailurePath = (code: string) =>
  `/connect/approve/error?error=${encodeURIComponent(code)}`;

export const handoffRedirect = (url: string, proof?: HandoffProof) => {
  const res = NextResponse.redirect(new URL(url, appBaseUrl()));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (!proof) res.cookies.set(cookie, "", cookieOptions(0));
  return proof ? setProof(res, proof) : res;
};

const setProof = async (res: NextResponse, proof: HandoffProof) => {
  const value = await new SignJWT(proof)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setExpirationTime(`${maxAge}s`)
    .sign(key);
  res.cookies.set(cookie, value, cookieOptions(maxAge));
  return res;
};

// Microsoft Entra built-in role template IDs. The sign-in app must emit
// directory roles in wids (groupMembershipClaims = DirectoryRole).
const ADMIN_ROLES = new Set([
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "e8611ab8-c189-46e8-94e1-60213ab1f814", // Privileged Role Administrator
]);

export const finishHandoffAuthentication = async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  if (!state?.startsWith(authStatePrefix)) return;
  const proof = await readHandoffProof();
  if (proof?.phase !== "authenticate" || proof.state !== state) {
    return handoffRedirect(handoffFailurePath("invalid_state"));
  }

  const code = params.get("code");
  if (params.has("error") || !code)
    return handoffRedirect(handoffFailurePath("approval_identity"));
  if (!(await loadPendingHandoff(proof.token)))
    return handoffRedirect(handoffFailurePath("invalid_state"));

  try {
    const result = await getSignInClient().acquireTokenByCode({
      code,
      scopes: SIGNIN_SCOPES,
      redirectUri: signInRedirectUri(),
      codeVerifier: proof.verifier,
    });
    const claims = await verifyEntraIdToken(
      result.idToken,
      env.AUTH_MICROSOFT_ENTRA_ID_ID!,
    );
    if (
      GUID_PATTERN.test(claims.tid) &&
      claims.directoryRoles?.some((role) => ADMIN_ROLES.has(role))
    ) {
      const tid = claims.tid.toLowerCase();
      return handoffRedirect(microsoftConsentUrl(proof.token, tid), {
        phase: "grant",
        token: proof.token,
        tid,
      });
    }
  } catch {
    return handoffRedirect(handoffFailurePath("approval_identity"));
  }
  return handoffRedirect(handoffFailurePath("approval_identity"));
};
