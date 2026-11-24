import { redirect } from "next/navigation";

import {
  handoffFailurePath,
  readHandoffProof,
} from "~/server/auth/consentHandoff";
import { loadConsentState } from "~/server/consentState";

export const metadata = { title: "Consent granted" };

export default async function ConsentGrantedPage() {
  const proof = await readHandoffProof();
  if (proof?.phase !== "grant") redirect(handoffFailurePath("invalid_state"));
  const state = await loadConsentState(proof.token);
  if (state?.kind !== "handoff" || !state.usedAt)
    redirect(handoffFailurePath("invalid_state"));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        Consent granted
      </h1>
      <p className="text-ink-soft text-sm leading-relaxed [overflow-wrap:anywhere]">
        <strong className="text-ink">
          {state.name ?? (state.email || "The requester")}
        </strong>{" "}
        will see the data in LicenseMeter after the first sync.
      </p>
      <p className="text-ink-soft text-sm">You can close this page.</p>
    </div>
  );
}
