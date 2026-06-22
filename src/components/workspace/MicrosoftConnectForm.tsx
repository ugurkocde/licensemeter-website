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
          <span className="text-xs text-ink-faint">{f.label}</span>
          <input
            name={f.name}
            required
            type="text"
            placeholder={f.placeholder}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="border border-line bg-card px-3 py-2 font-mono text-sm focus:border-ink"
          />
        </label>
      ))}

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="text-xs text-ink-faint">Credential type</legend>
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
            <span className="text-xs text-ink-faint">Client secret</span>
            <input
              name="secret"
              required
              type="password"
              placeholder={MICROSOFT_CONNECTOR.byo.secretPlaceholder}
              autoComplete="new-password"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="border border-line bg-card px-3 py-2 text-sm focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-faint">
              Secret expiry (optional, for the renewal reminder)
            </span>
            <input
              name="secretExpiresAt"
              type="date"
              className="border border-line bg-card px-3 py-2 text-sm focus:border-ink"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-faint">
              Certificate private key (PEM)
            </span>
            <textarea
              name="privateKey"
              required
              rows={4}
              placeholder={MICROSOFT_CONNECTOR.byo.privateKeyPlaceholder}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="border border-line bg-card px-3 py-2 font-mono text-xs focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-faint">Certificate (PEM)</span>
            <textarea
              name="cert"
              required
              rows={4}
              placeholder={MICROSOFT_CONNECTOR.byo.certPlaceholder}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="border border-line bg-card px-3 py-2 font-mono text-xs focus:border-ink"
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
          role="status"
          aria-live="polite"
          className="text-xs text-danger-text focus:outline-none"
        >
          {error}
        </p>
      )}

      {note && (
        <p role="status" aria-live="polite" className="text-xs text-waste-text">
          {note}
        </p>
      )}

      {checklist && (
        <ul className="border border-line bg-card text-xs">
          {checklist.map((c) => (
            <li
              key={c.scope}
              className="flex items-center justify-between gap-4 border-b border-line px-3 py-1.5 last:border-b-0"
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
          message ? "max-w-64 text-right text-xs text-danger-text" : "sr-only"
        }
      >
        {message}
      </span>
    </form>
  );
};
