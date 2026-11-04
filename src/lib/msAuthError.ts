/**
 * App-only authentication failures of a Microsoft sync (expired or revoked
 * credential, missing consent), as opposed to data errors. Matches
 * MSAL/AADSTS token-acquisition codes only, deliberately not the bare word
 * "certificate", which can appear in unrelated Graph error bodies
 * (AADSTS700027 already covers cert-credential failures, "client assertion"
 * the JWT-assertion path). Kept as source text so the same pattern can run
 * in Postgres (`~*`) and in JavaScript.
 */
export const APP_AUTH_ERROR_PATTERN =
  "AADSTS7000215|AADSTS700027|AADSTS700016|AADSTS7000222|invalid_client|invalid client secret|client assertion|acquire app-only token";

export const isAppAuthError = (message: string): boolean =>
  new RegExp(APP_AUTH_ERROR_PATTERN, "i").test(message);

/**
 * Whether a failed managed sync was rejected because of LicenseMeter's own
 * connector credential (secret invalid or expired, certificate or client
 * assertion rejected) rather than a missing consent in the customer's tenant.
 * Granting admin consent again cannot fix these, so the connector page must
 * not offer it as the remedy. The other app-only auth failures (for example
 * AADSTS7000229, the enterprise app missing from the tenant) are lost consent.
 */
export const isConnectorCredentialError = (
  message: string | null | undefined,
): boolean =>
  Boolean(message) &&
  /AADSTS7000215|AADSTS7000222|AADSTS700027|client assertion/i.test(message!);
