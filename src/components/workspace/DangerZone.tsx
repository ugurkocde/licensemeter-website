"use client";

import { useActionState, useEffect, useState } from "react";

import { disconnectTenant } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/**
 * Owner-only workspace deletion with the same single-button armed-confirm
 * pattern as MemberActions: the first press arms the button in place (so
 * keyboard focus never drops), the second one fires the action; Escape,
 * blur or ~5s of inaction disarm it.
 */
export const DangerZone = ({ tenantName }: { tenantName: string }) => {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) => disconnectTenant(),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const message = armed
    ? "Press again to delete every synced record. Escape cancels."
    : result && !result.ok
      ? (result.error ?? "Something went wrong")
      : null;

  return (
    <div className="border border-danger-soft bg-card">
      <div className="border-b border-danger-soft px-5 py-3">
        <h2 className="text-xs font-medium tracking-[0.18em] text-danger-text uppercase">
          Danger zone
        </h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <p className="max-w-md text-sm text-ink-soft">
          Disconnecting deletes every synced record for {tenantName}: users,
          findings, prices, history. The admin consent in your tenant can then
          be revoked under Enterprise applications.
        </p>
        <form
          action={formAction}
          onSubmit={(e) => {
            /* First submit arms only; the second one fires the action. */
            if (!armed) {
              e.preventDefault();
              setArmed(true);
            } else {
              setArmed(false);
            }
          }}
          className="flex flex-col items-end gap-1"
        >
          <button
            disabled={pending}
            onBlur={() => setArmed(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setArmed(false);
            }}
            className={
              armed
                ? "border border-danger bg-danger px-4 py-2 text-xs font-medium tracking-wide text-canvas uppercase hover:border-danger-text hover:bg-danger-text disabled:opacity-50"
                : "border border-danger px-4 py-2 text-xs font-medium tracking-wide text-danger-text uppercase hover:bg-danger-soft"
            }
          >
            {pending
              ? "Deleting…"
              : armed
                ? "Confirm delete everything"
                : "Disconnect workspace"}
          </button>
          <span
            role="status"
            aria-live="polite"
            className={
              message ? "max-w-md text-right text-xs text-danger-text" : "sr-only"
            }
          >
            {message}
          </span>
        </form>
      </div>
    </div>
  );
};
