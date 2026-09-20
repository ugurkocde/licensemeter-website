"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";

import { Button } from "~/components/ui";
import {
  removeNotificationAddress,
  requestNotificationAddress,
  resendNotificationAddress,
  setNotificationAddressPreference,
} from "~/server/actions";
import type { ActionResult } from "~/server/actions";
import type { SharedEmailJob } from "~/server/notificationAddress";

/**
 * The workspace's one shared notification address for the Settings page:
 * request, confirm state, the three switches and removal. Every control
 * follows the LeakAlertsToggle pattern, one mutation in flight at a time with
 * the outcome announced in a live region.
 */

const Toggle = ({
  job,
  label,
  initial,
}: {
  job: SharedEmailJob;
  label: string;
  initial: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(initial);
  const [lastValue, setLastValue] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  /* Re-sync if the server-confirmed value changes underneath us. */
  if (lastValue !== initial) {
    setLastValue(initial);
    setCurrent(initial);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label
        className={`flex cursor-pointer items-center gap-2 text-sm ${
          pending ? "opacity-60" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={current}
          aria-busy={pending || undefined}
          onChange={(e) => {
            const next = e.target.checked;
            /* One mutation at a time. */
            if (inFlight.current) return;
            inFlight.current = true;
            setCurrent(next);
            setResult(null);
            startTransition(async () => {
              try {
                const res = await setNotificationAddressPreference(job, next);
                setResult(res);
                if (!res.ok) {
                  setCurrent(initial);
                  return;
                }
                router.refresh();
              } finally {
                inFlight.current = false;
              }
            });
          }}
          className="accent-ink size-4 shrink-0"
        />
        <span>{label}</span>
      </label>
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
            ? "Saved."
            : (result.error ?? "Save failed")}
      </span>
    </div>
  );
};

type RequestState = (ActionResult & { email?: string }) | null;

export const SharedNotificationAddress = ({
  verifiedEmail,
  pendingEmail,
  pendingExpires,
  digest,
  report,
  leakAlerts,
}: {
  verifiedEmail: string | null;
  pendingEmail: string | null;
  /** Pre-formatted expiry of the pending link; the server owns the format. */
  pendingExpires: string | null;
  digest: boolean;
  report: boolean;
  leakAlerts: boolean;
}) => {
  const router = useRouter();
  /* A row exists as soon as one address was requested; the switches need it. */
  const hasAddress = verifiedEmail !== null || pendingEmail !== null;
  const [request, requestAction, requesting] = useActionState(
    async (_prev: RequestState, formData: FormData): Promise<RequestState> => {
      const email = formData.get("email");
      const res = await requestNotificationAddress(formData);
      if (res.ok) router.refresh();
      return { ...res, email: typeof email === "string" ? email : undefined };
    },
    null,
  );
  const [side, sideAction, sideBusy] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const res =
        formData.get("intent") === "remove"
          ? await removeNotificationAddress()
          : await resendNotificationAddress();
      if (res.ok) router.refresh();
      return res;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft max-w-xl text-sm">
        One shared mailbox, for example it-licenses@yourcompany.com, that
        receives the email of this workspace in addition to the owners and
        admins. Nobody loses their own copy. Everyone who can read that mailbox
        sees account names and license costs, so pick it deliberately.
      </p>

      {verifiedEmail ? (
        <p className="text-sm">
          <span className="font-medium break-all">{verifiedEmail}</span>
          <span className="text-ink-faint ml-2 text-xs">Confirmed</span>
        </p>
      ) : (
        !pendingEmail && (
          <p className="text-ink-faint text-sm">No shared address yet.</p>
        )
      )}

      {pendingEmail && (
        <p className="text-sm">
          <span className="font-medium break-all">{pendingEmail}</span>
          <span className="text-ink-faint ml-2 text-xs">
            Waiting for confirmation
            {pendingExpires ? `, link expires ${pendingExpires}` : ""}
          </span>
        </p>
      )}

      {hasAddress && (
        <form action={sideAction} className="flex flex-wrap items-center gap-2">
          {pendingEmail && (
            <Button
              name="intent"
              value="resend"
              disabled={sideBusy}
              className="px-4 py-2"
            >
              {sideBusy ? "Working…" : "Send the link again"}
            </Button>
          )}
          <Button
            name="intent"
            value="remove"
            disabled={sideBusy}
            className="px-4 py-2"
          >
            Remove address
          </Button>
          <span
            role="status"
            aria-live="polite"
            className={
              side
                ? `text-xs ${side.ok ? "text-moss" : "text-danger-text"}`
                : "sr-only"
            }
          >
            {side === null
              ? null
              : side.ok
                ? "Done."
                : (side.error ?? "Failed")}
          </span>
        </form>
      )}

      <form
        action={requestAction}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="shared-address" className="sr-only">
          Shared notification address
        </label>
        <input
          // Remount on each new failure so defaultValue re-applies; resets after success.
          key={request && !request.ok ? (request.email ?? "") : "clean"}
          id="shared-address"
          name="email"
          type="email"
          required
          placeholder="it-licenses@yourcompany.com"
          defaultValue={request && !request.ok ? request.email : undefined}
          className="border-line-input bg-card focus:border-ink min-w-56 flex-1 border px-3 py-2 text-sm"
        />
        <Button variant="primary" disabled={requesting} className="px-4 py-2">
          {requesting
            ? "Sending…"
            : hasAddress
              ? "Replace address"
              : "Add address"}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={
            request
              ? `w-full text-xs ${request.ok ? "text-moss" : "text-danger-text"}`
              : "sr-only"
          }
        >
          {request === null
            ? null
            : request.ok
              ? `Confirmation email sent to ${request.email ?? "the address"}. It starts receiving email once somebody there confirms.`
              : (request.error ?? "Could not send the confirmation email")}
        </p>
      </form>

      {hasAddress && (
        <div className="border-line flex flex-col gap-2 border-t pt-4">
          <h3 className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
            Send to this address
          </h3>
          <Toggle job="digest" label="Weekly digest" initial={digest} />
          <Toggle job="report" label="Monthly report" initial={report} />
          <Toggle job="leak" label="Leak alerts" initial={leakAlerts} />
          {!verifiedEmail && (
            <p className="text-ink-faint text-xs">
              These apply once an address is confirmed.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
