"use client";

import { useEffect, useState } from "react";

/**
 * Small dashboard notice for someone waiting on an access request. It goes away
 * by itself once the request is decided; dismissing only hides it in this
 * browser.
 */
export const JoinRequestNotice = ({
  requestId,
  workspaceName,
}: {
  requestId: string;
  workspaceName: string;
}) => {
  const localKey = `lm_join_notice_${requestId}`;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(localKey) === "dismissed") {
        setHidden(true);
      }
    } catch {
      /* Storage blocked: the notice simply stays visible. */
    }
  }, [localKey]);

  if (hidden) return null;

  return (
    <aside
      aria-label="Access request"
      className="border-brand/20 bg-brand-soft text-brand-text mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-2 text-sm"
    >
      <p className="min-w-0 break-words">
        You asked to join <strong>{workspaceName}</strong>. An admin there needs
        to approve it.
      </p>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            window.localStorage.setItem(localKey, "dismissed");
          } catch {
            /* Storage blocked: hidden for this page view only. */
          }
        }}
        className="hover:text-ink inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4"
      >
        Dismiss
      </button>
    </aside>
  );
};
