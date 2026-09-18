"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { buttonClass } from "~/components/ui";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "~/lib/currency";
import { setCurrency } from "~/server/actions";

export const CurrencySelect = ({ value }: { value: string }) => {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(value);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => setSelected(value), [value]);

  const dirty = selected !== value;

  return (
    <form
      className="flex max-w-sm flex-col items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || pending) return;
        setMessage("");
        setFailed(false);
        startTransition(async () => {
          try {
            const result = await setCurrency(selected);
            if (!result.ok) {
              setFailed(true);
              setMessage(result.error ?? "Currency conversion failed.");
              return;
            }
            const rate = result.rate?.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            });
            setMessage(
              rate && result.from && result.to
                ? `Converted at 1 ${result.from} = ${rate} ${result.to} (${result.asOf}).`
                : "Currency updated.",
            );
            router.refresh();
          } catch {
            setFailed(true);
            setMessage("Currency conversion failed. Please retry.");
          }
        });
      }}
    >
      <div className="flex items-center gap-2">
        <select
          value={selected}
          name="currency"
          autoComplete="off"
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label="Workspace reporting currency"
          onChange={(event) => {
            setSelected(event.target.value);
            setMessage("");
            setFailed(false);
          }}
          className="border-line-input bg-card focus:border-ink min-h-11 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {SUPPORTED_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {CURRENCY_LABELS[currency]}
            </option>
          ))}
        </select>
        {dirty && (
          <button
            type="submit"
            disabled={pending}
            className={buttonClass("ink")}
          >
            {pending ? "Converting…" : "Convert"}
          </button>
        )}
      </div>
      <p className="text-ink-faint text-xs leading-relaxed">
        Changing currency converts prices, findings, trend history and renewal
        contract values using the latest ECB reference rate. Review negotiated
        prices afterwards.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={
          message
            ? `text-xs ${failed ? "text-danger-text" : "text-moss"}`
            : "sr-only"
        }
      >
        {message || "No currency change in progress."}
      </p>
    </form>
  );
};
