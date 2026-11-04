/**
 * Whether a failed managed sync was rejected because of LicenseMeter's own
 * connector credential (secret invalid or expired, certificate or client
 * assertion rejected) rather than a missing consent in the customer's tenant.
 * Granting admin consent again cannot fix these, so the connector page must
 * not offer it as the remedy. Everything else (for example AADSTS7000229,
 * the enterprise app missing from the tenant) is treated as lost consent.
 */
export const isConnectorCredentialError = (
  message: string | null | undefined,
): boolean =>
  Boolean(message) &&
  /AADSTS7000215|AADSTS7000222|AADSTS700027|client assertion/i.test(message!);
