"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonAnchor } from "~/components/ui";
import { METERING_SCOPES } from "~/lib/metering";

export function MeteringSetup({
  enabled,
  consented,
  configured,
  microsoftConnected,
  scriptId,
  scriptName,
  days,
}: {
  enabled: boolean;
  consented: boolean;
  configured: boolean;
  microsoftConnected: boolean;
  scriptId: string | null;
  scriptName: string | null;
  days: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [packages, setPackages] = useState<
    { id: string; displayName: string }[] | null
  >(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [selected, setSelected] = useState(scriptId ?? "");
  const [threshold, setThreshold] = useState(days);

  async function request(action: string) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const res = await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "configure"
            ? { scriptId: selected, inactivityDays: threshold }
            : {}),
        }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(result.error ?? "Could not update metering.");
      setMessage(
        action === "verify"
          ? "Metering access verified."
          : action === "sync"
            ? "Metering refresh complete."
            : action === "disable"
              ? "Metering disabled and stored observations deleted."
              : "Metering settings saved.",
      );
      setConfirmDisable(false);
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error ? err.message : "Could not update metering.",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function loadPackages() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const res = await fetch("/api/metering");
      const result = (await res.json()) as {
        packages?: { id: string; displayName: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(result.error ?? "Could not load packages.");
      setPackages(result.packages ?? []);
      if (!result.packages?.length)
        setMessage(
          "No remediation packages found. Deploy the collector in Intune, then reload this list.",
        );
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error ? err.message : "Could not load packages.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={busy}>
      {!enabled ? (
        <>
          <p className="text-ink-soft text-sm">
            Enable Software Metering for this workspace, then approve its
            separate read-only connection. The person completing the consent
            flow must also be an Admin in this workspace.
          </p>
          {!microsoftConnected ? (
            <p className="text-ink-soft text-sm">
              Connect Microsoft 365 before enabling Software Metering.
            </p>
          ) : !configured ? (
            <p className="text-ink-soft text-sm">
              Software Metering is awaiting setup by this installation’s
              operator. The{" "}
              <a
                className="underline"
                href="https://docs.licensemeter.com/connectors/windows-metering/"
              >
                setup guide
              </a>{" "}
              covers the separate Microsoft application.
            </p>
          ) : (
            <div>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void request("enable")}
              >
                {busy ? "Enabling…" : "Enable Software Metering"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <h3 className="font-medium">1. Approve metering access</h3>
            <p className="text-ink-soft mt-1 text-sm">
              A Global Administrator or Privileged Role Administrator approves
              these tenant-wide application permissions for the separate
              Software Metering application. Access includes other Intune
              scripts; LicenseMeter imports output only from the package you
              select.
            </p>
            <ul className="text-ink-soft my-3 space-y-1 text-xs">
              {METERING_SCOPES.map((scope) => (
                <li key={scope}>
                  <code className="break-all">{scope}</code>
                </li>
              ))}
            </ul>
            <form action="/api/connect/metering/start" method="post">
              <Button
                disabled={busy || !configured}
                variant={consented ? "secondary" : "primary"}
              >
                {consented
                  ? "Renew metering consent"
                  : "Grant metering permissions"}
              </Button>
            </form>
            <p className="text-ink-soft mt-2 text-sm">
              If your tenant administrator granted access in Microsoft Entra, or
              consent is still propagating, check access again without repeating
              approval.
            </p>
            <div className="mt-3">
              <Button
                disabled={busy || !configured}
                onClick={() => void request("verify")}
              >
                Check metering access
              </Button>
            </div>
            {consented && (
              <p className="text-good-text mt-2 text-sm">
                Metering access verified.
              </p>
            )}
          </div>
          <div className="border-line border-t pt-4">
            <h3 className="font-medium">2. Deploy the Windows collector</h3>
            <p className="text-ink-soft mt-1 text-sm">
              Enable Process Creation success auditing through your approved
              device policy. Deploy the script as a detection-only Intune
              Remediation, running as SYSTEM in 64-bit PowerShell every day.
              Start with a small device group.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <ButtonAnchor
                href="/connectors/Collect-LicenseMeterUsage.ps1"
                download
              >
                Download collector
              </ButtonAnchor>
              <ButtonAnchor href="https://docs.licensemeter.com/connectors/windows-metering/">
                Setup guide
              </ButtonAnchor>
            </div>
          </div>
          {consented && (
            <div className="border-line border-t pt-4">
              <h3 className="font-medium">
                3. Select the package and collect results
              </h3>
              <p className="text-ink-soft mt-1 text-sm">
                Select the package containing the LicenseMeter collector. Other
                scripts are rejected as invalid output. Changing the package
                clears its previous observations.
              </p>
              <div className="mt-3">
                <Button disabled={busy} onClick={() => void loadPackages()}>
                  {busy ? "Working…" : "Load remediation packages"}
                </Button>
              </div>
              {(packages !== null || scriptId !== null) && (
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void request("configure");
                  }}
                >
                  <label className="text-sm">
                    Remediation package
                    <select
                      className="border-line-input bg-card mt-1 min-h-11 w-full rounded-lg border p-2"
                      name="scriptId"
                      required
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select a package</option>
                      {scriptId &&
                        !packages?.some((p) => p.id === scriptId) && (
                          <option value={scriptId}>
                            {scriptName ?? "Current package"}
                          </option>
                        )}
                      {packages?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Observation period
                    <select
                      className="border-line-input bg-card mt-1 min-h-11 w-full rounded-lg border p-2"
                      name="inactivityDays"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      disabled={busy}
                    >
                      {[30, 60, 90].map((day) => (
                        <option key={day} value={day}>
                          {day} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <Button disabled={busy || !selected} type="submit">
                      Save collection settings
                    </Button>
                  </div>
                </form>
              )}
              {scriptId && (
                <div className="mt-3">
                  <Button
                    disabled={busy}
                    variant="primary"
                    onClick={() => void request("sync")}
                  >
                    {busy ? "Refreshing…" : "Refresh metering"}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="border-line border-t pt-4">
            {confirmDisable ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  Disable metering and permanently delete this workspace’s
                  observations and history? Also remove the separate app’s
                  consent in Microsoft Entra and unassign the collector in
                  Intune to stop device collection.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => void request("disable")}
                  >
                    Disable and delete metering data
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setConfirmDisable(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button disabled={busy} onClick={() => setConfirmDisable(true)}>
                Disable metering…
              </Button>
            )}
          </div>
        </>
      )}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${error ? "text-danger-text" : "text-ink-soft"}`}
      >
        {busy ? "Working…" : message}
      </p>
    </div>
  );
}
