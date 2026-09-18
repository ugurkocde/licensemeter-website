"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "~/components/ui";
import type { ConnectorSpec } from "~/lib/connectors";
import {
  connectSaasConnector,
  disconnectSaasConnector,
} from "~/server/actions";
import type { ActionResult } from "~/server/actions";

export const SaasConnectForm = ({ spec }: { spec: ConnectorSpec }) => {
  /* Object identity changes per failure so repeated identical errors re-focus. */
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [revealedField, setRevealedField] = useState<string | null>(null);
  const errorRef = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  /* Move focus to the failure message so keyboard and SR users land on it. */
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await connectSaasConnector(data);
          if (!result.ok) {
            setError({ message: result.error ?? "Connection failed" });
            return;
          }
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="provider" value={spec.provider} />
      {spec.fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint text-xs">
            {f.label} <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </span>
          <span className="relative">
            <input
              name={f.name}
              required
              type={
                f.secret
                  ? revealedField === f.name
                    ? "text"
                    : "password"
                  : f.inputMode === "url"
                    ? "url"
                    : "text"
              }
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              autoComplete={f.secret ? "new-password" : "off"}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className={`border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 w-full border px-3 py-2 text-sm focus-visible:ring-2 ${f.secret ? "pr-18" : ""}`}
            />
            {f.secret && (
              <button
                type="button"
                onClick={() =>
                  setRevealedField(revealedField === f.name ? null : f.name)
                }
                className="text-ink-soft hover:text-ink absolute inset-y-0 right-0 inline-flex min-h-11 items-center px-3 text-xs font-medium"
                aria-label={`${revealedField === f.name ? "Hide" : "Show"} ${f.label.toLowerCase()}`}
              >
                {revealedField === f.name ? "Hide" : "Show"}
              </button>
            )}
          </span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} className="px-4 py-2">
          {pending ? `Validating with ${spec.label}…` : spec.connectCta}
        </Button>
        <span
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-danger-text focus-visible:ring-brand text-xs focus-visible:ring-2"
        >
          {error?.message}
        </span>
      </div>
    </form>
  );
};

/**
 * Armed-confirm disconnect (same pattern as MemberActions): the first press
 * arms the button, the second one fires the action; failures surface in the
 * live region instead of being discarded.
 */
export const SaasDisconnectButton = ({ spec }: { spec: ConnectorSpec }) => {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) =>
      disconnectSaasConnector(spec.provider),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const message = armed
    ? spec.unpriced
      ? `This removes the connection, the imported ${spec.label} members and the spend history. Press again to confirm.`
      : `This removes the connection and its imported ${spec.label} seats. Press again to confirm.`
    : result && !result.ok
      ? (result.error ?? "Something went wrong")
      : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        /* First submit arms only; the second one fires the action. */
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        } else {
          setArmed(false);
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <Button disabled={pending} onBlur={() => setArmed(false)}>
        {pending
          ? "Removing…"
          : armed
            ? "Confirm disconnect"
            : `Disconnect ${spec.label}`}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={
          message ? "text-danger-text max-w-64 text-right text-xs" : "sr-only"
        }
      >
        {message}
      </span>
    </form>
  );
};
