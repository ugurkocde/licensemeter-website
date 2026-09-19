"use client";

import { useActionState } from "react";

import {
  createMcpTokenAction,
  type CreateMcpTokenResult,
} from "~/app/app/(dash)/mcp/actions";
import { CopyBlock } from "~/components/mcp/CopyBlock";
import { Button } from "~/components/ui";

/**
 * Creates a token and shows it exactly once: the plain value only exists in
 * this action result, so it is gone after a reload.
 */
export const CreateTokenForm = ({
  atLimit,
  nameMax,
}: {
  atLimit: boolean;
  nameMax: number;
}) => {
  const [result, formAction, pending] = useActionState(
    async (_prev: CreateMcpTokenResult | null, formData: FormData) =>
      createMcpTokenAction(formData),
    null,
  );

  return (
    <div className="border-line mt-4 border-t pt-4">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          type="text"
          required
          maxLength={nameMax}
          autoComplete="off"
          aria-label="Name for the new token"
          placeholder="Where this token is used, for example: Finance desktop"
          className="border-line bg-card focus:border-ink min-w-56 flex-1 border px-3 py-2 text-sm"
        />
        <Button
          variant="primary"
          disabled={pending || atLimit}
          className="px-4 py-2"
        >
          {pending ? "Creating…" : "Create token"}
        </Button>
      </form>
      <p
        role="status"
        aria-live="polite"
        className={
          result && !result.ok ? "text-danger-text mt-2 text-xs" : "sr-only"
        }
      >
        {result === null
          ? null
          : result.ok
            ? `Token ${result.name} created.`
            : result.error}
      </p>
      {result?.ok && (
        <div className="border-gold bg-gold-soft mt-3 rounded-xl border px-4 py-3">
          <p className="text-gold-text text-sm font-medium">
            Copy the token for {result.name} now. It is not shown again.
          </p>
          <div className="mt-2">
            <CopyBlock label="New token" value={result.token} />
          </div>
        </div>
      )}
      {atLimit && (
        <p className="text-ink-faint mt-2 text-xs">
          This workspace has reached its number of active tokens. Revoke one to
          create another.
        </p>
      )}
    </div>
  );
};
