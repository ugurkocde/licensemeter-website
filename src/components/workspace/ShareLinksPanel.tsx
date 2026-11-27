"use client";

import { useActionState } from "react";

import {
  createShareLinkAction,
  revokeShareLinkAction,
  type ShareActionResult,
} from "~/app/app/(dash)/reports/executive/actions";
import { CopyBlock } from "~/components/mcp/CopyBlock";
import { Button } from "~/components/ui";
import { ArmedActionButton } from "~/components/workspace/ArmedActionButton";

/** One link row as the server pre-formats it. */
export type ShareLinkRowView = {
  id: string;
  label: string;
  tokenPrefix: string;
  mode: "live" | "snapshot";
  created: string;
  expires: string;
  expired: boolean;
  /** "Never" or a relative time. */
  lastViewed: string;
  viewCount: number;
};

const MODE_LABEL = { live: "Live", snapshot: "Snapshot" } as const;

/**
 * Share links on the Executive report page. The link itself is shown exactly
 * once, after it is created: only its hash is stored. Revoking stays
 * available on every plan; creating needs the executive report and a
 * workspace that is not the demo, which `createBlocked` explains.
 */
export const ShareLinksPanel = ({
  links,
  canManage,
  createBlocked,
  atLimit,
  labelMax,
}: {
  links: ShareLinkRowView[];
  /** Owner or admin outside the demo: may revoke. */
  canManage: boolean;
  /** Why new links cannot be created here, or null when they can. */
  createBlocked: string | null;
  atLimit: boolean;
  labelMax: number;
}) => {
  const [result, formAction, pending] = useActionState(
    async (_prev: ShareActionResult | null, formData: FormData) =>
      createShareLinkAction(formData),
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft max-w-2xl text-sm">
        A read-only link to this report for your CFO or board, no account
        needed. It shows the same page as the PDF and names no employees. A{" "}
        <strong className="text-ink font-medium">snapshot</strong> keeps the
        figures of today; a{" "}
        <strong className="text-ink font-medium">live</strong> link always shows
        current data and stops working if the plan ends.
      </p>

      {canManage && createBlocked === null && (
        <form
          action={formAction}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
        >
          <label htmlFor="share-label" className="sr-only">
            Name for the new link
          </label>
          <input
            id="share-label"
            name="label"
            type="text"
            required
            maxLength={labelMax}
            autoComplete="off"
            placeholder="Who gets it, for example: CFO November review"
            className="border-line-input bg-card focus:border-ink min-w-0 border px-3 py-2 text-sm"
          />
          <label htmlFor="share-mode" className="sr-only">
            Link type
          </label>
          <select
            id="share-mode"
            name="mode"
            defaultValue="snapshot"
            className="border-line-input bg-card focus:border-ink border px-3 py-2 text-sm"
          >
            <option value="snapshot">Snapshot of today</option>
            <option value="live">Live data</option>
          </select>
          <label htmlFor="share-ttl" className="sr-only">
            Valid for
          </label>
          <select
            id="share-ttl"
            name="ttl"
            defaultValue="30"
            className="border-line-input bg-card focus:border-ink border px-3 py-2 text-sm"
          >
            <option value="7">Valid 7 days</option>
            <option value="30">Valid 30 days</option>
            <option value="90">Valid 90 days</option>
          </select>
          <Button
            variant="primary"
            disabled={pending || atLimit}
            className="px-4 py-2"
          >
            {pending ? "Creating…" : "Create link"}
          </Button>
        </form>
      )}
      {canManage && createBlocked !== null && (
        <p className="text-ink-faint text-sm">{createBlocked}</p>
      )}
      {atLimit && createBlocked === null && (
        <p className="text-ink-faint text-xs">
          This workspace has reached its number of active links. Revoke one to
          create another.
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className={
          result && !result.ok ? "text-danger-text text-xs" : "sr-only"
        }
      >
        {result === null
          ? null
          : result.ok
            ? `Link ${result.label} created.`
            : result.error}
      </p>
      {result?.ok && (
        <div className="border-gold bg-gold-soft rounded-xl border px-4 py-3">
          <p className="text-gold-text text-sm font-medium">
            Copy the link for {result.label} now. It is not shown again.
          </p>
          <div className="mt-2">
            <CopyBlock label="New share link" value={result.url} />
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-ink-faint text-sm">No share links yet.</p>
      ) : (
        <ul className="border-line flex flex-col border-t">
          {links.map((l) => (
            <li
              key={l.id}
              className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{l.label}</p>
                <p className="text-ink-faint text-xs">
                  <span className="font-mono">{l.tokenPrefix}…</span>
                  {" · "}
                  {MODE_LABEL[l.mode]}
                  {" · created "}
                  {l.created}
                  {" · "}
                  {l.expired ? (
                    <span className="text-danger-text font-medium">
                      Expired
                    </span>
                  ) : (
                    `valid until ${l.expires}`
                  )}
                  {" · "}
                  {l.viewCount === 1 ? "1 view" : `${l.viewCount} views`}
                  {l.viewCount > 0 ? `, last ${l.lastViewed}` : ""}
                </p>
              </div>
              {canManage && (
                <ArmedActionButton
                  label="Revoke"
                  confirmLabel="Confirm revoke"
                  busyLabel="Revoking…"
                  ariaLabel={`Revoke ${l.label}`}
                  run={() => revokeShareLinkAction(l.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
