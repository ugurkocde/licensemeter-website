"use client";

import type { PlanInterval } from "~/server/types";

/**
 * Segmented monthly/annual control. Two buttons in a pill track; the active
 * segment uses the ink fill, matching the dark-on-light controls elsewhere.
 */
export const IntervalToggle = ({
  interval,
  onChange,
  className = "",
}: {
  interval: PlanInterval;
  onChange: (interval: PlanInterval) => void;
  className?: string;
}) => {
  const options: { value: PlanInterval; label: string }[] = [
    { value: "month", label: "Monthly" },
    { value: "year", label: "Annual" },
  ];
  return (
    <div
      role="group"
      aria-label="Billing interval"
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-card p-1 ${className}`}
    >
      {options.map((option) => {
        const active = interval === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-ink text-canvas"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
