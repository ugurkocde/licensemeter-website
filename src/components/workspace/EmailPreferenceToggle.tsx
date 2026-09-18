"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { setMyEmailPreference } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/**
 * Personal "Email me" toggle for one scheduled email (weekly digest or
 * monthly report). Same optimistic save-on-change pattern and live region as
 * MonthlyReportToggle, but it only changes the signed-in person's own copy.
 */
export const EmailPreferenceToggle = ({
  job,
  label,
  initial,
}: {
  job: "digest" | "report";
  label: string;
  initial: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(initial);
  const [lastValue, setLastValue] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  /* Re-sync if the server-confirmed value changes underneath us. */
  if (lastValue !== initial) {
    setLastValue(initial);
    setCurrent(initial);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label
        className={`flex cursor-pointer items-center gap-2 text-sm ${
          pending ? "opacity-60" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={current}
          aria-busy={pending || undefined}
          onChange={(e) => {
            const next = e.target.checked;
            /* One mutation at a time. */
            if (inFlight.current) return;
            inFlight.current = true;
            setCurrent(next);
            setResult(null);
            startTransition(async () => {
              try {
                const res = await setMyEmailPreference(job, next);
                setResult(res);
                if (!res.ok) {
                  setCurrent(initial);
                  return;
                }
                router.refresh();
              } finally {
                inFlight.current = false;
              }
            });
          }}
          className="accent-ink size-4 shrink-0"
        />
        <span>{label}</span>
      </label>
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
            ? "Saved."
            : (result.error ?? "Save failed")}
      </span>
    </div>
  );
};
