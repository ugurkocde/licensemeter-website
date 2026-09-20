"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "~/components/ui";
import { sendCurrentFindingsEmail } from "~/server/actions";
import type { CurrentFindingsActionResult } from "~/server/actions";
import type { CurrentFindingsResult } from "~/server/currentFindings";

/**
 * Mails the offboarding leaks that are open right now, for a workspace whose
 * email went wrong. Real mail to real people, so the button arms first and
 * names how many people it reaches, in the armed-confirm pattern of
 * MemberActions.
 */

const people = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

const outcome = (summary: CurrentFindingsResult): string => {
  if (summary.reason === "no-findings") {
    return "Nothing to send: no offboarding leaks are open right now.";
  }
  if (summary.reason === "no-recipients") {
    return "Nobody to send to: this workspace has no owner or admin address.";
  }
  if (summary.reason === "email-off") return "This workspace sends no email.";
  const parts = [`Sent to ${people(summary.sent)}`];
  if (summary.skippedBlocked > 0) {
    parts.push(
      `${summary.skippedBlocked} ${
        summary.skippedBlocked === 1 ? "address is" : "addresses are"
      } blocked`,
    );
  }
  if (summary.failed > 0) parts.push(`${summary.failed} did not go out`);
  return `${parts.join(", ")}.`;
};

export const SendCurrentFindings = ({
  recipientCount,
  blockedCount,
}: {
  /** Addresses this reaches, blocked ones already taken off. */
  recipientCount: number;
  /** Recipients left out because the provider reported a permanent failure. */
  blockedCount: number;
}) => {
  const [armed, setArmed] = useState(false);
  const [result, action, pending] = useActionState(
    async (_prev: CurrentFindingsActionResult | null) =>
      sendCurrentFindingsEmail(),
    null,
  );

  /* Disarm when the confirm click does not come within ~10s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 10000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-soft max-w-xl text-sm">
        Sends the offboarding leaks that are open right now to the owners, the
        admins and a confirmed shared address, once. Use it when a leak alert
        never arrived. It sends no old email and changes no email setting.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={armed ? "text-sm font-medium" : "sr-only"}
      >
        {armed
          ? `This emails ${people(recipientCount)} now.${
              blockedCount > 0
                ? ` ${people(blockedCount)} ${
                    blockedCount === 1
                      ? "stays out, that address is"
                      : "stay out, those addresses are"
                  } blocked.`
                : ""
            }`
          : null}
      </p>
      <form
        action={action}
        onSubmit={(e) => {
          /* First submit arms only; the second one sends. */
          if (!armed) {
            e.preventDefault();
            setArmed(true);
          } else {
            setArmed(false);
          }
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          variant={armed ? "primary" : "secondary"}
          disabled={pending}
          className="px-4 py-2"
        >
          {pending
            ? "Sending…"
            : armed
              ? `Send to ${people(recipientCount)}`
              : "Send the current findings"}
        </Button>
        {armed && (
          <Button
            type="button"
            onClick={() => setArmed(false)}
            className="px-4 py-2"
          >
            Cancel
          </Button>
        )}
        <span
          role="status"
          aria-live="polite"
          className={
            result
              ? `text-xs ${result.ok ? "text-moss" : "text-danger-text"}`
              : "sr-only"
          }
        >
          {result === null
            ? null
            : result.ok && result.summary
              ? outcome(result.summary)
              : (result.error ?? "The email could not be sent")}
        </span>
      </form>
    </div>
  );
};
