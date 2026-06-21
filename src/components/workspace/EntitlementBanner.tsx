import { ButtonLink } from "~/components/ui";
import type { Entitlement } from "~/server/entitlement";

/** "today" / "tomorrow" / "in N days" for the trial countdown. */
const daysPhrase = (n: number): string =>
  n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;

/**
 * Workspace-wide entitlement strip rendered at the top of the dashboard.
 * Silent for demo/comped/paid. During the no-card trial it always offers a
 * Subscribe-now path (subtle early, an amber nudge in the final week), and it
 * becomes a prominent danger banner once expired or past due (locked).
 */
export const EntitlementBanner = ({
  entitlement,
  isOwner,
}: {
  entitlement: Entitlement;
  isOwner: boolean;
}) => {
  const { state, trialDaysLeft, locked } = entitlement;

  const ownerCta = (label: string) =>
    isOwner ? (
      <ButtonLink href="/app/billing" variant="secondary" className="shrink-0">
        {label}
      </ButtonLink>
    ) : null;
  const nonOwnerNote = (text: string) =>
    !isOwner ? <span className="text-sm">{text}</span> : null;

  // Trial: a constant, low-key Subscribe-now strip that escalates in the
  // final week. Subscribing keeps the remaining free days (billed at trial end).
  if (state === "trial") {
    const lastWeek = trialDaysLeft <= 7;
    return (
      <div
        className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3 ${
          lastWeek
            ? "bg-gold-soft text-gold-text"
            : "border border-line bg-subtle text-ink-soft"
        }`}
      >
        <p className="text-sm font-medium">
          {lastWeek
            ? `Your free trial ends ${daysPhrase(trialDaysLeft)}.`
            : `You are on a free trial — ${trialDaysLeft} days left, no card required.`}
        </p>
        <div className="flex items-center gap-3">
          {nonOwnerNote("Ask a workspace owner to subscribe.")}
          {ownerCta("Subscribe now")}
        </div>
      </div>
    );
  }

  // Soft lock: expired trial or past-due with the grace period exhausted.
  if (state === "expired" || (state === "past_due" && locked)) {
    const expired = state === "expired";
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-danger-text">
        <p className="text-sm font-medium">
          {expired
            ? "Your trial has ended. Exports, nightly sync and alerts are paused."
            : "Your payment is past due. Update your card to avoid interruption."}
        </p>
        <div className="flex items-center gap-3">
          {nonOwnerNote("Ask a workspace owner to upgrade.")}
          {ownerCta(expired ? "Subscribe now" : "Update billing")}
        </div>
      </div>
    );
  }

  return null;
};
