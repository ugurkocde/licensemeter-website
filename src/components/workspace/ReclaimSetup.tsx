"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "~/components/ui";
import { ArmedActionButton } from "./ArmedActionButton";
import {
  connectReclaimByo,
  disconnectReclaim,
  setReclaimApprovalMode,
  verifyReclaimConsent,
} from "~/app/app/(dash)/reclaim/actions";
import { APPROVAL_MODES, type ReclaimApprovalMode } from "~/lib/reclaim";

const INPUT =
  "border-line-input bg-card focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 border px-3 py-2 text-sm focus-visible:ring-2";

const Status = ({ message, error }: { message: string; error: boolean }) =>
  message ? (
    <p
      role={error ? "alert" : "status"}
      className={`text-sm ${error ? "text-danger-text" : "text-ink-soft"}`}
    >
      {message}
    </p>
  ) : null;

/** Opens Microsoft admin consent for LicenseMeter's reclaim app. */
export function ReclaimConsentButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action="/api/connect/reclaim/start"
      method="post"
      onSubmit={() => setBusy(true)}
    >
      <Button variant="primary" type="submit" disabled={busy}>
        {busy ? "Opening Microsoft…" : label}
      </Button>
    </form>
  );
}

/** For consent granted directly in Entra, or still taking effect. */
export function ReclaimVerifyButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMessage("");
              const res = await verifyReclaimConsent();
              if (!res.ok) setMessage(res.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Checking with Microsoft…" : "Verify consent"}
        </Button>
      </div>
      <Status message={message} error />
    </div>
  );
}

/** The customer's own app registration with only the license permission. */
export function ReclaimByoForm({ tid }: { tid: string }) {
  const router = useRouter();
  const [credType, setCredType] = useState<"secret" | "cert">("secret");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) =>
        start(async () => {
          setMessage("");
          const res = await connectReclaimByo(formData);
          if (!res.ok) setMessage(res.error);
          else router.refresh();
        })
      }
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint text-xs">Directory (tenant) ID</span>
        <input
          readOnly
          value={tid}
          className={`${INPUT} text-ink-soft font-mono`}
          aria-describedby="reclaim-tid-help"
        />
        <span id="reclaim-tid-help" className="text-ink-faint text-xs">
          The Microsoft tenant connected to this workspace.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint text-xs">
          Application (client) ID<span className="sr-only"> (required)</span>
        </span>
        <input
          name="appClientId"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="00000000-0000-0000-0000-000000000000"
          className={`${INPUT} font-mono`}
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="text-ink-faint text-xs">Credential type</legend>
        <div className="flex gap-4 pt-1">
          {(["secret", "cert"] as const).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="credType"
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
              Client secret value<span className="sr-only"> (required)</span>
            </span>
            <input
              name="secret"
              type="password"
              required
              autoComplete="off"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Secret expiry date (optional)
            </span>
            <input name="secretExpiresAt" type="date" className={INPUT} />
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Certificate (PEM)<span className="sr-only"> (required)</span>
            </span>
            <textarea
              name="cert"
              required
              spellCheck={false}
              className={`${INPUT} min-h-28 font-mono text-xs`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint text-xs">
              Private key (PEM)<span className="sr-only"> (required)</span>
            </span>
            <textarea
              name="privateKey"
              required
              spellCheck={false}
              className={`${INPUT} min-h-28 font-mono text-xs`}
            />
          </label>
        </>
      )}
      <div>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Testing the app…" : "Test and connect"}
        </Button>
      </div>
      <Status message={message} error />
    </form>
  );
}

export function ReclaimApprovalModeForm({
  current,
  canEdit,
}: {
  current: ReclaimApprovalMode;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <fieldset className="flex flex-col gap-2" disabled={!canEdit || pending}>
      <legend className="sr-only">Approval rule</legend>
      {(Object.keys(APPROVAL_MODES) as ReclaimApprovalMode[]).map((mode) => (
        <label
          key={mode}
          className={`border-line flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
            current === mode ? "border-brand bg-brand-soft/40" : ""
          } ${canEdit ? "" : "cursor-default"}`}
        >
          <input
            type="radio"
            name="approvalMode"
            value={mode}
            checked={current === mode}
            className="mt-1"
            onChange={() =>
              start(async () => {
                setMessage("");
                const res = await setReclaimApprovalMode(mode);
                if (!res.ok) setMessage(res.error);
                else router.refresh();
              })
            }
          />
          <span>
            <span className="text-ink font-medium">
              {APPROVAL_MODES[mode].label}
            </span>
            <span className="text-ink-soft mt-0.5 block">
              {APPROVAL_MODES[mode].description}
            </span>
          </span>
        </label>
      ))}
      <Status message={message} error />
    </fieldset>
  );
}

export function ReclaimDisconnectButton() {
  return (
    <ArmedActionButton
      label="Disconnect reclaim"
      confirmLabel="Click again to disconnect"
      busyLabel="Disconnecting…"
      ariaLabel="Disconnect reclaim write access"
      run={disconnectReclaim}
    />
  );
}
