import { redirect } from "next/navigation";

import {
  handoffFailurePath,
  readHandoffCompletion,
} from "~/server/auth/consentHandoff";
import { loadConsentState, requesterLabel } from "~/server/consentState";

export const metadata = { title: "Consent granted" };

export default async function ConsentGrantedPage() {
  const token = await readHandoffCompletion();
  if (!token) redirect(handoffFailurePath("invalid_state"));
  const state = await loadConsentState(token);
  if (state?.kind !== "handoff" || !state.usedAt)
    redirect(handoffFailurePath("invalid_state"));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        Consent granted
      </h1>
      <p className="text-ink-soft text-sm leading-relaxed [overflow-wrap:anywhere]">
        <strong className="text-ink">
          {requesterLabel(state, "The requester")}
        </strong>{" "}
        will see the data in LicenseMeter after the first sync.
      </p>
      <p className="text-ink-soft text-sm">You can close this page.</p>
    </div>
  );
}
