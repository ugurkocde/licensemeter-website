"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { ButtonAnchor, ButtonLink } from "~/components/ui";
import { SIGN_IN_PAGE } from "~/lib/signIn";

/**
 * Session-aware header CTA, resolved client-side so the marketing pages can
 * stay statically rendered: the signed-out CTA renders immediately (the
 * common case for visitors) and swaps to "Open dashboard" once
 * /api/auth/session confirms a session.
 */
export const HeaderAuthCta = () => {
  const [signedIn, setSignedIn] = useState(false);
  const german = usePathname().startsWith("/de/");

  useEffect(() => {
    const ctrl = new AbortController();
    const probe = async () => {
      try {
        const res = await fetch("/api/auth/session", { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { signedIn?: boolean };
        if (data.signedIn) setSignedIn(true);
      } catch {
        // Network error or abort: keep the signed-out CTA.
      }
    };
    void probe();
    return () => ctrl.abort();
  }, []);

  /* Always visible: on mobile the nav links live in the burger drawer, so
     the action keeps its header slot. The compact labels and padding below
     400px keep brand + bell + burger + CTA on one line through the 320px
     reflow target. */
  const compact = "max-[399px]:px-3";
  return signedIn ? (
    <ButtonLink href="/app" variant="ink" className={compact}>
      <span className="min-[400px]:hidden">App</span>
      <span className="hidden min-[400px]:inline sm:hidden">Dashboard</span>
      <span className="hidden sm:inline">
        {german ? "Dashboard öffnen" : "Open dashboard"}
      </span>
    </ButtonLink>
  ) : (
    <>
      {/* No room next to brand, bell, burger and CTA below sm, nor beside the
          full link row at lg: there the sign-in page is one click behind the
          CTA. A plain anchor, because the page is rendered per request. */}
      <a
        href={SIGN_IN_PAGE}
        className="text-ink-soft hover:text-ink hidden min-h-11 items-center text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline sm:inline-flex lg:hidden xl:inline-flex"
      >
        {german ? "Anmelden" : "Sign in"}
      </a>
      <ButtonAnchor href={SIGN_IN_PAGE} variant="ink" className={compact}>
        <span className="min-[400px]:hidden">Start</span>
        <span className="hidden min-[400px]:inline">
          {german ? "Kostenlos starten" : "Start free"}
        </span>
      </ButtonAnchor>
    </>
  );
};
