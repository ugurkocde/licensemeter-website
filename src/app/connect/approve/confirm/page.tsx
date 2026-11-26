import { redirect } from "next/navigation";

import { Button, ButtonAnchor } from "~/components/ui";
import { workspaceLabel } from "~/lib/format";
import {
  handoffFailurePath,
  readHandoffProof,
} from "~/server/auth/consentHandoff";
import { approvalPath, loadPendingHandoff } from "~/server/consentState";

export const metadata = { title: "Confirm Microsoft tenant" };

export default async function ConfirmConsentPage() {
  const proof = await readHandoffProof();
  if (proof?.phase !== "confirm") redirect(handoffFailurePath("invalid_state"));
  const handoff = await loadPendingHandoff(proof.token);
  if (!handoff || handoff.state.tid?.toLowerCase() !== proof.tid) {
    redirect(handoffFailurePath("invalid_state"));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
        Confirm Microsoft tenant
      </h1>
      <p className="text-ink-soft text-sm">
        Check the account, tenant, and workspace before continuing to Microsoft
        to grant read-only access.
      </p>
      <dl className="border-line divide-line divide-y rounded-xl border text-sm [overflow-wrap:anywhere]">
        <div className="px-3 py-2">
          <dt className="text-ink-soft text-xs">Signed-in Microsoft account</dt>
          <dd className="font-medium">{proof.account}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-ink-soft text-xs">Microsoft tenant ID</dt>
          <dd className="font-mono">{proof.tid}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-ink-soft text-xs">LicenseMeter workspace</dt>
          <dd className="font-medium">{workspaceLabel(handoff.workspace)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <form action="/api/connect/approve" method="post">
          <input type="hidden" name="intent" value="confirm" />
          <input type="hidden" name="token" value={proof.token} />
          <Button variant="primary" type="submit">
            Continue to Microsoft
          </Button>
        </form>
        <ButtonAnchor href={approvalPath(proof.token)}>
          Use another account
        </ButtonAnchor>
      </div>
    </div>
  );
}
