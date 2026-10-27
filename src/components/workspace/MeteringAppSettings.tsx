"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui";

const PROGRAM = /^[a-z0-9][a-z0-9 ._+()&-]{0,62}\.exe$/;
const SOURCE: Record<string, string> = {
  catalog: "Recognised automatically from the app name.",
  detection: "Taken from the app's Intune detection rule.",
  admin: "Entered by an admin.",
  none: "LicenseMeter does not know this app's program file yet.",
};

/**
 * One app's metering settings. Saving also updates the collector in Intune
 * when LicenseMeter can write there, so devices pick up the change.
 */
export function MeteringAppSettings({
  id,
  programs,
  source,
  excluded,
  updateIntune,
}: {
  id: string;
  programs: string[];
  source: string;
  excluded: boolean;
  /** LicenseMeter can write and the collector package was found. */
  updateIntune: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState(programs.join(", "));
  const [metered, setMetered] = useState(!excluded);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const parsed = input
    .split(/[,;\s]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const invalid = parsed.some((name) => !PROGRAM.test(name));
  const changedPrograms = parsed.join(", ") !== programs.join(", ");
  const changed = changedPrograms || metered === excluded;

  async function save() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const res = await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "app",
          id,
          excluded: !metered,
          updateIntune,
          ...(changedPrograms ? { programs: parsed } : {}),
        }),
      });
      const result = (await res.json()) as { error?: string; intune?: string };
      if (!res.ok) throw new Error(result.error ?? "Could not save.");
      setMessage(
        !updateIntune
          ? "Saved. Download the updated collector in Setup and replace the script in Intune."
          : result.intune === "updated"
            ? "Saved and updated in Intune. Devices use it from their next hourly run."
            : "Saved. The collector in Intune already matches.",
      );
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
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={metered}
          onChange={(event) => setMetered(event.target.checked)}
        />
        Meter this app
      </label>
      <label className="text-sm">
        Program file
        <input
          value={input}
          disabled={!metered}
          placeholder="example.exe"
          onChange={(event) => setInput(event.target.value)}
          className="border-line-input bg-card mt-1 block min-h-11 w-full rounded-lg border px-3 font-mono text-sm disabled:opacity-50"
        />
        <span className="text-ink-faint mt-1 block text-xs">
          {changedPrograms
            ? "The file name only, for example acad.exe. Separate several with commas."
            : (SOURCE[source] ?? "")}
        </span>
      </label>
      {invalid && (
        <p className="text-danger-text text-sm">
          Use file names ending in .exe, without paths.
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || invalid || !changed || (metered && !parsed.length)}
        >
          {busy ? "Saving…" : updateIntune ? "Save and update Intune" : "Save"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${error ? "text-danger-text" : "text-ink-soft"}`}
      >
        {message}
      </p>
    </form>
  );
}
