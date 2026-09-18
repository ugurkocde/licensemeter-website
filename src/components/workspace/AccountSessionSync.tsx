"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { refreshUserSession } from "~/app/app/(dash)/account/actions";

/**
 * Keeps the workspace sidebar in sync with edits made in the WorkOS account
 * widgets (e.g. changing your display name). The widgets write straight to the
 * WorkOS API from the browser and expose no success callback, while the sidebar
 * name comes from the sealed AuthKit session cookie (a login snapshot), so a
 * change otherwise stays invisible until the session refreshes on its own.
 *
 * While mounted (account page only) this watches for a successful mutating
 * request to the WorkOS API, then re-seals the session and re-renders server
 * components so the change shows immediately. window.fetch is patched only for
 * the lifetime of this component and restored on unmount.
 */
export const AccountSessionSync = () => {
  const router = useRouter();

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A single edit can fire several requests in quick succession; debounce so
    // the session is re-sealed once after they settle.
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshUserSession().then(() => router.refresh());
      }, 400);
    };

    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        const input = args[0];
        const url =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : String(input);
        const method = (
          args[1]?.method ?? (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        if (res.ok && method !== "GET" && /\bworkos\.com\b/.test(url)) {
          sync();
        }
      } catch {
        // Detection must never break the underlying request.
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
      clearTimeout(timer);
    };
  }, [router]);

  return null;
};
