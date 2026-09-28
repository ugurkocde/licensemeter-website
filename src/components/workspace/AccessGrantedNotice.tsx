"use client";
import { useEffect, useState } from "react";

export const AccessGrantedNotice = ({
  workspaceName,
  role,
}: {
  workspaceName: string;
  role: string;
}) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // The server verified the request and current membership before rendering.
    // Remove the confirmation URL so refreshing does not replay this message.
    const url = new URL(window.location.href);
    url.searchParams.delete("accessRequest");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      className="border-good-text/20 bg-good-soft text-good-text mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
    >
      <p className="min-w-0 break-words">
        You now have {role} access to <strong>{workspaceName}</strong>. This is
        your active workspace.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 hover:opacity-80"
        aria-label="Dismiss access confirmation"
      >
        Got it
      </button>
    </div>
  );
};
