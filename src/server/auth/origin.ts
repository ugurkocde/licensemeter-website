import { requestBaseUrl } from "~/server/auth/requestBaseUrl";

/**
 * CSRF guard for custom POST route handlers (server actions get this from
 * Next.js automatically). With sameSite=lax, a cross-site form POST still
 * reaches the handler. Comparing Origin to the request's own origin blocks it.
 * Behind a self-hosted reverse proxy the configured public origin
 * (requestBaseUrl) is authoritative, so a proxy that rewrites Host or the
 * scheme does not break same-origin requests.
 */
export const isSameOrigin = (req: Request): boolean => {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients send no Origin
  try {
    return new URL(origin).origin === new URL(requestBaseUrl(req)).origin;
  } catch {
    return false;
  }
};
