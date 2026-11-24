import { redirect } from "next/navigation";

import { ButtonAnchor } from "~/components/ui";
import { workspaceLabel } from "~/lib/format";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { handoffFailurePath } from "~/server/auth/consentHandoff";
import { loadPendingHandoff } from "~/server/consentState";

export const metadata = { title: "Approve Microsoft 365 access" };

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
          {state.name ?? (state.email || "A workspace admin")}
        </strong>{" "}
        requested read-only Microsoft 365 access for the{" "}
        <strong className="text-ink">{workspaceLabel(workspace)}</strong>{" "}
        workspace.
      </p>
      <p className="text-ink-soft text-sm leading-relaxed">
        Use a Global Administrator or Privileged Role Administrator account in
        the tenant you want to connect. You will verify your account in
        Microsoft before showing the consent screen.
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
      <ButtonAnchor
        variant="primary"
        href={`/api/connect/approve?token=${token}`}
      >
        Review and grant in Microsoft
      </ButtonAnchor>
    </div>
  );
}
