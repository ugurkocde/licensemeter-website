/**
 * Client-safe sign-in paths and messages. Nothing here reads the environment,
 * so the header CTA (a client component) and the sign-in page share it.
 */

/** The explainer page every sign-in entry leads to. Mirrors signInPath(). */
export const SIGN_IN_PAGE = "/sign-in";

/** The route that starts the Microsoft redirect. */
export const SIGN_IN_START = "/api/auth/signin";

export const DOCS_URL = "https://docs.licensemeter.com/";

const MARKETPLACE_LANDING = "/marketplace/landing";

/**
 * Passes a `returnTo` search param through unchanged when it points into the
 * app or at the Marketplace landing page, and drops it otherwise. This only
 * keeps junk out of the button's href: the sign-in route validates the value
 * again (validateReturnTo) before it is ever used as a redirect target.
 */
export const passThroughReturnTo = (
  value: string | string[] | null | undefined,
): string | null => {
  if (typeof value !== "string" || !value) return null;
  const marketplaceLanding =
    value === MARKETPLACE_LANDING ||
    value.startsWith(`${MARKETPLACE_LANDING}?`);
  if (!value.startsWith("/app") && !marketplaceLanding) return null;
  if (value.includes("://") || /[\\\r\n]/.test(value)) return null;
  return value;
};

/**
 * The public page a sign-in started from, kept with a first sign-in so we can
 * see which pages lead to sign-ups. Only plain lower-case marketing paths
 * qualify: no query string (it could carry tokens or campaign IDs), nothing
 * in the app, the API or the sign-in flow itself. Anything else reads as
 * unknown. Applied when the link is built, when the OAuth cookie is minted
 * and again when the callback consumes it.
 */
export const validateSignupSource = (
  value: string | string[] | null | undefined,
): string | null => {
  if (typeof value !== "string" || !value || value.length > 120) return null;
  if (!/^\/[a-z0-9/-]*$/.test(value) || value.startsWith("//")) return null;
  if (/^\/(app|api|auth|sign-in|marketplace)(\/|$)/.test(value)) return null;
  return value;
};

/**
 * The same-origin path of a Referer header. The site sends
 * strict-origin-when-cross-origin, so a click from one of our own pages
 * carries its path; anything cross-origin or missing reads as unknown.
 */
export const signupSourceFromReferer = (
  referer: string | null | undefined,
  host: string | null | undefined,
): string | null => {
  if (!referer || !host) return null;
  try {
    const url = new URL(referer);
    return url.host === host ? validateSignupSource(url.pathname) : null;
  } catch {
    return null;
  }
};

/** Href of the "Sign in with Microsoft" button. */
export const signInStartHref = (
  returnTo?: string | null,
  from?: string | null,
): string => {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  const source = validateSignupSource(from);
  if (source) params.set("from", source);
  const query = params.toString();
  return query ? `${SIGN_IN_START}?${query}` : SIGN_IN_START;
};

/**
 * Messages for the ?error= codes the sign-in callback redirects back with.
 * The raw parameter is never echoed: an unknown code gets the generic text.
 */
export const SIGN_IN_ERROR_TEXT: Record<string, string> = {
  failed:
    "Microsoft could not complete the sign-in. Nothing was changed. Please try again.",
  declined:
    "The Microsoft sign-in was cancelled before it finished. You can start again whenever you are ready.",
  expired:
    "The sign-in was left open for too long, so it expired. Please start again.",
  personal_account:
    "Personal Microsoft accounts cannot sign in. Use the work or school account your organisation gave you.",
  not_configured: "Sign-in is not configured on this deployment yet.",
};

export const signInErrorText = (
  code: string | string[] | null | undefined,
): string | null => {
  if (typeof code !== "string" || !code) return null;
  return SIGN_IN_ERROR_TEXT[code] ?? SIGN_IN_ERROR_TEXT.failed!;
};
