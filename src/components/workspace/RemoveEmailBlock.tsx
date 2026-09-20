"use client";

import { useActionState, useEffect, useState } from "react";

import { removeEmailBlock } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/**
 * Clears one blocked address for this workspace. Armed-confirm button in the
 * MemberActions pattern, so a stray click never puts mail back on the road to
 * a mailbox somebody deliberately stopped.
 */
export const RemoveEmailBlock = ({ email }: { email: string }) => {
  const [armed, setArmed] = useState(false);
  const [result, action, pending] = useActionState(
    async (_prev: ActionResult | null) => removeEmailBlock(email),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        /* First submit arms only; the second one clears the block. */
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        } else {
          setArmed(false);
        }
      }}
      className="flex items-center gap-2"
    >
      <button
        disabled={pending}
        onBlur={() => setArmed(false)}
        className={`inline-flex min-h-11 items-center rounded-lg px-2 text-xs underline-offset-4 hover:underline disabled:opacity-50 ${
          armed ? "border-line-strong text-ink border underline" : "text-ink"
        }`}
      >
        {pending ? "Clearing…" : armed ? "Confirm clear block" : "Clear block"}
      </button>
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
          ? armed
            ? "Press again to confirm."
            : null
          : result.ok
            ? "Block cleared."
            : (result.error ?? "Could not clear the block")}
      </span>
    </form>
  );
};
