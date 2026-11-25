import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import {
  GUID_PATTERN,
  HANDOFF_COMPLETION_MAX_AGE_SECONDS,
  loadPendingHandoff,
} from "~/server/consentState";
import { notifyOps } from "~/server/ops";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import { getSignInClient, signInRedirectUri, SIGNIN_SCOPES } from "./msal";
import { requestBaseUrl } from "./requestBaseUrl";
import { cookieOptions } from "./session";
import { verifyEntraIdToken } from "./verifyIdToken";

const cookie =
  env.NODE_ENV === "production" ? "__Host-lm_consent" : "lm_consent";
const completedCookie =
  env.NODE_ENV === "production"
    ? "__Host-lm_consent_completed"
    : "lm_consent_completed";
const completedMaxAge = HANDOFF_COMPLETION_MAX_AGE_SECONDS;
const maxAge = 15 * 60;
const key = new TextEncoder().encode(env.AUTH_SECRET);
const audience = "licensemeter-consent-handoff";
const authStatePrefix = "handoff-auth.";

export const newHandoffAuthState = () => authStatePrefix + crypto.randomUUID();

type HandoffProof =
  | { phase: "authenticate"; token: string; state: string; verifier: string }
  | {
      phase: "confirm";
      token: string;
      tid: string;
      oid: string;
      account: string;
    }
  | { phase: "grant"; token: string; tid: string; oid: string };

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
      typeof payload.tid === "string" &&
      GUID_PATTERN.test(payload.tid) &&
      typeof payload.oid === "string" &&
      GUID_PATTERN.test(payload.oid)
    ) {
      const { token, tid, oid } = payload;
      if (payload.phase === "grant") return { phase: "grant", token, tid, oid };
      if (payload.phase === "confirm" && typeof payload.account === "string") {
        return { phase: "confirm", token, tid, oid, account: payload.account };
      }
    }
  } catch {
    // An expired or foreign cookie cannot authorize consent.
  }
  return null;
};

export const clearHandoffProof = async () => {
  (await cookies()).set(cookie, "", cookieOptions(0));
};

export const setHandoffCompletion = async (token: string) => {
  const value = await new SignJWT({ token })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(completedCookie)
    .setExpirationTime(`${completedMaxAge}s`)
    .sign(key);
  (await cookies()).set(completedCookie, value, cookieOptions(completedMaxAge));
};

export const readHandoffCompletion = async () => {
  const value = (await cookies()).get(completedCookie)?.value;
  if (!value) return;
  try {
    const { payload } = await jwtVerify(value, key, {
      audience: completedCookie,
      algorithms: ["HS256"],
    });
    if (typeof payload.token === "string") return payload.token;
  } catch {
    // An expired or foreign marker cannot open the completion page.
  }
};

export const allowHandoffRequest = async (
  step: "review" | "submit" | "callback",
  headers: Headers,
) => {
  const ip = clientIp(headers);
  // Unattributed traffic shares a bucket across clients.
  const limit = ip === "unknown" ? 300 : 30;
  return rateLimitDurable(
    `consent-handoff:${step}:${ip}`,
    limit,
    60_000,
    "deny",
  );
};

export const handoffFailurePath = (code: string) =>
  `/connect/approve/error?error=${encodeURIComponent(code)}`;

export const handoffRedirect = (
  req: NextRequest,
  url: string,
  proof?: HandoffProof,
) => {
  const res = NextResponse.redirect(new URL(url, requestBaseUrl(req)), 303);
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
    return handoffRedirect(req, handoffFailurePath("invalid_state"));
  }

  const code = params.get("code");
  if (params.has("error") || !code)
    return handoffRedirect(req, handoffFailurePath("approval_identity"));
  if (!(await allowHandoffRequest("callback", req.headers))) {
    return handoffRedirect(req, handoffFailurePath("rate_limited"));
  }
  const handoff = await loadPendingHandoff(proof.token);
  if (!handoff)
    return handoffRedirect(req, handoffFailurePath("invalid_state"));
  const rejectIdentity = (reason: string) => {
    void notifyOps(
      `consent handoff authentication rejected: ${reason} for workspace ${handoff.state.tenantId}`,
      {
        key: `consent-handoff-auth:${handoff.state.tenantId}:${reason}`,
        cooldownMs: maxAge * 1000,
      },
    );
    return handoffRedirect(req, handoffFailurePath(reason));
  };

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
    const tid = claims.tid.toLowerCase();
    if (!GUID_PATTERN.test(claims.oid))
      return rejectIdentity("approval_identity");
    if (tid !== handoff.state.tid?.toLowerCase())
      return rejectIdentity("approval_tenant");
    if (
      !claims.directoryRoles?.some((role) =>
        ADMIN_ROLES.has(role.toLowerCase()),
      )
    ) {
      const reason = claims.directoryRoles
        ? "approval_role_ineligible"
        : "approval_roles_missing";
      console.info(
        `[consent] handoff authentication rejected: ${reason} for workspace ${handoff.state.tenantId}`,
      );
      return handoffRedirect(
        req,
        handoffFailurePath("approval_role_ineligible"),
      );
    }
    const account =
      [claims.preferred_username, claims.email, claims.name]
        .map((value) => value?.trim())
        .find(Boolean) ?? claims.oid;
    return handoffRedirect(req, "/connect/approve/confirm", {
      phase: "confirm",
      token: proof.token,
      tid,
      oid: claims.oid.toLowerCase(),
      account,
    });
  } catch {
    return rejectIdentity("approval_identity");
  }
};
