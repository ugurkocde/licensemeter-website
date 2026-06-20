"use client";

import { useActionState, useEffect, useState } from "react";

import { removeMember, resendInvite } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/** Persistent polite live region; sr-only while empty so the row keeps its height. */
const ActionStatus = ({
  result,
  success,
}: {
  result: ActionResult | null;
  success: string;
}) => {
  const message =
    result === null
      ? null
      : result.ok
        ? success
        : (result.error ?? "Something went wrong");
  return (
    <span
      role="status"
      aria-live="polite"
      className={
        message
          ? `max-w-56 text-right text-xs ${result?.ok ? "text-moss" : "text-danger-text"}`
          : "sr-only"
      }
    >
      {message}
    </span>
  );
};

/**
 * Resend / remove controls for a member row. Wraps the server actions in
 * useActionState so their results surface next to the buttons instead of
 * being discarded; remove uses the same armed-confirm pattern as DangerZone.
 */
export const MemberActions = ({
  membershipId,
  canResend,
  canRemove,
}: {
  membershipId: string;
  canResend: boolean;
  canRemove: boolean;
}) => {
  const [armed, setArmed] = useState(false);

  const [resendResult, resendAction, resendPending] = useActionState(
    async (_prev: ActionResult | null) => resendInvite(membershipId),
    null,
  );
  const [removeResult, removeAction, removePending] = useActionState(
    async (_prev: ActionResult | null) => removeMember(membershipId),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!canResend && !canRemove) return null;

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-3">
        {canResend && (
          <form action={resendAction}>
            <button
              disabled={resendPending}
              className="text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              {resendPending ? "Sending…" : "Resend"}
            </button>
          </form>
        )}
        {canRemove && (
          <form
            action={removeAction}
            onSubmit={(e) => {
              /* First submit arms only; the second one fires the action. */
              if (!armed) {
                e.preventDefault();
                setArmed(true);
              } else {
                setArmed(false);
              }
            }}
          >
            <button
              disabled={removePending}
              onBlur={() => setArmed(false)}
              className={`text-xs underline-offset-4 hover:underline disabled:opacity-50 ${
                armed
                  ? "text-danger-text underline"
                  : "text-ink-faint hover:text-danger-text"
              }`}
            >
              {removePending ? "Removing…" : armed ? "Confirm remove" : "Remove"}
            </button>
            <span role="status" aria-live="polite" className="sr-only">
              {armed ? "Press again to confirm removal." : null}
            </span>
          </form>
        )}
      </div>
      {canResend && (
        <ActionStatus result={resendResult} success="Invite re-sent." />
      )}
      {canRemove && (
        <ActionStatus result={removeResult} success="Member removed." />
      )}
    </div>
  );
};
