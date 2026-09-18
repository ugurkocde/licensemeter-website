import type {
  CopilotUsageRow,
  GraphUser,
  UsageReportRow,
} from "~/server/graph/types";
import { isConcealedUpn } from "~/server/graph/types";
import type { EntraIdentity } from "~/server/adobe/analyze";
import {
  COPILOT_SKU_ID,
  type WasteInput,
  type WasteUser,
} from "~/server/waste/engine";
import type { AggregateUsage, WorkloadActivity } from "~/server/types";

const maxDate = (...dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>(
    (max, d) => (d && (!max || d > max) ? d : max),
    null,
  );

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export type JoinedUser = WasteUser & {
  lastInteractiveSignIn: Date | null;
  lastNonInteractiveSignIn: Date | null;
  workloadActivity: WorkloadActivity;
};

export type JoinResult = {
  users: JoinedUser[];
  hasP1: boolean;
  concealed: boolean;
  activitySignal: WasteInput["activitySignal"];
  copilotSignal: WasteInput["copilotSignal"];
  usageAggregate?: AggregateUsage;
  copilotAggregate?: AggregateUsage;
};

/**
 * Merges directory users with usage/copilot report rows into the engine's
 * input shape, deciding which signals are usable:
 * - Reports join by UPN, which fails when the tenant conceals report names.
 * - Sign-in timestamps come from Entra P1 tenants only (hasP1).
 * - Concealed reports still yield aggregate counts.
 */
export const joinSignals = (args: {
  graphUsers: GraphUser[];
  usageRows: UsageReportRow[];
  copilotRows: CopilotUsageRow[];
  hasP1: boolean;
}): JoinResult => {
  const { graphUsers, usageRows, copilotRows, hasP1 } = args;

  const concealed =
    usageRows.some((r) => isConcealedUpn(r.userPrincipalName)) ||
    copilotRows.some((r) => isConcealedUpn(r.userPrincipalName));

  const usageByUpn = new Map(
    usageRows.map((r) => [r.userPrincipalName.toLowerCase(), r]),
  );
  const copilotByUpn = new Map(
    copilotRows.map((r) => [r.userPrincipalName.toLowerCase(), r]),
  );

  const users: JoinedUser[] = graphUsers.map((g) => {
    const upnKey = g.userPrincipalName.toLowerCase();
    const usage = concealed ? undefined : usageByUpn.get(upnKey);
    const copilot = concealed ? undefined : copilotByUpn.get(upnKey);

    const workloadActivity: WorkloadActivity = {
      exchange: usage?.exchangeLastActivityDate ?? null,
      oneDrive: usage?.oneDriveLastActivityDate ?? null,
      sharePoint: usage?.sharePointLastActivityDate ?? null,
      teams: usage?.teamsLastActivityDate ?? null,
      copilot: copilot?.lastActivityDate ?? null,
    };

    const lastInteractiveSignIn = toDate(g.signInActivity?.lastSignInDateTime);
    const lastNonInteractiveSignIn = toDate(
      g.signInActivity?.lastNonInteractiveSignInDateTime,
    );

    const lastActivity = maxDate(
      lastInteractiveSignIn,
      lastNonInteractiveSignIn,
      toDate(workloadActivity.exchange),
      toDate(workloadActivity.oneDrive),
      toDate(workloadActivity.sharePoint),
      toDate(workloadActivity.teams),
      toDate(workloadActivity.copilot),
    );

    const licenses = (g.licenseAssignmentStates ?? []).length
      ? (g.licenseAssignmentStates ?? []).map((s) => ({
          skuId: s.skuId,
          assignedByGroup: s.assignedByGroup,
          disabledPlans: s.disabledPlans ?? [],
          state: s.state,
        }))
      : g.assignedLicenses.map((l) => ({
          skuId: l.skuId,
          assignedByGroup: null,
          disabledPlans: l.disabledPlans,
          state: "Active",
        }));

    return {
      graphId: g.id,
      upn: g.userPrincipalName,
      displayName: g.displayName,
      accountEnabled: g.accountEnabled,
      userType: g.userType,
      createdDateTime: toDate(g.createdDateTime),
      lastActivity,
      copilotLastActivity: toDate(workloadActivity.copilot),
      licenses,
      lastInteractiveSignIn,
      lastNonInteractiveSignIn,
      workloadActivity,
    };
  });

  // Per-user inactivity detection works when sign-ins (P1) or joinable
  // reports exist. No sign-ins AND no usage rows (report unavailable, e.g.
  // a delegated scan without a reports-capable role) means no signal at all:
  // "full" here would flag every user as never active.
  const activitySignal: JoinResult["activitySignal"] =
    hasP1 || (!concealed && usageRows.length > 0) ? "full" : "none";

  const copilotSignal: JoinResult["copilotSignal"] =
    copilotRows.length === 0 ? "none" : concealed ? "aggregate" : "per-user";

  const usageAggregate: AggregateUsage | undefined = concealed
    ? {
        totalCount: usageRows.length,
        inactiveCount: usageRows.filter(
          (r) =>
            !r.exchangeLastActivityDate &&
            !r.oneDriveLastActivityDate &&
            !r.sharePointLastActivityDate &&
            !r.teamsLastActivityDate,
        ).length,
      }
    : undefined;

  const copilotAggregate: AggregateUsage | undefined =
    copilotSignal === "aggregate"
      ? {
          totalCount: copilotRows.length,
          inactiveCount: copilotRows.filter((r) => !r.lastActivityDate).length,
        }
      : undefined;

  return {
    users,
    hasP1,
    concealed,
    activitySignal,
    copilotSignal,
    usageAggregate,
    copilotAggregate,
  };
};

/**
 * Directory identities for connector seat matching: one entry per address a
 * user is reachable under (UPN, primary mail, every smtp: proxy address),
 * lowercased for lookup, first writer wins on a shared address. Built in
 * memory per sync; nothing beyond the UPN is persisted.
 */
export const entraIdentitiesOf = (graphUsers: GraphUser[]): EntraIdentity[] => {
  const byAddress = new Map<string, EntraIdentity>();
  for (const g of graphUsers) {
    const addresses = [
      g.userPrincipalName,
      g.mail ?? "",
      ...(g.proxyAddresses ?? [])
        .filter((p) => /^smtp:/i.test(p))
        .map((p) => p.slice("smtp:".length)),
    ];
    for (const raw of addresses) {
      const address = raw.trim().toLowerCase();
      if (address === "" || byAddress.has(address)) continue;
      byAddress.set(address, {
        graphId: g.id,
        upn: address,
        displayName: g.displayName,
        accountEnabled: g.accountEnabled,
      });
    }
  }
  return [...byAddress.values()];
};

export { COPILOT_SKU_ID };
