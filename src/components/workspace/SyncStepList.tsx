import { Check, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { syncStepLabel } from "~/lib/activityLabels";
import type { SyncStep } from "~/server/types";

const STEP_TONE: Record<SyncStep["status"], string> = {
  ok: "border-line bg-canvas text-ink-soft",
  skipped: "border-line bg-card text-ink-faint",
  warning: "border-gold/25 bg-gold-soft text-gold-text",
  failed: "border-danger/25 bg-danger-soft text-danger-text",
};

/** "4 s" below a minute, "2 min 5 s" above; whole seconds are enough here. */
const fmtDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ""}`;
};

/**
 * The steps of one sync run as compact tags: label, item count, any status
 * other than ok, and the duration of steps that took a second or more (older
 * runs carry no durations and sub-second steps stay quiet). The live view
 * marks finished steps with a check and appends the step still in progress.
 */
export const SyncStepList = ({
  steps,
  error,
  checks = false,
  trailing,
}: {
  steps: readonly SyncStep[];
  error?: string | null;
  /** Mark each ok step with a check, for the live checklist. */
  checks?: boolean;
  /** A last item after the steps, such as the step still in progress. */
  trailing?: ReactNode;
}) => {
  if (steps.length === 0 && !trailing) {
    return error ? (
      <p className="text-danger-text text-xs break-words">{error}</p>
    ) : null;
  }
  return (
    <ul aria-label="Sync steps" className="flex flex-wrap gap-1.5">
      {steps.map((s, i) => (
        <li
          key={`${s.step}-${i}`}
          className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] leading-5 ${STEP_TONE[s.status]}`}
        >
          {checks && s.status === "ok" && (
            <Check
              aria-hidden="true"
              className="text-good-text -ml-0.5 size-3 shrink-0"
            />
          )}
          <span className="min-w-0 truncate">{syncStepLabel(s.step)}</span>
          {s.count !== undefined && (
            <span className="tnum text-ink font-mono font-medium">
              {s.count.toLocaleString("en-GB")}
            </span>
          )}
          {s.status !== "ok" && (
            <span className="font-medium capitalize">{s.status}</span>
          )}
          {(s.durationMs ?? 0) >= 1000 && (
            <span className="tnum text-ink-faint inline-flex items-center gap-0.5">
              <Timer aria-hidden="true" className="size-3" />
              <span className="sr-only">took </span>
              {fmtDuration(s.durationMs!)}
            </span>
          )}
        </li>
      ))}
      {trailing}
    </ul>
  );
};
