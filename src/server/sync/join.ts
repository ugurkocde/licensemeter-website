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
  mailAliases: string[];
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
      mailAliases: mailAliasesOf(g),
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
 * Mail addresses a user is reachable under besides the UPN: primary mail and
 * every smtp: proxy address, trimmed, lowercased and deduped, the UPN itself
 * left out. Persisted on tenant_users so a re-analysis from the database
 * correlates connector seats exactly like the sync that pulled them.
 */
export const mailAliasesOf = (g: GraphUser): string[] => {
  const upn = g.userPrincipalName.trim().toLowerCase();
  const aliases = [
    g.mail ?? "",
    ...(g.proxyAddresses ?? [])
      .filter((p) => /^smtp:/i.test(p))
      .map((p) => p.slice("smtp:".length)),
  ]
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a !== "" && a !== upn);
  return [...new Set(aliases)];
};

export type DirectoryRow = {
  graphId: string;
  upn: string;
  displayName: string | null;
  accountEnabled: boolean;
  mailAliases?: readonly string[];
};

const normalizeAddress = (address: string): string =>
  address.trim().toLowerCase();

/** Lowest graphId first: a fixed order that does not depend on row order. */
const byGraphId = (a: DirectoryRow, b: DirectoryRow): number =>
  a.graphId < b.graphId ? -1 : a.graphId > b.graphId ? 1 : 0;

/**
 * Every directory user claiming each address, as UPN or as a mail alias,
 * sorted by graphId. The basis for seat correlation and exclusions, so both
 * are independent of the order the rows arrive in (Graph order in a sync,
 * database order in a re-analysis).
 */
export const addressClaimantsOf = (
  rows: readonly DirectoryRow[],
): Map<string, { upnOwners: DirectoryRow[]; all: DirectoryRow[] }> => {
  const claims = new Map<
    string,
    { upnOwners: DirectoryRow[]; all: DirectoryRow[] }
  >();
  const claim = (address: string, row: DirectoryRow, asUpn: boolean) => {
    if (address === "") return;
    const entry = claims.get(address) ?? { upnOwners: [], all: [] };
    if (asUpn) entry.upnOwners.push(row);
    if (!entry.all.includes(row)) entry.all.push(row);
    claims.set(address, entry);
  };
  for (const r of rows) {
    const upn = normalizeAddress(r.upn);
    claim(upn, r, true);
    for (const alias of r.mailAliases ?? []) {
      const address = normalizeAddress(alias);
      if (address !== upn) claim(address, r, false);
    }
  }
  for (const entry of claims.values()) {
    entry.upnOwners.sort(byGraphId);
    entry.all.sort(byGraphId);
  }
  return claims;
};

/**
 * Directory identities for connector seat matching: one entry per address a
 * user is reachable under (UPN and mail aliases), lowercased, sorted by
 * address. An address that is some user's UPN always belongs to that user,
 * even when another user lists it as an alias; an alias shared by several
 * users goes to the lowest graphId. The same function serves a fresh sync
 * (joined users) and every analysis from the database (stored tenant_users
 * rows), and neither depends on row order, so both correlate identically.
 * CSV-imported directories have no aliases and match on the UPN alone.
 */
export const directoryIdentitiesOf = (
  rows: readonly DirectoryRow[],
): EntraIdentity[] =>
  [...addressClaimantsOf(rows).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([address, { upnOwners, all }]) => {
      const owner = upnOwners[0] ?? all[0]!;
      return {
        graphId: owner.graphId,
        upn: address,
        displayName: owner.displayName,
        accountEnabled: owner.accountEnabled,
      };
    });

export { COPILOT_SKU_ID };
