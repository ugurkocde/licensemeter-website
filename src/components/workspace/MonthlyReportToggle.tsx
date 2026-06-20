"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { setMonthlyReport } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/**
 * Monthly PDF report toggle for the Workspace card. Same optimistic
 * save-on-change pattern as LeakAlertsToggle, plus a live region so the
 * result is announced instead of discarded.
 */
export const MonthlyReportToggle = ({ initial }: { initial: boolean }) => {
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
                const res = await setMonthlyReport(next);
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
          className="size-4 shrink-0 accent-ink"
        />
        <span>Email me the PDF report monthly</span>
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
