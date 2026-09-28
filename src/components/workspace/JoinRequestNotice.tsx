"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Persistent status, so dismissing a banner cannot hide a pending decision. */
export const JoinRequestNotice = ({
  workspaceName,
  status,
  contacts,
}: {
  workspaceName: string;
  status: "pending" | "declined";
  contacts: { email: string; name: string | null; role: string }[];
}) => {
  const router = useRouter();
  const [checking, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const pending = status === "pending";

  return (
    <aside
      aria-label={`Access request for ${workspaceName}`}
      className="border-brand/20 bg-brand-soft text-brand-text mb-6 rounded-xl border p-5 text-sm"
    >
      <p className="font-semibold break-words">
        {pending ? "Waiting for approval" : "Access request declined"}:{" "}
        {workspaceName}
      </p>
      <p className="mt-2 leading-relaxed">
        {pending
          ? "Your request is saved. An owner or admin of this LicenseMeter workspace needs to approve it before you can see the company’s data."
          : "An owner or admin declined your request. You do not have access to this company workspace. If this was unexpected, contact an approver below and ask for an invitation."}
      </p>
      {contacts.length > 0 ? (
        <div className="mt-3">
          <p className="font-medium">
            {pending ? "Who can approve your access" : "Who to contact"}
          </p>
          <ul className="mt-1">
            {contacts.map((contact) => (
              <li
                key={contact.email}
                className="[overflow-wrap:anywhere] break-words"
              >
                <a
                  href={`mailto:${encodeURIComponent(contact.email)}`}
                  className="hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {contact.name
                    ? `${contact.name} (${contact.email})`
                    : contact.email}
                </a>{" "}
                <span>({contact.role})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3">
          Ask your company’s LicenseMeter workspace owner or IT team to review
          your access.
        </p>
      )}
      {pending && (
        <>
          <p className="mt-3 leading-relaxed">
            Ask an approver to open Settings → Members → Access requests and
            approve your request. After approval, check your status and choose
            the company workspace from the workspace menu. We also attempt to
            email you when a decision is made.
          </p>
          <button
            type="button"
            disabled={checking}
            onClick={() =>
              startTransition(() => {
                router.refresh();
                setChecked(true);
              })
            }
            className="hover:text-ink mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check approval status"}
          </button>
          <p role="status" aria-live="polite" className="mt-1 text-xs">
            {checking
              ? "Checking your access request…"
              : checked
                ? "Your request is still awaiting approval."
                : "You can leave this page and return later. Your request stays saved."}
          </p>
        </>
      )}
    </aside>
  );
};
