"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui";

/** Reads Intune again now instead of reusing the last few minutes' read. */
export function MeteringRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Could not read Intune.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Intune.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={busy} onClick={() => void refresh()}>
        {busy ? "Reading…" : "Read latest results"}
      </Button>
      <p role="status" aria-live="polite" className="text-danger-text text-xs">
        {error}
      </p>
    </div>
  );
}
