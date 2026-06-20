"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonClass } from "~/components/ui";
import { updatePrice } from "~/server/actions";

export const PriceEditor = ({
  skuId,
  name,
  initial,
  currency,
}: {
  skuId: string;
  /** Human-readable product name for the aria-label; skuId is often a GUID. */
  name?: string;
  initial: string;
  currency: string;
}) => {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = value !== initial;

  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updatePrice(skuId, value);
          setState(result.ok ? "saved" : "error");
          if (result.ok) router.refresh();
        });
      }}
    >
      <span className="text-xs text-ink-faint">{currency}</span>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        inputMode="decimal"
        aria-label={`Monthly price for ${name ?? skuId}`}
        className="tnum w-24 border border-line bg-card px-2 py-1.5 text-right font-mono text-sm focus:border-ink"
      />
      <button
        disabled={!dirty || pending}
        className={buttonClass("micro", "py-1.5")}
      >
        {pending ? "…" : "Save"}
      </button>
      <span
        aria-live="polite"
        className={`w-10 text-[11px] ${state === "error" ? "text-danger-text" : "text-moss"}`}
      >
        {state === "saved" ? "Saved" : state === "error" ? "Invalid" : ""}
      </span>
    </form>
  );
};
