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
  const [confirmDecline, setConfirmDecline] = useState(false);
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
      } catch {
        setError(
          "Could not save the decision. Check your connection and try again.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div className="flex flex-col items-start sm:items-end">
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
          onClick={() => setConfirmDecline(true)}
        >
          Decline
        </Button>
      </div>
      {confirmDecline && (
        <div className="border-line mt-2 max-w-xs rounded-lg border p-3 text-sm">
          <p className="[overflow-wrap:anywhere] break-words">
            Decline access for {email}? They will see the decision and need an
            invitation to join later.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="micro"
              disabled={pending}
              onClick={() => decide(declineJoinRequest)}
            >
              Confirm decline
            </Button>
            <Button
              variant="micro"
              disabled={pending}
              onClick={() => setConfirmDecline(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
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
