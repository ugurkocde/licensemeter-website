"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  addFinanceRecipientAction,
  removeFinanceRecipientAction,
  resendFinanceRecipientAction,
  type SimpleResult,
} from "~/app/app/(dash)/reports/executive/actions";
import { Button } from "~/components/ui";
import { ArmedActionButton } from "~/components/workspace/ArmedActionButton";

export type FinanceRecipientView = {
  id: string;
  email: string;
  name: string | null;
  state: "pending" | "verified" | "unsubscribed";
  /** Pre-formatted expiry of a pending link, or null. */
  pendingExpires: string | null;
};

const STATE_TEXT = {
  verified: "Confirmed",
  unsubscribed: "Unsubscribed",
} as const;

const ResendButton = ({ id, email }: { id: string; email: string }) => {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SimpleResult | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={`Send the confirmation to ${email} again`}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await resendFinanceRecipientAction(id);
            setResult(res);
            if (res.ok) router.refresh();
          });
        }}
        className="text-ink-faint hover:text-ink inline-flex min-h-11 items-center text-xs underline-offset-4 hover:underline disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send link again"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={
          result
            ? `text-xs ${result.ok ? "text-moss" : "text-danger-text"}`
            : "sr-only"
        }
      >
        {result === null ? null : result.ok ? "Sent." : result.error}
      </span>
    </span>
  );
};

/**
 * Settings card for the monthly executive report to finance: up to `max`
 * addresses outside the workspace, each confirmed by email before it gets
 * anything and each with its own one-click unsubscribe. Removing stays
 * possible on every plan; adding needs the executive report.
 */
export const FinanceRecipients = ({
  recipients,
  canManage,
  addBlocked,
  max,
  nameMax,
}: {
  recipients: FinanceRecipientView[];
  canManage: boolean;
  /** Why addresses cannot be added here, or null when they can. */
  addBlocked: string | null;
  max: number;
  nameMax: number;
}) => {
  const router = useRouter();
  const [result, formAction, pending] = useActionState(
    async (
      _prev: (SimpleResult & { email?: string }) | null,
      formData: FormData,
    ) => {
      const email = formData.get("email");
      const res = await addFinanceRecipientAction(formData);
      if (res.ok) router.refresh();
      return { ...res, email: typeof email === "string" ? email : undefined };
    },
    null,
  );
  const atLimit = recipients.length >= max;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft max-w-xl text-sm">
        On the first of each month, the one-page executive savings report goes
        to these addresses as a PDF: spend, open waste, realized savings and the
        renewal actions due in the next 90 days. It names no employees. Each
        address confirms by email first and can unsubscribe with one click.
        Separate from the monthly waste report for owners and admins.
      </p>

      {recipients.length === 0 ? (
        <p className="text-ink-faint text-sm">No finance recipients yet.</p>
      ) : (
        <ul className="border-line flex flex-col border-t">
          {recipients.map((r) => (
            <li
              key={r.id}
              className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium break-all">{r.email}</span>
                {r.name && (
                  <span className="text-ink-soft ml-2 break-words">
                    {r.name}
                  </span>
                )}
                <span className="text-ink-faint ml-2 text-xs">
                  {r.state === "pending"
                    ? `Waiting for confirmation${r.pendingExpires ? `, link expires ${r.pendingExpires}` : ""}`
                    : STATE_TEXT[r.state]}
                </span>
              </span>
              {canManage && (
                <span className="flex items-center gap-3">
                  {r.state !== "verified" && addBlocked === null && (
                    <ResendButton id={r.id} email={r.email} />
                  )}
                  <ArmedActionButton
                    label="Remove"
                    confirmLabel="Confirm remove"
                    busyLabel="Removing…"
                    ariaLabel={`Remove ${r.email}`}
                    run={() => removeFinanceRecipientAction(r.id)}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && addBlocked !== null && (
        <p className="text-ink-faint text-sm">{addBlocked}</p>
      )}
      {canManage && addBlocked === null && (
        <form
          action={formAction}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-center"
        >
          <label htmlFor="finance-email" className="sr-only">
            Finance recipient email
          </label>
          <input
            key={result && !result.ok ? (result.email ?? "") : "clean"}
            id="finance-email"
            name="email"
            type="email"
            required
            placeholder="cfo@yourcompany.com"
            defaultValue={result && !result.ok ? result.email : undefined}
            className="border-line-input bg-card focus:border-ink min-w-0 border px-3 py-2 text-sm"
          />
          <label htmlFor="finance-name" className="sr-only">
            Name (optional)
          </label>
          <input
            id="finance-name"
            name="name"
            type="text"
            maxLength={nameMax}
            autoComplete="off"
            placeholder="Name (optional)"
            className="border-line-input bg-card focus:border-ink min-w-0 border px-3 py-2 text-sm"
          />
          <Button
            variant="primary"
            disabled={pending || atLimit}
            className="px-4 py-2"
          >
            {pending ? "Sending…" : "Add recipient"}
          </Button>
          <p
            role="status"
            aria-live="polite"
            className={
              result
                ? `text-xs sm:col-span-3 ${result.ok ? "text-moss" : "text-danger-text"}`
                : "sr-only"
            }
          >
            {result === null
              ? null
              : result.ok
                ? `Confirmation email sent to ${result.email ?? "the address"}. Reports go there once somebody confirms.`
                : (result.error ?? "Could not send the confirmation email")}
          </p>
        </form>
      )}
      {canManage && addBlocked === null && atLimit && (
        <p className="text-ink-faint text-xs">
          A workspace can have {max} finance recipients. Remove one to add
          another.
        </p>
      )}
    </div>
  );
};
