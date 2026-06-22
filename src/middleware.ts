import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

// Match against pages that require auth, excluding static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image).*)"],
};
