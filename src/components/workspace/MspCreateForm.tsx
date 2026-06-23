"use client";

import { useActionState } from "react";

import { buttonClass } from "~/components/ui";
import type { CreateMspResult } from "~/server/msp";

/**
 * First-run form that creates the caller's MSP account. Wraps the
 * createMspAccount server action (passed in as a prop to keep the client/server
 * split clean) in useActionState for a pending state and inline error. On
 * success the action revalidates /app, so the page re-renders into the
 * billing + portfolio view without a client redirect.
 */
export const MspCreateForm = ({
  action,
}: {
  action: (formData: FormData) => Promise<CreateMspResult>;
}) => {
  const [result, formAction, pending] = useActionState(
    async (_prev: CreateMspResult | null, formData: FormData) =>
      action(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="msp-name" className="text-sm font-medium">
        Account name <span className="text-ink-faint">(optional)</span>
      </label>
      <input
        id="msp-name"
        type="text"
        name="name"
        maxLength={120}
        autoComplete="organization"
        placeholder="Your practice or company name"
        className="min-h-11 w-full border border-line bg-card px-3 py-2 text-sm focus:border-ink sm:max-w-sm"
      />
      <div>
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? "Creating…" : "Create MSP account"}
        </button>
      </div>
      {result && !result.ok && (
        <span role="status" aria-live="polite" className="text-sm text-danger-text">
          {result.error ?? "Could not create the MSP account"}
        </span>
      )}
    </form>
  );
};
