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
    return NextResponse.redirect(new URL(pathname + search, apex), 308);
  }

  return NextResponse.next();
}

// Every page and API path, excluding static assets.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)",
  ],
};
