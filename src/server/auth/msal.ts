import {
  ConfidentialClientApplication,
  CryptoProvider,
} from "@azure/msal-node";

import { appBaseUrl, env } from "~/env";
import { CONNECTOR_SCOPES } from "~/lib/scopes";

/**
 * MSAL confidential client for the multi-tenant web sign-in (auth-code flow
 * with PKCE against /organizations: work and school accounts from any
 * tenant, personal accounts blocked). The connector's app-only client lives
 * separately in server/graph/msGraph.ts.
 */

export const SIGNIN_SCOPES = ["openid", "profile", "email"];

/**
 * Delegated Graph scopes for the one-shot instant scan: the delegated
 * equivalents of the connector's application permissions, rendered from the
 * same constant so the two lists can never drift. Requested dynamically at
 * runtime (v2 incremental consent), so they need no app-registration change
 * and an Application Administrator or Cloud Application Administrator can
 * consent. Microsoft's Global-Admin restriction applies only to APPLICATION
 * permissions. offline_access is not listed here, but msal-node hardcodes
 * appending the OIDC defaults (openid, profile, offline_access) to every
 * authorize request. The refresh token Entra returns therefore exists,
 * lives only in the per-request getScanClient() instance's memory, and is
 * discarded with it. Nothing is ever persisted.
 */
export const SCAN_SCOPES: string[] = CONNECTOR_SCOPES.map((s) => s.scope);

export const signInRedirectUri = () =>
  // Path kept identical to the app registration created by setup-entra.ps1.
  `${appBaseUrl()}/api/auth/callback/microsoft-entra-id`;

let app: ConfidentialClientApplication | null = null;

export const getSignInClient = (): ConfidentialClientApplication => {
  if (!env.AUTH_MICROSOFT_ENTRA_ID_ID || !env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ID / AUTH_MICROSOFT_ENTRA_ID_SECRET are not configured",
    );
  }
  app ??= new ConfidentialClientApplication({
    auth: {
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      authority: "https://login.microsoftonline.com/organizations",
    },
  });
  return app;
};

/**
 * Fresh confidential client for the instant-scan code redemption,
 * deliberately NOT the cached sign-in singleton, so the redeemed Graph
 * access token (and the refresh token MSAL requests implicitly via its
 * default offline_access) live only in this request's memory and are
 * discarded with it. "No tokens stored, ever" is a product promise.
 */
export const getScanClient = (): ConfidentialClientApplication => {
  if (!env.AUTH_MICROSOFT_ENTRA_ID_ID || !env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ID / AUTH_MICROSOFT_ENTRA_ID_SECRET are not configured",
    );
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      authority: "https://login.microsoftonline.com/organizations",
    },
  });
};

export const msalCrypto = new CryptoProvider();

/** The id_token claims this app consumes. */
export type EntraIdTokenClaims = {
  oid?: string;
  tid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  /** Email domain owner verified; see VerifiedEntraClaims.emailProven. */
  xms_edov?: boolean;
};
