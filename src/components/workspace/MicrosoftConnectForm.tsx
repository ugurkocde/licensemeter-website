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
import { MICROSOFT_CONNECTOR } from "~/lib/connectors";
import {
  connectMicrosoftByo,
  disconnectMicrosoft,
  type ActionResult,
  type MsConnectResult,
} from "~/server/actions";

type Checklist = { scope: string; granted: boolean }[];

/**
 * BYO Microsoft credential form: collects the customer's own app-registration
 * details (secret or certificate), submits to the test-connection action, and
 * renders the per-permission red/green checklist when consent is incomplete.
 */
export const MicrosoftByoForm = () => {
  const [credType, setCredType] = useState<"secret" | "cert">("secret");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [pending, startTransition] = useTransition();
  const [showSecret, setShowSecret] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set("credType", credType);
        startTransition(async () => {
          setError(null);
          setNote(null);
          setChecklist(null);
          const result: MsConnectResult = await connectMicrosoftByo(data);
          if (!result.ok) {
            setError(result.error);
            setChecklist(result.checklist ?? null);
            return;
          }
          // Success: a non-blocking warning (e.g. Reports probe) is shown
          // briefly before the page refreshes into the connected state.
          if (result.warning) {
            setNote(result.warning);
            setTimeout(() => router.refresh(), 2500);
            return;
          }
          router.refresh();
        });
      }}
    >
      {MICROSOFT_CONNECTOR.byo.idFields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint text-xs">
            {f.label} <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </span>
          <input
            name={f.name}
            required
            type="text"
            placeholder={f.placeholder}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 border px-3 py-2 font-mono text-sm focus-visible:ring-2"
          />
        </label>
      ))}

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="text-ink-faint text-xs">Credential type</legend>
        <div className="flex gap-4 pt-1">
          {(["secret", "cert"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="credTypeChoice"
                value={t}
                checked={credType === t}
                onChange={() => setCredType(t)}
              />
              {t === "secret" ? "Client secret" : "Certificate"}
            </label>
          ))}
        </div>
      </fieldset>

      {credType === "secret" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Client secret <span aria-hidden="true">*</span>
              <span className="sr-only"> (required)</span>
            </span>
            <span className="relative">
              <input
                name="secret"
                required
                type={showSecret ? "text" : "password"}
                placeholder={MICROSOFT_CONNECTOR.byo.secretPlaceholder}
                autoComplete="new-password"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className="border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 w-full border px-3 py-2 pr-18 text-sm focus-visible:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowSecret((value) => !value)}
                className="text-ink-soft hover:text-ink absolute inset-y-0 right-0 inline-flex min-h-11 items-center px-3 text-xs font-medium"
                aria-label={`${showSecret ? "Hide" : "Show"} client secret`}
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Secret expiry (optional, for the renewal reminder)
            </span>
            <input
              name="secretExpiresAt"
              type="date"
              autoComplete="off"
              className="border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 border px-3 py-2 text-sm focus-visible:ring-2"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Certificate private key (PEM) <span aria-hidden="true">*</span>
            </span>
            <textarea
              name="privateKey"
              required
              rows={4}
              placeholder={MICROSOFT_CONNECTOR.byo.privateKeyPlaceholder}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              className="border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-28 border px-3 py-2 font-mono text-xs focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Certificate (PEM) <span aria-hidden="true">*</span>
            </span>
            <textarea
              name="cert"
              required
              rows={4}
              placeholder={MICROSOFT_CONNECTOR.byo.certPlaceholder}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              className="border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-28 border px-3 py-2 font-mono text-xs focus-visible:ring-2"
            />
          </label>
        </>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} className="px-4 py-2">
          {pending ? "Testing connection…" : "Test and connect"}
        </Button>
      </div>

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-danger-text focus-visible:ring-brand text-xs focus-visible:ring-2"
        >
          {error}
        </p>
      )}

      {note && (
        <p role="status" aria-live="polite" className="text-waste-text text-xs">
          {note}
        </p>
      )}

      {checklist && (
        <ul className="border-line bg-card border text-xs">
          {checklist.map((c) => (
            <li
              key={c.scope}
              className="border-line flex items-center justify-between gap-4 border-b px-3 py-1.5 last:border-b-0"
            >
              <code className="font-mono">{c.scope}</code>
              <span
                className={c.granted ? "text-good-text" : "text-danger-text"}
              >
                {c.granted ? "granted" : "missing"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

/**
 * Armed-confirm disconnect for the Microsoft connection (same pattern as the
 * SaaS connectors): the first press arms, the second fires.
 */
export const MicrosoftDisconnectButton = () => {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null) => disconnectMicrosoft(),
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  const message = armed
    ? "This removes the Microsoft connection and stops the nightly sync. Press again to confirm."
    : result && !result.ok
      ? (result.error ?? "Something went wrong")
      : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
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
            : "Disconnect Microsoft"}
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
