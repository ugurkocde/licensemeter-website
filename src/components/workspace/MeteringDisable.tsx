"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui";

/** Disable stays available when the plan no longer includes metering. */
export function MeteringDisable() {
  const router = useRouter();
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
      router.refresh();
    } catch {
      setMessage("Could not disable metering. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button disabled={busy} onClick={() => void disable()}>
          {busy ? "Disabling…" : "Disable metering"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-danger-text text-sm">
        {message}
      </p>
    </div>
  );
}
