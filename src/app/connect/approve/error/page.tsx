const messages = new Map([
  ["invalid_state", "This approval link is invalid, already used, or expired."],
  ["expired_state", "This approval link expired after 7 days."],
  [
    "approval_identity",
    "LicenseMeter could not verify a Global Administrator or Privileged Role Administrator account for the tenant.",
  ],
  [
    "not_configured",
    "Managed Microsoft consent is unavailable on this deployment.",
  ],
  ["consent_declined", "Consent was declined in the Microsoft dialog."],
  ["consent_incomplete", "Microsoft did not confirm consent."],
  [
    "consent_not_granted",
    "LicenseMeter could not verify access to the Microsoft tenant.",
  ],
  [
    "tenant_taken",
    "That Microsoft tenant is connected to another LicenseMeter workspace.",
  ],
  [
    "already_connected",
    "This LicenseMeter workspace already has a Microsoft tenant.",
  ],
]);

export const metadata = { title: "Microsoft consent could not be completed" };

export default async function ConsentErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message =
    (typeof error === "string" ? messages.get(error) : undefined) ??
    "LicenseMeter could not complete the approval.";

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        Microsoft consent could not be completed
      </h1>
      <p className="text-ink-soft text-sm leading-relaxed">{message}</p>
      <p className="text-ink-soft text-sm">
        Open the approval link to try again, or ask the requester for a new
        link.
      </p>
    </div>
  );
}
