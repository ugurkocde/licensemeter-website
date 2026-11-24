import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "~/components/ui";
import { workspaceLabel } from "~/lib/format";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import {
  allowHandoffRequest,
  handoffFailurePath,
} from "~/server/auth/consentHandoff";
import { loadPendingHandoff, requesterLabel } from "~/server/consentState";

export const metadata = { title: "Approve Microsoft 365 access" };

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!(await allowHandoffRequest("review", await headers()))) {
    redirect(handoffFailurePath("rate_limited"));
  }
  const handoff = await loadPendingHandoff(token);
  if (!handoff) redirect(handoffFailurePath("invalid_state"));
  const { state, workspace } = handoff;

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-display text-2xl leading-tight tracking-tight sm:text-3xl">
        Approve Microsoft 365 access
      </h1>
      <p className="text-ink-soft text-sm leading-relaxed [overflow-wrap:anywhere]">
        <strong className="text-ink">
          {requesterLabel(state, "A workspace admin")}
        </strong>{" "}
        requested read-only Microsoft 365 access for the{" "}
        <strong className="text-ink">{workspaceLabel(workspace)}</strong>{" "}
        workspace.
      </p>
      <p className="text-ink-soft text-sm leading-relaxed">
        Use a Global Administrator or Privileged Role Administrator account in
        the requester’s Microsoft tenant. After signing in, you can verify the
        account, tenant, and workspace before granting consent.
      </p>
      <div className="w-full">
        <h2 className="mb-2 text-sm font-medium">Read-only permissions</h2>
        <ul className="border-line divide-line divide-y overflow-hidden rounded-xl border">
          {CONNECTOR_SCOPES.map(({ scope, why }) => (
            <li
              key={scope}
              className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-xs"
            >
              <code className="font-mono">{scope}</code>
              <span className="text-ink-soft">{why}</span>
            </li>
          ))}
        </ul>
      </div>
      <form action="/api/connect/approve" method="post">
        <input type="hidden" name="token" value={token} />
        <Button variant="primary" type="submit">
          Sign in with Microsoft
        </Button>
      </form>
    </div>
  );
}
