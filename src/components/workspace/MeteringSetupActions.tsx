"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui";

async function post(body: object): Promise<void> {
  const res = await fetch("/api/metering", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const result = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(result.error ?? "Could not update Software Metering.");
  }
}

const Status = ({ message, error }: { message: string; error: boolean }) => (
  <p
    role="status"
    aria-live="polite"
    className={`text-sm ${error ? "text-danger-text" : "text-ink-soft"}`}
  >
    {message}
  </p>
);

/** Enables metering if needed, then goes straight to Microsoft consent. */
export function MeteringConnect({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      if (!enabled) await post({ action: "enable" });
      form.current?.requestSubmit();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not connect.");
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <form ref={form} action="/api/connect/metering/start" method="post" />
      <div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void connect()}
        >
          {busy ? "Opening Microsoft…" : label}
        </Button>
      </div>
      <Status message={message} error />
    </div>
  );
}

/** For consent granted directly in Microsoft Entra or still propagating. */
export function MeteringVerify() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function verify() {
    setBusy(true);
    setMessage("");
    try {
      await post({ action: "verify" });
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Could not verify.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void verify()}
        className="text-brand-text self-start text-sm underline disabled:opacity-50"
      >
        {busy
          ? "Checking…"
          : "Already approved in Microsoft Entra? Check access"}
      </button>
      <Status message={message} error={error} />
    </div>
  );
}

/** Observation period, and the package when several run the collector. */
export function MeteringSettingsForm({
  days,
  packages,
  selected,
}: {
  days: number;
  packages: { id: string; name: string }[];
  selected: string | null;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(days);
  const [scriptId, setScriptId] = useState(selected ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function save() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await post({
        action: "configure",
        inactivityDays: period,
        ...(packages.length > 1 && scriptId ? { scriptId } : {}),
      });
      setMessage("Saved.");
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {packages.length > 1 && (
        <label className="min-w-56 flex-1 text-sm">
          Collector package
          <select
            value={scriptId}
            onChange={(event) => setScriptId(event.target.value)}
            className="border-line-input bg-card mt-1 block min-h-11 w-full rounded-lg border px-2"
          >
            <option value="">Choose a package</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        Observation period
        <select
          value={period}
          onChange={(event) => setPeriod(Number(event.target.value))}
          className="border-line-input bg-card mt-1 block min-h-11 rounded-lg border px-2"
        >
          {[30, 60, 90].map((value) => (
            <option key={value} value={value}>
              {value} days
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Status message={message} error={error} />
    </form>
  );
}

/**
 * Writes LicenseMeter's own collector to Intune after an Admin confirms.
 * "create" makes the Remediations package; "update" replaces its script.
 */
export function MeteringIntuneAction({
  mode,
  packageName,
}: {
  mode: "create" | "update";
  packageName?: string;
}) {
  const router = useRouter();
  const [assign, setAssign] = useState<"none" | "all">("none");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function run() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await post(
        mode === "create" ? { action: "deploy", assign } : { action: "update" },
      );
      setConfirming(false);
      setMessage(
        mode === "create"
          ? "Created in Intune."
          : "Updated in Intune. Devices use the new version from their next run.",
      );
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error ? err.message : "Could not write to Intune.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {mode === "create" && (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Assignment</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="assign"
              checked={assign === "none"}
              onChange={() => setAssign("none")}
              className="mt-1"
            />
            <span>
              I assign it in Intune myself{" "}
              <span className="text-ink-faint">
                (recommended: start with a pilot group)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="assign"
              checked={assign === "all"}
              onChange={() => setAssign("all")}
              className="mt-1"
            />
            <span>Assign it to all devices, hourly</span>
          </label>
        </fieldset>
      )}
      {confirming ? (
        <div className="bg-subtle flex flex-col gap-3 rounded-lg p-3 text-sm">
          <p>
            {mode === "create"
              ? `LicenseMeter creates the Remediations package “LicenseMeter Software Metering collector” in Intune: detection script only, SYSTEM, 64-bit${assign === "all" ? ", assigned to all devices hourly" : ", not assigned yet"}. Nothing else in your tenant is changed.`
              : `LicenseMeter replaces the detection script in “${packageName ?? "the collector package"}” with the current version. Its assignment and schedule stay as they are.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy
                ? "Writing to Intune…"
                : mode === "create"
                  ? "Create in Intune"
                  : "Update in Intune"}
            </Button>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="primary" onClick={() => setConfirming(true)}>
            {mode === "create" ? "Create in Intune…" : "Update in Intune…"}
          </Button>
        </div>
      )}
      <Status message={message} error={error} />
    </div>
  );
}
