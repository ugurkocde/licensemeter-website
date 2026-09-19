"use client";

import { useId, useState } from "react";

import { Button, type ButtonVariant } from "~/components/ui";
import type { BillingInterval, PricedPlan } from "~/lib/pricing";

type Target =
  | { kind: "checkout"; plan: PricedPlan; interval: BillingInterval }
  | { kind: "portal" };

const ENDPOINT: Record<Target["kind"], string> = {
  checkout: "/api/billing/checkout",
  portal: "/api/billing/portal",
};

const errorFor = (kind: Target["kind"], status: number): string => {
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "Only a workspace owner can do this.";
  if (status === 409) {
    return "This workspace already pays through another channel. Manage the plan there.";
  }
  if (status === 429) return "Too many attempts. Try again in a minute.";
  if (status === 503) {
    return kind === "checkout"
      ? "Card checkout is not available right now."
      : "The subscription portal is not available right now.";
  }
  return "That did not work. Try again in a moment.";
};

/** Only ever follow an https link, whatever the response claims. */
const safeRedirect = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

/**
 * Asks the server for a Polar checkout or customer portal link and goes there.
 * The server decides who may pay and for what; this only carries the choice.
 */
export const BillingRedirectButton = ({
  target,
  label,
  srDetail,
  variant = "primary",
  className = "",
}: {
  target: Target;
  label: string;
  /** Read out after the label, to tell two equal buttons apart. */
  srDetail?: string;
  variant?: ButtonVariant;
  className?: string;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const go = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT[target.kind], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          target.kind === "checkout"
            ? { plan: target.plan, interval: target.interval }
            : {},
        ),
      });
      if (!res.ok) {
        setError(errorFor(target.kind, res.status));
        setPending(false);
        return;
      }
      const data = (await res.json()) as { url?: unknown };
      const url = safeRedirect(data.url);
      if (!url) {
        setError(errorFor(target.kind, 0));
        setPending(false);
        return;
      }
      // Stay in the loading state while the browser leaves the page.
      window.location.assign(url);
    } catch {
      setError("No connection. Check your network and try again.");
      setPending(false);
    }
  };

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <Button
        type="button"
        variant={variant}
        onClick={go}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full"
      >
        {pending ? "One moment…" : label}
        {srDetail && <span className="sr-only">: {srDetail}</span>}
      </Button>
      <span
        id={errorId}
        role="status"
        aria-live="polite"
        className={error ? "text-danger-text text-xs" : "sr-only"}
      >
        {error}
      </span>
    </div>
  );
};
