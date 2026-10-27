"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui";

/** Deletes the metering settings; also available after a plan downgrade. */
export function MeteringDisable() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      if (!res.ok) throw new Error();
      setConfirming(false);
      router.refresh();
    } catch {
      setMessage("Could not disable metering. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <>
          <p className="text-sm">
            Disable Software Metering and delete its settings? LicenseMeter
            stops reading results. To stop collection on devices, also unassign
            the collector in Intune and remove the separate app’s consent in
            Microsoft Entra.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void disable()}>
              {busy ? "Disabling…" : "Disable metering"}
            </Button>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button onClick={() => setConfirming(true)}>Disable metering…</Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-danger-text text-sm">
        {message}
      </p>
    </div>
  );
}
