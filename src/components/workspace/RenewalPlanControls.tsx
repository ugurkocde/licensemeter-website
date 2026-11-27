"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "~/components/ui";
import type { SkuTermChoice } from "~/lib/renewalTerm";
import {
  setRenewalBuffer,
  setRenewalSkuTerm,
} from "~/app/app/(dash)/renewals/actions";

const MAX_BUFFER = 50;

/** Workspace-wide headroom on top of active seats. */
export const BufferEditor = ({ initial }: { initial: number }) => {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const parsed = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_BUFFER;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setMessage({ ok: false, text: `Enter 0 to ${MAX_BUFFER}.` });
          return;
        }
        startTransition(async () => {
          const result = await setRenewalBuffer(parsed);
          setMessage(
            result.ok
              ? { ok: true, text: "Buffer saved." }
              : { ok: false, text: result.error ?? "Could not save." },
          );
          if (result.ok) router.refresh();
        });
      }}
    >
      <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium">
        Buffer on active seats (%)
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_BUFFER}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={!valid}
          autoComplete="off"
          className="tnum border-line-input bg-card min-h-11 w-28 rounded-xl border px-3 py-2 text-sm font-normal"
        />
      </label>
      <Button type="submit" disabled={pending || !valid || parsed === initial}>
        {pending ? "Saving…" : "Save buffer"}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className={
          message
            ? `basis-full text-xs ${message.ok ? "text-moss" : "text-danger-text"}`
            : "sr-only"
        }
      >
        {message?.text ?? "Buffer unchanged."}
      </p>
    </form>
  );
};

const CHOICE_LABELS: Record<SkuTermChoice, string> = {
  annual: "Annual or multi-year",
  monthly: "Monthly (NCE), skip reminders",
  monthly_alerts: "Monthly (NCE), include in reminders",
};

/**
 * Billing term of one Microsoft subscription. Renewal reminders cover annual
 * and multi-year terms; a monthly term is included only when chosen here.
 */
export const SkuTermSelect = ({
  skuId,
  label,
  initial,
}: {
  skuId: string;
  label: string;
  initial: SkuTermChoice;
}) => {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink-soft text-xs font-medium">
        Billing term<span className="sr-only"> of {label}</span>
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value as SkuTermChoice;
          const previous = value;
          setValue(next);
          setError("");
          startTransition(async () => {
            const result = await setRenewalSkuTerm(skuId, next);
            if (!result.ok) {
              setValue(previous);
              setError(result.error ?? "Could not save.");
              return;
            }
            router.refresh();
          });
        }}
        className="border-line-input bg-card min-h-11 rounded-xl border px-3 py-2 text-sm"
      >
        {(Object.keys(CHOICE_LABELS) as SkuTermChoice[]).map((choice) => (
          <option key={choice} value={choice}>
            {CHOICE_LABELS[choice]}
          </option>
        ))}
      </select>
      <span
        role="status"
        className={error ? "text-danger-text text-xs" : "sr-only"}
      >
        {error || (pending ? "Saving billing term." : "")}
      </span>
    </div>
  );
};
