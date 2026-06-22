/**
 * Auth module: WorkOS AuthKit handles authentication. The WorkOS bridge
 * (see ./workos) maps WorkOS user data to the LicenseMeter Session shape.
 *
 * For Microsoft sign-in, configure Microsoft as an SSO connection in WorkOS
 * to ensure Entra claims (oid, tid, upn) pass through rawAttributes.
 *
 * Legacy MSAL-based sign-in preserved in ./msal for reference during
 * migration; the ./session module provides helper types and cookie utilities.
 */
export { auth, clearSessionCookie } from "./workos";
export type { Session, SessionUser } from "./session";
