"use client";

import { useActionState, useEffect, useState } from "react";

import {
  revokeMcpTokenAction,
  type RevokeMcpTokenResult,
} from "~/app/app/(dash)/mcp/actions";

/** Revoke control for a token row, with the armed-confirm pattern of MemberActions. */
export const RevokeTokenButton = ({
  tokenId,
  tokenName,
}: {
  tokenId: string;
  tokenName: string;
}) => {
  const [armed, setArmed] = useState(false);
  const [result, action, pending] = useActionState(
    async (_prev: RevokeMcpTokenResult | null) => revokeMcpTokenAction(tokenId),
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
        /* First submit arms only; the second one fires the action. */
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      className="flex flex-col items-end"
    >
      <button
        disabled={pending}
        aria-label={
          armed ? `Confirm revoking ${tokenName}` : `Revoke ${tokenName}`
        }
        className={`inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline disabled:opacity-50 ${
          armed
            ? "text-danger-text font-medium"
            : "text-ink-faint hover:text-ink"
        }`}
      >
        {pending ? "Revoking…" : armed ? "Confirm revoke" : "Revoke"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={
          result && !result.ok ? "text-danger-text text-xs" : "sr-only"
        }
      >
        {result === null
          ? null
          : result.ok
            ? "Token revoked"
            : (result.error ?? "Something went wrong")}
      </span>
    </form>
  );
};
