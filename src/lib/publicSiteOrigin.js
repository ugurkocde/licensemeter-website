const HOSTED_ORIGIN = "https://www.licensemeter.com";
const HOSTED_HOSTS = new Set(["licensemeter.com", "www.licensemeter.com"]);

/**
 * Resolve the public origin in both the app and the edge middleware.
 * @param {{ PUBLIC_SITE_URL?: string, APP_BASE_URL?: string, SELF_HOSTED?: string }} config
 */
export function resolvePublicSiteOrigin({
  PUBLIC_SITE_URL,
  APP_BASE_URL,
  SELF_HOSTED,
}) {
  if (PUBLIC_SITE_URL) return new URL(PUBLIC_SITE_URL).origin;

  const appUrl = APP_BASE_URL ? new URL(APP_BASE_URL) : null;
  if (SELF_HOSTED === "true") return appUrl?.origin ?? "http://localhost:3000";
  if (appUrl && !HOSTED_HOSTS.has(appUrl.hostname)) return appUrl.origin;

  return HOSTED_ORIGIN;
}
