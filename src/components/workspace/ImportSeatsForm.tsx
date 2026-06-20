"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui";
import type { ConnectorSpec } from "~/lib/connectors";
import { clearImportedSeats, importSeats } from "~/server/actions";
import type { ActionResult, ImportSeatsResult } from "~/server/actions";

type ImportState = (ImportSeatsResult & { csv?: string }) | null;

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Outcome sentence(s) for the live region: imported count, unparseable lines. */
const summary = (result: ImportSeatsResult): string => {
  const parts: string[] = [];
  if (result.ok) {
    parts.push(
      `Imported ${result.imported} ${plural(result.imported, "seat")}.`,
    );
  } else {
    parts.push(result.error ?? "Import failed.");
  }
  if (result.invalid > 0) {
    parts.push(
      `${result.invalid} ${plural(result.invalid, "line")} could not be parsed.`,
    );
  }
  return parts.join(" ");
};

/**
 * Paste-CSV member import for the import-kind connectors (ChatGPT, Claude).
 * Wraps the importSeats server action in useActionState so the outcome
 * surfaces in a live region; on failure the pasted text survives the form
 * reset (same remount trick as the ImportPricesForm) and focus moves to the
 * error message.
 */
export const ImportSeatsForm = ({ spec }: { spec: ConnectorSpec }) => {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [result, formAction, pending] = useActionState(
    async (_prev: ImportState, formData: FormData): Promise<ImportState> => {
      const csv = formData.get("csv");
      const res = await importSeats(formData);
      return { ...res, csv: typeof csv === "string" ? csv : undefined };
    },
    null,
  );

  /* Move focus to the failure message so keyboard and SR users land on it;
     the result object is new per submission so repeated errors re-focus. */
  useEffect(() => {
    if (result && !result.ok) statusRef.current?.focus();
  }, [result]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="provider" value={spec.provider} />
      <label
        htmlFor={`${spec.provider}-import-csv`}
        className="text-sm text-ink-soft"
      >
        Paste the member table from the {spec.label} admin panel including its
        header row. Copied web tables and CSV exports both work. An email
        column is required; name, status, plan and last-active columns are
        picked up when present. A new import replaces the current snapshot.
      </label>
      <textarea
        // Remount on each new failure so defaultValue re-applies; resets after success.
        key={result && !result.ok ? (result.csv ?? "") : "clean"}
        id={`${spec.provider}-import-csv`}
        name="csv"
        required
        rows={8}
        spellCheck={false}
        placeholder={
          "Email,Name,Status,Last active\njane@example.com,Jane Fox,active,2026-05-28"
        }
        defaultValue={result && !result.ok ? result.csv : undefined}
        className="w-full border border-line bg-card px-3 py-2 font-mono text-sm focus:border-ink"
      />
      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Importing…" : spec.connectCta}
        </Button>
      </div>
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={
          result
            ? `text-xs focus:outline-none ${result.ok ? "text-moss" : "text-danger-text"}`
            : "sr-only"
        }
      >
        {result === null ? null : summary(result)}
      </p>
    </form>
  );
};

/**
 * Armed-confirm clear (same pattern as MemberActions): the first press arms
 * the button, the second one fires the action; failures surface in the live
 * region instead of being discarded.
 */
export const ClearSeatsButton = ({ spec }: { spec: ConnectorSpec }) => {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) => clearImportedSeats(spec.provider),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const message = armed
    ? `This removes the imported ${spec.label} seats. Press again to confirm.`
    : result && !result.ok
      ? (result.error ?? "Something went wrong")
      : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        /* First submit arms only; the second one fires the action. */
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        } else {
          setArmed(false);
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <Button disabled={pending} onBlur={() => setArmed(false)}>
        {pending
          ? "Removing…"
          : armed
            ? "Confirm clear"
            : "Clear imported seats"}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={
          message ? "max-w-64 text-right text-xs text-danger-text" : "sr-only"
        }
      >
        {message}
      </span>
    </form>
  );
};
