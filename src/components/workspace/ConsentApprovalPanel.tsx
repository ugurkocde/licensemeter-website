"use client";

import { useActionState, useState } from "react";

import type { ApprovalLinkResult } from "~/app/app/(dash)/connectors/microsoft/approvalAction";
import { Button, Card } from "~/components/ui";

type Link = Extract<ApprovalLinkResult, { token: string }>;
type PanelState = { active: Link | null; error: string; revoked: boolean };

export const ConsentApprovalPanel = ({
  initialLink,
  createLink,
  revokeLink,
}: {
  initialLink: Link | null;
  createLink: () => Promise<ApprovalLinkResult>;
  revokeLink: (token: string) => Promise<ApprovalLinkResult>;
}) => {
  const [result, submit, pending] = useActionState<PanelState, string | null>(
    async (previous, token) => {
      setFeedback("");
      const next = token ? await revokeLink(token) : await createLink();
      if (next && "error" in next) return { ...previous, error: next.error };
      return {
        active: next && "token" in next ? next : null,
        error: "",
        revoked: Boolean(token),
      };
    },
    { active: initialLink, error: "", revoked: false },
  );
  const [feedback, setFeedback] = useState("");
  const active = result.active;
  const copy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.link);
      setFeedback("Link copied.");
    } catch {
      setFeedback("Select and copy the approval link manually.");
    }
  };

  return (
    <Card title="Waiting for admin consent?">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-soft">
          If Microsoft asked for admin approval, share an approval link with a
          Global Administrator or Privileged Role Administrator in your
          Microsoft tenant. They can grant read-only access without joining this
          workspace.
        </p>
        {active ? (
          <div className="flex flex-col gap-2">
            <label
              className="text-ink font-medium"
              htmlFor="consent-approval-link"
            >
              Approval link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="border-line bg-subtle min-h-11 min-w-0 flex-1 rounded-xl border px-3 font-mono text-xs"
                id="consent-approval-link"
                value={active.link}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={copy}>
                  Copy link
                </Button>
                <form action={() => submit(active.token)}>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Revoking link…" : "Revoke link"}
                  </Button>
                </form>
              </div>
            </div>
            <p className="text-ink-soft text-xs">
              The link can be used once and expires 7 days after creation.
            </p>
            <div role="status" className="text-good-text text-xs">
              {feedback}
            </div>
          </div>
        ) : (
          <form action={() => submit(null)}>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Creating link…"
                : result.revoked
                  ? "Create a new link"
                  : "Create approval link"}
            </Button>
          </form>
        )}
        {result.error && (
          <p role="alert" className="text-danger-text">
            {result.error}
          </p>
        )}
        <p className="text-ink-soft text-xs">
          If you can approve in Microsoft, you can retry Grant admin consent
          below.
        </p>
      </div>
    </Card>
  );
};
