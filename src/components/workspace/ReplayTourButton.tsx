"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { resetTour } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

export const ReplayTourButton = () => {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => {
          if (inFlight.current) return;
          inFlight.current = true;
          setResult(null);
          startTransition(async () => {
            try {
              const res = await resetTour();
              setResult(res);
              if (res.ok) {
                router.refresh();
                router.push("/app");
              }
            } finally {
              inFlight.current = false;
            }
          });
        }}
        className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium text-ink underline-offset-4 transition hover:text-brand-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Replay tour
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
          ? null
          : result.ok
            ? "Tour reset."
            : (result.error ?? "Reset failed")}
      </span>
    </div>
  );
};
