"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "~/components/ui";

/**
 * Session-aware header CTA, resolved client-side so the marketing pages can
 * stay statically rendered: the signed-out CTA renders immediately (the
 * common case for visitors) and swaps to "Open dashboard" once
 * /api/auth/session confirms a session.
 */
export const HeaderAuthCta = () => {
  const [signedIn, setSignedIn] = useState(false);

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
     the action keeps its header slot. Labels shorten below sm to fit brand +
     CTA + burger on 360px viewports without wrapping. */
  return signedIn ? (
    <ButtonLink href="/app" variant="secondary">
      <span className="sm:hidden">Dashboard</span>
      <span className="hidden sm:inline">Open dashboard</span>
    </ButtonLink>
  ) : (
    <ButtonLink href="/#get-started" variant="secondary">
      <span className="sm:hidden">Free scan</span>
      <span className="hidden sm:inline">Run a free scan</span>
    </ButtonLink>
  );
};
