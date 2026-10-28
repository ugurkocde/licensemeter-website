import { fmtDateTime } from "~/lib/format";
import type { DeviceSummary, HealthKey } from "~/server/metering/summary";

const DOCS = "https://docs.licensemeter.com/connectors/windows-metering/";

/** Docs section for each collection health state. */
export const HEALTH_DOCS: Record<HealthKey, string> = {
  reporting: `${DOCS}#full-coverage`,
  collecting: `${DOCS}#still-collecting`,
  gap: `${DOCS}#coverage-restarted`,
  outdated: `${DOCS}#updating-collector`,
  noReport: `${DOCS}#no-collector-result`,
  auditOff: `${DOCS}#process-auditing-off`,
  stale: `${DOCS}#report-stale`,
  error: `${DOCS}#collection-error`,
};
export const HEALTH_DOCS_INDEX = `${DOCS}#collection-health`;

export interface HealthDetail {
  /** What the device reported, in one sentence. */
  summary: string;
  /** Why this usually happens. */
  cause?: string;
  /** What an Admin can do; absent when nothing is needed. */
  fix?: string;
}

/** Plain-language state, cause and fix for one device. */
export function healthDetail(
  device: DeviceSummary,
  days: number,
  packageName: string | null,
): HealthDetail {
  const { row } = device;
  const payload = row.payload;
  const start = payload ? fmtDateTime(payload.s) : "";
  switch (device.health) {
    case "reporting":
      return {
        summary: `Reported continuously for the whole ${days}-day period, so “App not started” is reliable here.`,
      };
    case "collecting": {
      const covered = payload
        ? Math.floor(
            (Date.parse(payload.e) - Date.parse(payload.s)) / 86_400_000,
          )
        : 0;
      return {
        summary: `Covered without a gap since ${start}, day ${covered + 1} of ${days}.`,
        cause: `Starts count right away. “App not started” needs the full ${days} days.`,
      };
    }
    case "gap":
      return {
        summary: `Coverage restarted at ${start}. The starts this device reported still count, but its ${days}-day period starts again.`,
        cause:
          payload?.h === "log_reset"
            ? "The Security log was cleared, or the collector’s bookmark no longer matched it, for example after a reinstall or a restored image."
            : device.countsDays
              ? "Security log events may be missing since the last run: the log rolled over before the hourly run, Process Creation auditing was switched off, or the scan hit its time limit."
              : "This device still runs the older collector, which restarted coverage whenever Intune re-applied the audit policy, every few hours. It switches to the updated collector on its next hourly run.",
        fix: device.countsDays
          ? "Once in a while needs no action. If it repeats on every run, keep the hourly schedule, raise the Security log maximum size to 100 to 200 MB, and check that no other policy switches Process Creation auditing off."
          : undefined,
      };
    case "outdated":
      return {
        summary:
          "This device reports from an older app list, so apps added since then show “Not watched yet” on it.",
        cause:
          "Devices switch on their next hourly run after the collector in Intune is updated.",
        fix: "If Setup lists apps that are not watched yet, update the collector there.",
      };
    case "noReport":
      return {
        summary: packageName
          ? `Intune has no result from this device for “${packageName}”.`
          : "Intune has no collector result from this device.",
        cause:
          "The package is not assigned to the device, or the device has not run it yet. First results can take a few hours to reach Intune.",
        fix: "Assign the package to the device or one of its groups in Intune, then let the device sync.",
      };
    case "auditOff":
      return {
        summary:
          "Audit Process Creation (Success) is off on this device, so it cannot see app starts.",
        fix: "Turn it on through your Intune audit policy and check the effective setting on the device with auditpol.",
      };
    case "stale":
      return {
        summary: `The last report is from ${row.reportedAt ? fmtDateTime(row.reportedAt) : "an unknown date"}, more than eight days ago.`,
        cause:
          "The device is switched off, offline or no longer checks in with Intune.",
        fix: "Bring it online, or remove it from Intune if it is retired.",
      };
    case "error":
      return row.status === "script_error"
        ? {
            summary:
              "Intune reports that the collector script failed on this device.",
            cause:
              "The package must run as SYSTEM in 64-bit PowerShell. With signature enforcement on, an unsigned script cannot run.",
            fix: "Open the device’s Remediations status in Intune and compare the package settings with Setup.",
          }
        : row.status === "invalid_output"
          ? {
              summary:
                "The device returned output LicenseMeter cannot read, so none of it is used.",
              cause:
                "The detection script was edited or replaced with another script.",
              fix: "Replace the detection script with the current collector from Setup.",
            }
          : {
              summary: "The collector stopped with an error on its last run.",
              cause:
                "It could not read the Security log or write its checkpoint in ProgramData.",
              fix: "This often clears on the next run. If it repeats, check that security software allows the script and that SYSTEM can write to the LicenseMeter folder in ProgramData.",
            };
  }
}

/** The device's state with cause, fix and the matching docs section. */
export function DeviceHealthNotice({
  device,
  days,
  packageName,
  tone,
}: {
  device: DeviceSummary;
  days: number;
  packageName: string | null;
  /** Soft tone classes of the health state. */
  tone: string;
}) {
  const detail = healthDetail(device, days, packageName);
  return (
    <div className={`rounded-xl px-4 py-3 text-sm ${tone}`}>
      <p className="text-ink">{detail.summary}</p>
      {detail.cause && <p className="text-ink-soft mt-1.5">{detail.cause}</p>}
      {detail.fix && (
        <p className="text-ink mt-1.5">
          <strong className="font-medium">What to do: </strong>
          {detail.fix}
        </p>
      )}
      <a
        className="text-ink-soft mt-2 inline-block text-xs underline"
        href={HEALTH_DOCS[device.health]}
      >
        About this state
      </a>
    </div>
  );
}
