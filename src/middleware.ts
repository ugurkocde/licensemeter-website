import { NextResponse, type NextRequest } from "next/server";

// Sign-in needs nothing here: the session is a signed cookie that the access
// layer verifies on every protected request, so there is no token to refresh
// and no header to inject. The middleware only handles the status subdomain.
export default function middleware(request: NextRequest) {
  // The status subdomain (status.licensemeter.com) is a single-purpose entry
  // point: "/" serves the status page (rewritten in next.config.js). Any other
  // path is a marketing route that belongs on the canonical site, so bounce the
  // visitor there instead of serving it under the status host. This keeps every
  // shared header/footer link correct without making each one host-aware.
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;
  if (
    host?.startsWith("status.") &&
    pathname !== "/" &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_vercel")
  ) {
    const apex = process.env.APP_BASE_URL ?? "https://licensemeter.com";
    // Build the target from the configured origin and set the path/search on it
    // rather than resolving the raw path against the base. `new URL("//evil.com",
    // apex)` would treat a protocol-relative path (or a backslash, which the URL
    // parser normalizes to a slash) as an authority and redirect off-host; the
    // pathname setter always keeps the configured host.
    const target = new URL(apex);
    target.pathname = pathname;
    target.search = search;
    return NextResponse.redirect(target, 308);
  }

  return NextResponse.next();
}

// Every page and API path, excluding static assets.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)",
  ],
};
