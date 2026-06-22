import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// WorkOS AuthKit is the default sign-in, so its middleware runs on every
// matched request. The one exception is the entra opt-out (AUTH_PROVIDER=entra),
// where AuthKit isn't configured and its middleware would throw per-request
// (it requires WORKOS_COOKIE_PASSWORD >=32 chars + a redirect URI); there it is
// a pass-through. Gated on the same flag the auth layer uses.
const workosMiddleware = authkitMiddleware();

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (process.env.AUTH_PROVIDER === "entra") return NextResponse.next();
  return workosMiddleware(request, event);
}

// Match against pages that require auth, excluding static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)"],
};
