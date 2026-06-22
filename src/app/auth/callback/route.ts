import { handleAuth } from "@workos-inc/authkit-nextjs";

/**
 * WorkOS callback handler. Returns to /app by default.
 *
 * Sign-in tracking is handled by the access layer when the user first
 * accesses a protected route, not here in the callback.
 */
export const GET = handleAuth({ returnPathname: "/app" });
