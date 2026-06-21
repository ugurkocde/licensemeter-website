"use client";

import { useActionState, useState } from "react";

import { disconnectTenant } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

/**
 * Owner-only workspace deletion behind a type-the-name confirmation: the delete
 * button stays disabled until the workspace name is typed exactly, the strongest
 * guard for an irreversible "delete everything" action. When the workspace has a
 * paid subscription, the copy warns that it is cancelled immediately with no
 * refund for the remaining period.
 */
export const DangerZone = ({
  tenantName,
  activeSubscription = false,
}: {
  tenantName: string;
  activeSubscription?: boolean;
}) => {
  const [confirmText, setConfirmText] = useState("");
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) => disconnectTenant(),
    null,
  );

  const confirmed = confirmText.trim() === tenantName.trim();

  return (
    <div className="border border-danger-soft bg-card">
      <div className="border-b border-danger-soft px-5 py-3">
        <h2 className="text-xs font-medium tracking-[0.18em] text-danger-text uppercase">
          Danger zone
        </h2>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="max-w-xl text-sm text-ink-soft">
          Disconnecting deletes every synced record for {tenantName}: users,
          findings, prices, history. The admin consent in your tenant can then be
          revoked under Enterprise applications.
          {activeSubscription && (
            <span className="text-danger-text">
              {" "}
              Your active subscription is cancelled immediately, with no refund
              for the remaining period.
            </span>
          )}
        </p>
        <form
          action={formAction}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor="danger-confirm" className="sr-only">
            Type the workspace name to confirm deletion
          </label>
          <input
            id="danger-confirm"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              // A single-input form submits on Enter even with the button
              // disabled; block it until the name matches so the gate holds.
              if (e.key === "Enter" && !confirmed) e.preventDefault();
            }}
            placeholder={`Type "${tenantName}" to confirm`}
            className="min-h-11 w-full border border-line bg-card px-3 py-2 text-sm focus:border-danger sm:max-w-xs"
          />
          <button
            type="submit"
            disabled={pending || !confirmed}
            className="min-h-11 shrink-0 border border-danger px-4 py-2 text-xs font-medium tracking-wide text-danger-text uppercase hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Delete everything"}
          </button>
        </form>
        {result && !result.ok && (
          <span role="status" aria-live="polite" className="text-xs text-danger-text">
            {result.error ?? "Something went wrong"}
          </span>
        )}
      </div>
    </div>
  );
};
