"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "~/components/ui";
import { approveJoinRequest, declineJoinRequest } from "~/server/actions";

/**
 * Approve / Decline for one access request in the Members card. One decision
 * at a time; a failure is announced next to the buttons instead of discarded.
 */
export const JoinRequestActions = ({
  requestId,
  email,
}: {
  requestId: string;
  email: string;
}) => {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  const decide = (action: typeof approveJoinRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await action(requestId);
        if (!res.ok) {
          setError(res.error ?? "Something went wrong");
          return;
        }
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <Button
          variant="micro"
          disabled={pending}
          aria-label={`Approve ${email}`}
          onClick={() => decide(approveJoinRequest)}
        >
          Approve
        </Button>
        <Button
          variant="micro"
          disabled={pending}
          aria-label={`Decline ${email}`}
          onClick={() => decide(declineJoinRequest)}
        >
          Decline
        </Button>
      </div>
      <span
        role="status"
        aria-live="polite"
        className={
          error
            ? "text-danger-text mt-1 max-w-56 text-right text-xs"
            : "sr-only"
        }
      >
        {error}
      </span>
    </div>
  );
};
