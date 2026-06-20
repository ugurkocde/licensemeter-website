"use client";

import { useActionState } from "react";

import { Button } from "~/components/ui";
import { importPrices } from "~/server/actions";
import type { ImportPricesResult } from "~/server/actions";

type ImportState = (ImportPricesResult & { csv?: string }) | null;

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Outcome sentence(s) for the live region: applied, skipped, unparseable. */
const summary = (result: ImportPricesResult): string => {
  const parts: string[] = [];
  if (result.ok) {
    parts.push(`Applied ${result.applied} ${plural(result.applied, "price")}.`);
  } else {
    // Every part must be a full sentence so the join reads cleanly.
    const error = result.error ?? "Import failed.";
    parts.push(error.endsWith(".") ? error : `${error}.`);
  }
  if (result.skipped.length > 0) {
    const shown = result.skipped.slice(0, 8).join(", ");
    const more =
      result.skipped.length > 8
        ? ` and ${result.skipped.length - 8} more`
        : "";
    parts.push(
      `Skipped ${result.skipped.length} unknown ${plural(result.skipped.length, "key")}: ${shown}${more}.`,
    );
  }
  if (result.invalid > 0) {
    parts.push(
      `${result.invalid} ${plural(result.invalid, "line")} could not be parsed.`,
    );
  }
  return parts.join(" ");
};

/**
 * Paste-CSV bulk price import. Wraps the importPrices server action in
 * useActionState so the per-row outcome surfaces in a live region; on
 * failure the pasted text survives the form reset (same remount trick as
 * the InviteForm).
 */
export const ImportPricesForm = () => {
  const [result, formAction, pending] = useActionState(
    async (_prev: ImportState, formData: FormData): Promise<ImportState> => {
      const csv = formData.get("csv");
      const res = await importPrices(formData);
      return { ...res, csv: typeof csv === "string" ? csv : undefined };
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="price-import-csv" className="text-sm text-ink-soft">
        One product per line:{" "}
        <span className="font-mono text-xs">key,monthly price</span>. The key
        is an M365 SKU id or part number, or a connector key like{" "}
        <span className="font-mono text-xs">adobe:Photoshop</span>. Prices
        accept 14.90 and 14,90; unknown keys are skipped.
      </label>
      <textarea
        // Remount on each new failure so defaultValue re-applies; resets after success.
        key={result && !result.ok ? (result.csv ?? "") : "clean"}
        id="price-import-csv"
        name="csv"
        required
        rows={6}
        spellCheck={false}
        placeholder={"ENTERPRISEPACK,12.80\nadobe:Photoshop,23,79"}
        defaultValue={result && !result.ok ? result.csv : undefined}
        className="w-full border border-line bg-card px-3 py-2 font-mono text-sm focus:border-ink"
      />
      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Importing…" : "Import prices"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={
          result
            ? `text-xs ${result.ok ? "text-moss" : "text-danger-text"}`
            : "sr-only"
        }
      >
        {result === null ? null : summary(result)}
      </p>
    </form>
  );
};
