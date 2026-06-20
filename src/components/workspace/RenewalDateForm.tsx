"use client";

import { useActionState } from "react";

import { Button } from "~/components/ui";
import { setRenewalDate } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

type RenewalState = (ActionResult & { cleared?: boolean }) | null;

/**
 * Renewal-date field for the Workspace card. Wraps the setRenewalDate server
 * action in useActionState so save/clear feedback lands in a live region;
 * submitting an empty date clears the stored value.
 */
export const RenewalDateForm = ({ initial }: { initial: string | null }) => {
  const [result, formAction, pending] = useActionState(
    async (_prev: RenewalState, formData: FormData): Promise<RenewalState> => {
      const res = await setRenewalDate(formData);
      return { ...res, cleared: formData.get("date") === "" };
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        // Remount when the server-confirmed value changes so defaultValue re-applies.
        key={initial ?? "unset"}
        type="date"
        name="date"
        defaultValue={initial ?? ""}
        aria-label="Microsoft agreement renewal date"
        className="border border-line bg-card px-2 py-1.5 text-sm focus:border-ink"
      />
      <Button variant="micro" disabled={pending} className="py-1.5">
        {pending ? "…" : "Save"}
      </Button>
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
            ? result.cleared
              ? "Cleared."
              : "Saved."
            : (result.error ?? "Save failed")}
      </span>
    </form>
  );
};
