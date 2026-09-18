"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { setInactiveDays } from "~/server/actions";

const OPTIONS = [30, 60, 90, 120, 180];

/**
 * Inactivity-threshold picker that saves on change with pending + error
 * feedback (the inline server-action form it replaces had neither). Mirrors
 * CurrencySelect: one mutation in flight at a time, revert on failure.
 */
export const InactiveDaysForm = ({ value }: { value: number }) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  /* Re-sync if the server-confirmed value changes underneath us. */
  useEffect(() => setCurrent(value), [value]);

  return (
    <div className="flex items-center gap-2">
      <select
        value={String(current)}
        name="inactiveDays"
        autoComplete="off"
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label="Inactivity threshold in days"
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (inFlight.current || next === current) return;
          inFlight.current = true;
          setCurrent(next);
          setError(null);
          startTransition(async () => {
            try {
              const data = new FormData();
              data.set("days", String(next));
              const result = await setInactiveDays(data);
              if (!result.ok) {
                setCurrent(value);
                setError(result.error ?? "Could not save");
                return;
              }
              router.refresh();
            } finally {
              inFlight.current = false;
            }
          });
        }}
        className={`border-line-input bg-card focus:border-ink min-h-11 border px-2 py-1.5 text-sm ${
          pending ? "opacity-60" : ""
        }`}
      >
        {OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d} days
          </option>
        ))}
      </select>
      <span
        role="status"
        aria-live="polite"
        className={error ? "text-danger-text text-xs" : "sr-only"}
      >
        {error}
      </span>
    </div>
  );
};
