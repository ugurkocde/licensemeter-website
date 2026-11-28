"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * A small destructive text button with the armed-confirm pattern of
 * MemberActions and RevokeTokenButton: the first click arms it, a second
 * click within about five seconds runs the action. The outcome is announced
 * in a live region.
 */
export const ArmedActionButton = ({
  label,
  confirmLabel,
  busyLabel,
  ariaLabel,
  run,
}: {
  label: string;
  confirmLabel: string;
  busyLabel: string;
  /** Names the row, e.g. "Revoke CFO link". */
  ariaLabel: string;
  run: () => Promise<{ ok: boolean; error?: string }>;
}) => {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={armed ? `Confirm: ${ariaLabel}` : ariaLabel}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          setError(null);
          startTransition(async () => {
            try {
              const res = await run();
              if (!res.ok) setError(res.error ?? "Failed");
              else router.refresh();
            } catch {
              setError("Failed. Try again.");
            }
          });
        }}
        className={`inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline disabled:opacity-50 ${
          armed
            ? "text-danger-text font-medium"
            : "text-ink-faint hover:text-ink"
        }`}
      >
        {pending ? busyLabel : armed ? confirmLabel : label}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={error ? "text-danger-text text-xs" : "sr-only"}
      >
        {error}
      </span>
    </span>
  );
};
