/**
 * CSRF guard for custom POST route handlers (server actions get this from
 * Next.js automatically). With sameSite=lax, a cross-site form POST still
 * reaches the handler. Comparing Origin to Host blocks it.
 */
export const isSameOrigin = (req: Request): boolean => {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) return true; // non-browser clients send no Origin
  // An Origin is present (a browser made this request) but there's no Host to
  // compare it against: we cannot prove same-origin, so deny rather than pass.
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
