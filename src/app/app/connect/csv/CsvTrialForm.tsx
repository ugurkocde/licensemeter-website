"use client";

import { useActionState } from "react";

import { Button } from "~/components/ui";
import { submitCsvTrial, type CsvTrialResult } from "./actions";

const inputClass =
  "min-h-11 w-full border border-line bg-card px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-canvas focus:border-ink";

/**
 * Two file inputs + optional workspace name, wrapped in useActionState so
 * parse/guard failures land in the aria-live region (ImportPricesForm
 * pattern). Success never returns: the action redirects to /app.
 */
export const CsvTrialForm = () => {
  const [result, formAction, pending] = useActionState(
    async (_prev: CsvTrialResult | null, formData: FormData) =>
      submitCsvTrial(formData),
    null,
  );

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="csv-trial-directory" className="text-sm font-medium">
          User export <span className="text-brand-text">(required)</span>
        </label>
        <input
          id="csv-trial-directory"
          name="directory"
          type="file"
          required
          accept=".csv,text/csv"
          className={inputClass}
        />
        <p className="text-xs text-ink-soft">
          Microsoft 365 admin center &gt; Users &gt; Active users &gt; Export
          users. It shows who holds which licenses, and who is blocked.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv-trial-usage" className="text-sm font-medium">
          Usage export <span className="text-ink-faint">(optional)</span>
        </label>
        <input
          id="csv-trial-usage"
          name="usage"
          type="file"
          accept=".csv,text/csv"
          className={inputClass}
        />
        <p className="text-xs text-ink-soft">
          Reports &gt; Usage &gt; Active users &gt; Export (detail). This adds
          inactivity detection on top of the offboarding and overlap checks.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv-trial-org-name" className="text-sm font-medium">
          Workspace name <span className="text-ink-faint">(optional)</span>
        </label>
        <input
          id="csv-trial-org-name"
          name="orgName"
          type="text"
          maxLength={200}
          placeholder="Defaults to your UPN domain"
          className={inputClass}
        />
      </div>

      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Analyzing…" : "Analyze my exports"}
        </Button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={result && !result.ok ? "text-sm text-danger-text" : "sr-only"}
      >
        {result && !result.ok ? result.error : null}
      </p>
    </form>
  );
};
