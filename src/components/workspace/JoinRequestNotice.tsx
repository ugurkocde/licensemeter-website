"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, Pill } from "~/components/ui";
import {
  acknowledgeDeclinedRequest,
  checkAccessRequest,
} from "~/server/accessRequestActions";

type Contact = { email: string; name: string | null; role: string };

const Approver = ({ contact }: { contact: Contact }) => (
  <li className="border-line py-3 not-first:border-t">
    <p className="text-ink font-medium break-words">
      {contact.name ?? "Workspace approver"}
      <span className="text-ink-faint ml-2 text-xs font-normal">
        {contact.role === "owner" ? "Owner" : "Admin"}
      </span>
    </p>
    <a
      href={`mailto:${encodeURIComponent(contact.email)}`}
      className="text-ink-soft hover:text-brand-text inline-flex min-h-11 items-center text-sm [overflow-wrap:anywhere] underline underline-offset-4"
    >
      {contact.email}
    </a>
  </li>
);

/** Full status card, used on Overview's empty state and the access-status page. */
export const JoinRequestNotice = ({
  requestId,
  workspaceName,
  status,
  requestedAt,
  contacts,
}: {
  requestId: string;
  workspaceName: string;
  status: "pending" | "declined" | "approved";
  requestedAt: string;
  contacts: Contact[];
}) => {
  const router = useRouter();
  const headingId = useId();
  const [busy, startTransition] = useTransition();
  const [checked, setChecked] = useState<{
    status: "pending" | "declined";
    at: string;
    attempt: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = checked?.status ?? status;
  const pending = current === "pending";
  const approved = current === "approved";

  const check = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkAccessRequest(requestId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.status === "approved" && result.href) {
          router.push(result.href);
          router.refresh();
        } else if (result.status !== "approved") {
          setChecked((previous) => ({
            status: result.status,
            at: result.checkedAt,
            attempt: (previous?.attempt ?? 0) + 1,
          }));
        }
      } catch {
        setError(
          "Could not check your request. Check your connection and try again.",
        );
      }
    });
  };
  const acknowledge = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await acknowledgeDeclinedRequest(requestId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Could not save your acknowledgement. Please try again.");
      }
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-card shadow-card overflow-hidden rounded-2xl border"
    >
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pill tone={pending ? "brand" : approved ? "good" : "slate"}>
            {pending ? "Pending approval" : approved ? "Approved" : "Declined"}
          </Pill>
          <p className="text-ink-faint text-xs">
            Requested{" "}
            <time dateTime={requestedAt}>
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(requestedAt))}
            </time>
          </p>
        </div>
        <h2
          id={headingId}
          className="font-display text-ink mt-4 text-2xl tracking-tight break-words"
        >
          {pending
            ? `Waiting for access to ${workspaceName}`
            : approved
              ? `You can now open ${workspaceName}`
              : `Access to ${workspaceName} was declined`}
        </h2>
        <p className="text-ink-soft mt-3 text-sm leading-relaxed">
          {pending
            ? "An owner or admin of this workspace needs to approve your request. You do not need to connect Microsoft 365 again."
            : approved
              ? "Your access has been granted. Open the workspace to see the company’s data."
              : "You do not have access to this workspace. If this was unexpected, ask your company’s LicenseMeter owner or IT team for an invitation. Signing in again does not submit another request."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant={approved ? "primary" : "secondary"}
            disabled={busy}
            onClick={current === "declined" ? acknowledge : check}
          >
            {busy
              ? "Please wait…"
              : pending
                ? "Check approval status"
                : approved
                  ? "Open workspace"
                  : "Acknowledge decision"}
          </Button>
          {current === "declined" && (
            <p className="text-ink-faint text-xs">
              Hides this notice on all your devices. The decision stays
              recorded.
            </p>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={
            error
              ? "text-danger-text mt-3 text-sm"
              : "text-ink-faint mt-3 text-xs"
          }
        >
          {error ??
            (busy
              ? "Updating your request…"
              : checked
                ? `Check ${checked.attempt}, ${new Date(checked.at).toLocaleTimeString()}: ${checked.status === "pending" ? "still awaiting approval" : "request declined"}.`
                : pending
                  ? "Your request is saved. You can leave and return later."
                  : "")}
        </p>
      </div>
      {pending && (
        <div className="border-line border-t px-5 py-5 sm:px-7">
          <h3 className="text-ink text-sm font-semibold">Who can approve</h3>
          {contacts.length ? (
            <>
              <ul className="mt-1">
                {contacts.slice(0, 3).map((contact) => (
                  <Approver key={contact.email} contact={contact} />
                ))}
              </ul>
              {contacts.length > 3 && (
                <details className="text-ink-soft text-sm">
                  <summary className="hover:text-ink min-h-11 cursor-pointer py-3">
                    {contacts.length - 3} more approvers
                  </summary>
                  <ul>
                    {contacts.slice(3).map((contact) => (
                      <Approver key={contact.email} contact={contact} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-ink-soft mt-2 text-sm">
              Ask your company’s LicenseMeter owner or IT team to review your
              request.
            </p>
          )}
          <p className="text-ink-faint mt-2 text-sm leading-relaxed">
            Ask an approver to open{" "}
            <strong className="font-medium">
              Settings &gt; Members &gt; Access requests
            </strong>
            . Once approved, use the button here to open the workspace. You can
            check here even if you have not received an email.
          </p>
        </div>
      )}
    </section>
  );
};
