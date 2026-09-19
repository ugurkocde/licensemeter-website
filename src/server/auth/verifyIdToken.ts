import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Defense in depth on top of MSAL's TLS-direct token redemption: verify the
 * id_token signature against Microsoft's published JWKS and pin audience,
 * algorithm and the per-tenant issuer pattern.
 */
const JWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);

export type VerifiedEntraClaims = {
  oid: string;
  tid: string;
  name?: string;
  /** Display value unless emailProven is true. */
  email?: string;
  preferred_username?: string;
  /**
   * True only when the token carries xms_edov === true together with an email
   * claim: Microsoft then vouches that the owner of the email's domain has been
   * verified. Without it the email claim is a mutable directory attribute that
   * any tenant admin can set to any address, so it must never grant access.
   * The claim is optional and has to be enabled on the sign-in app registration
   * (optional claims, ID token: email and xms_edov).
   */
  emailProven: boolean;
};

/**
 * Reads the email proof off verified claims. Strictly the boolean true: the
 * strings "true" or "1" and any other shape count as not proven.
 */
export const emailProofOf = (
  claims: Record<string, unknown>,
): { email?: string; emailProven: boolean } => {
  const raw = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!raw) return { emailProven: false };
  const emailProven = claims.xms_edov === true;
  return { email: emailProven ? raw.toLowerCase() : raw, emailProven };
};

export const verifyEntraIdToken = async (
  rawToken: string,
  expectedAudience: string,
): Promise<VerifiedEntraClaims> => {
  const { payload } = await jwtVerify(rawToken, JWKS, {
    audience: expectedAudience,
    algorithms: ["RS256"],
  });
  const claims = payload as Record<string, unknown>;
  const oid = typeof claims.oid === "string" ? claims.oid : null;
  const tid = typeof claims.tid === "string" ? claims.tid : null;
  if (!oid || !tid) throw new Error("id_token missing oid/tid");
  if (claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
    throw new Error("id_token issuer does not match tid");
  }
  return {
    oid,
    tid,
    name: typeof claims.name === "string" ? claims.name : undefined,
    ...emailProofOf(claims),
    preferred_username:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined,
  };
};

/**
 * The session identity of verified claims. `upn` is preferred_username and
 * nothing else: unclaimed invites match it from any tenant, which is only sound
 * while it cannot be the free-text email claim. Without it the UPN is empty and
 * that rule simply does not apply. `email` falls back to the UPN for display;
 * emailProven says whether it may ever be used to link a membership.
 */
export const sessionIdentityOf = (claims: VerifiedEntraClaims) => {
  const upn = claims.preferred_username ?? "";
  return {
    oid: claims.oid,
    tid: claims.tid,
    upn,
    name: claims.name ?? (upn || (claims.email ?? "")),
    email: claims.email ?? (upn || null),
    isDemo: false,
    emailProven: claims.emailProven,
  };
};
