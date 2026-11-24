"use client";

import { useActionState, useState } from "react";

import { Button, Card } from "~/components/ui";

type Result = { link: string } | { error: string } | null;

export const ConsentApprovalPanel = ({
  createLink,
}: {
  createLink: () => Promise<Result>;
}) => {
  const [result, create, pending] = useActionState(createLink, null);
  const [feedback, setFeedback] = useState("");
  const link = result && "link" in result ? result.link : null;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setFeedback("Link copied.");
    } catch {
      setFeedback("Copy the link using the field above.");
    }
  };

  return (
    <Card title="Waiting for admin consent?">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-soft">
          If Microsoft asked for admin approval, share an approval link with
          your Global Administrator or Privileged Role Administrator. They can
          review the read-only permissions and grant access without joining this
          workspace.
        </p>
        {link ? (
          <div className="flex flex-col gap-2">
            <label
              className="text-ink font-medium"
              htmlFor="consent-approval-link"
            >
              Approval link
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                className="border-line bg-subtle min-h-11 min-w-0 flex-1 rounded-xl border px-3 font-mono text-xs"
                id="consent-approval-link"
                value={link}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" onClick={copy}>
                Copy link
              </Button>
            </div>
            <p className="text-ink-soft text-xs">
              The link can be used once and expires 7 days after creation.
            </p>
            <div role="status" className="text-good-text text-xs">
              {feedback}
            </div>
          </div>
        ) : (
          <form action={create}>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating link…" : "Create approval link"}
            </Button>
            {result && "error" in result && (
              <p role="alert" className="text-danger-text mt-2">
                {result.error}
              </p>
            )}
          </form>
        )}
        <p className="text-ink-soft text-xs">
          If you can approve in Microsoft, you can retry Grant admin consent
          below.
        </p>
      </div>
    </Card>
  );
};
