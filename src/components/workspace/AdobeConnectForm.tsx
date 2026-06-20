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
import { connectAdobe, disconnectAdobe } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

const FIELDS = [
  { name: "orgId", label: "Organization ID", placeholder: "1234ABCD…@AdobeOrg" },
  { name: "clientId", label: "Client ID (API key)", placeholder: "a1b2c3d4e5f6…" },
  { name: "clientSecret", label: "Client secret", placeholder: "p8e-AbCdEf…" },
] as const;

export const AdobeConnectForm = () => {
  /* Object identity changes per failure so repeated identical errors re-focus. */
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pending, startTransition] = useTransition();
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
          const result = await connectAdobe(data);
          if (!result.ok) {
            setError({ message: result.error ?? "Connection failed" });
          }
          router.refresh();
        });
      }}
    >
      {FIELDS.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-faint">{f.label}</span>
          <input
            name={f.name}
            required
            type={f.name === "clientSecret" ? "password" : "text"}
            placeholder={f.placeholder}
            autoComplete={f.name === "clientSecret" ? "new-password" : "off"}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="border border-line bg-card px-3 py-2 text-sm focus:border-ink"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} className="px-4 py-2">
          {pending ? "Validating with Adobe…" : "Connect Adobe"}
        </Button>
        <span
          ref={errorRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="text-xs text-danger-text focus:outline-none"
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
export const AdobeDisconnectButton = () => {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) => disconnectAdobe(),
    null,
  );

  /* Disarm when the confirm click does not come within ~5s. */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const message = armed
    ? "This removes the connection and its synced Adobe seats. Press again to confirm."
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
        {pending ? "Removing…" : armed ? "Confirm disconnect" : "Disconnect Adobe"}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={
          message ? "max-w-64 text-right text-xs text-danger-text" : "sr-only"
        }
      >
        {message}
      </span>
    </form>
  );
};
