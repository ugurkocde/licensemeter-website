import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// AuthKit's middleware throws on every request unless WORKOS_COOKIE_PASSWORD
// (>=32 chars) and a redirect URI are configured, so wiring it unconditionally
// would 500 the whole site in entra mode (the default) on a deploy with no
// WorkOS env vars. Gate it on the same AUTH_PROVIDER flag the auth layer uses:
// in entra mode the middleware is a pass-through, keeping that path unchanged.
const workosMiddleware = authkitMiddleware();

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (process.env.AUTH_PROVIDER !== "workos") return NextResponse.next();
  return workosMiddleware(request, event);
}

// Match against pages that require auth, excluding static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)"],
};
