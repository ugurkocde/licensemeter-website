"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Keeps status discoverable without a full waiting card on every page. */
export const AccessRequestStrip = ({
  requests,
  fullCardOnOverview,
}: {
  requests: { id: string; workspaceName: string; status: string }[];
  fullCardOnOverview: boolean;
}) => {
  const path = usePathname();
  if (
    path === "/app/access-requests" ||
    (path === "/app" && fullCardOnOverview)
  )
    return null;
  return requests
    .filter((request) => request.status !== "declined" || path === "/app")
    .map((request) => (
      <aside
        key={request.id}
        aria-label="Workspace access status"
        className="border-line bg-card text-ink-soft mb-4 flex flex-wrap items-center justify-between gap-x-4 rounded-xl border px-4 py-2 text-sm"
      >
        <p className="min-w-0 break-words">
          Your access to <strong>{request.workspaceName}</strong> is{" "}
          {request.status === "approved"
            ? "approved"
            : request.status === "declined"
              ? "declined"
              : "awaiting approval"}
          .
        </p>
        <Link
          href="/app/access-requests"
          className="text-ink hover:text-brand-text inline-flex min-h-11 items-center font-medium underline underline-offset-4"
        >
          View access status
        </Link>
      </aside>
    ));
};

export const ApproverRequestBanner = ({
  count,
  workspaceName,
}: {
  count: number;
  workspaceName: string;
}) => {
  const path = usePathname();
  if (!count || (path !== "/app" && path !== "/app/settings")) return null;
  return (
    <aside
      aria-label="Requests awaiting your review"
      className="border-brand/20 bg-brand-soft text-brand-text mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
    >
      <p className="min-w-0 break-words">
        {count} {count === 1 ? "colleague is" : "colleagues are"} waiting for
        access to <strong>{workspaceName}</strong>.
      </p>
      <Link
        href="/app/settings#access-requests"
        className="hover:text-ink inline-flex min-h-11 items-center font-medium underline underline-offset-4"
      >
        Review access requests
      </Link>
    </aside>
  );
};
