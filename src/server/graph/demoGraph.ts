import {
  PremiumLicenseRequiredError,
  type CopilotUsageRow,
  type GraphClient,
  type GraphSubscribedSku,
  type GraphSubscription,
  type GraphUser,
  type UsageReportRow,
} from "./types";

/**
 * Deterministic fixture tenant ("Meridian Industries GmbH", ~155 users) used by
 * demo mode and the test suite. Mirrors the waste patterns the rules look for:
 * disabled accounts holding licenses, never-active users, 90-day-inactive users,
 * shelfware, unused Copilot seats, and licensed guests.
 */

const SKU = {
  E3: "05e9a617-0261-4cee-bb44-138d3ef5d965", // Microsoft 365 E3
  COPILOT: "639dec6b-bb19-468b-871c-c5c441c4b0cb",
  POWER_BI: "f8a1db68-be16-40ed-86d5-cb42ce701560",
  TEAMS_PHONE: "e43b5b99-8dfb-405f-9987-dc307f34bcbd",
  VISIO: "c5928f49-12ba-48f7-ada3-0d743a3601d5",
} as const;

const FIRST = [
  "Anna",
  "Ben",
  "Clara",
  "David",
  "Elena",
  "Felix",
  "Greta",
  "Hannes",
  "Ines",
  "Jonas",
  "Katrin",
  "Lukas",
  "Mara",
  "Nico",
  "Olivia",
  "Paul",
  "Rosa",
  "Stefan",
  "Tessa",
  "Yusuf",
];
const LAST = [
  "Bauer",
  "Becker",
  "Fischer",
  "Hoffmann",
  "Keller",
  "Klein",
  "Koch",
  "Krause",
  "Lang",
  "Maier",
  "Neumann",
  "Richter",
  "Schmidt",
  "Schneider",
  "Schulz",
  "Vogel",
  "Wagner",
  "Weber",
  "Wolf",
  "Zimmermann",
];

/** Deterministic demo identity formula, shared with the Adobe demo fixture. */
export const demoUpn = (i: number): string => {
  const first = FIRST[i % FIRST.length]!;
  const last = LAST[(i * 7 + 3) % LAST.length]!;
  return `${first.toLowerCase()}.${last.toLowerCase()}${i}@meridian.example`;
};

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const daysAgo = (now: Date, days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const isoDay = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

/** Deterministic hex pseudo-hash used for concealed report identities. */
const concealedId = (i: number): string =>
  (0x9e3779b9 * (i + 13)).toString(16).padStart(8, "0").repeat(4).slice(0, 32);

type DemoUser = {
  graph: GraphUser;
  lastActivity: Date | null;
  copilotActivity: Date | null;
  hasMailbox: boolean;
};

export type DemoOptions = {
  hasP1?: boolean;
  concealed?: boolean;
  now?: Date;
};

export class DemoGraphClient implements GraphClient {
  private readonly users: DemoUser[];
  private readonly hasP1: boolean;
  private readonly concealed: boolean;
  private readonly now: Date;

  constructor(opts: DemoOptions = {}) {
    this.hasP1 = opts.hasP1 ?? true;
    this.concealed = opts.concealed ?? false;
    this.now = opts.now ?? new Date();
    this.users = buildUsers(this.now);
  }

  getOrganizationName(): Promise<string | null> {
    return Promise.resolve("Meridian Industries GmbH");
  }

  getSubscribedSkus(): Promise<GraphSubscribedSku[]> {
    const assigned = (skuId: string) =>
      this.users.filter((u) =>
        u.graph.assignedLicenses.some((l) => l.skuId === skuId),
      ).length;
    const sku = (
      skuId: string,
      partNumber: string,
      purchased: number,
    ): GraphSubscribedSku => ({
      skuId,
      skuPartNumber: partNumber,
      capabilityStatus: "Enabled",
      consumedUnits: assigned(skuId),
      prepaidUnits: { enabled: purchased, suspended: 0, warning: 0 },
    });
    return Promise.resolve([
      sku(SKU.E3, "SPE_E3", 165),
      sku(SKU.COPILOT, "Microsoft_365_Copilot", 25),
      sku(SKU.POWER_BI, "POWER_BI_PRO", 40),
      sku(SKU.TEAMS_PHONE, "MCOEV", 60),
      sku(SKU.VISIO, "VISIOCLIENT", 10),
    ]);
  }

  /** One paid annual subscription per SKU, renewing on staggered dates. */
  async getSubscriptions(): Promise<GraphSubscription[]> {
    return (await this.getSubscribedSkus()).map((sku, i) => ({
      skuId: sku.skuId,
      skuPartNumber: sku.skuPartNumber,
      status: "Enabled",
      isTrial: false,
      totalLicenses: sku.prepaidUnits.enabled,
      nextLifecycleDateTime: new Date(
        this.now.getTime() + (45 + i * 60) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    }));
  }

  getReportConcealment(): Promise<boolean | null> {
    return Promise.resolve(this.concealed);
  }

  listUsers(opts: { includeSignInActivity: boolean }): Promise<GraphUser[]> {
    if (opts.includeSignInActivity && !this.hasP1) {
      return Promise.reject(new PremiumLicenseRequiredError());
    }
    return Promise.resolve(
      this.users.map((u) => {
        const { signInActivity, ...rest } = u.graph;
        return opts.includeSignInActivity ? { ...rest, signInActivity } : rest;
      }),
    );
  }

  getActiveUserDetail(_period: "D90"): Promise<UsageReportRow[]> {
    return Promise.resolve(
      this.users
        .filter((u) => u.hasMailbox)
        .map((u, i) => ({
          userPrincipalName: this.concealed
            ? concealedId(i)
            : u.graph.userPrincipalName,
          exchangeLastActivityDate: isoDay(u.lastActivity),
          oneDriveLastActivityDate: isoDay(u.lastActivity),
          sharePointLastActivityDate: null,
          teamsLastActivityDate: isoDay(u.lastActivity),
        })),
    );
  }

  getCopilotUsage(_period: "D90"): Promise<CopilotUsageRow[]> {
    return Promise.resolve(
      this.users
        .filter((u) =>
          u.graph.assignedLicenses.some((l) => l.skuId === SKU.COPILOT),
        )
        .map((u, i) => ({
          userPrincipalName: this.concealed
            ? concealedId(1000 + i)
            : u.graph.userPrincipalName,
          lastActivityDate: isoDay(u.copilotActivity),
        })),
    );
  }
}

const buildUsers = (now: Date): DemoUser[] => {
  const rand = mulberry32(42);
  const users: DemoUser[] = [];

  const make = (
    i: number,
    cfg: {
      enabled: boolean;
      userType?: "Member" | "Guest";
      skuIds: string[];
      groupAssigned?: boolean;
      lastActivityDaysAgo: number | null;
      copilotDaysAgo?: number | null;
      createdDaysAgo?: number;
    },
  ): DemoUser => {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7 + 3) % LAST.length]!;
    const upn = demoUpn(i);
    const lastActivity =
      cfg.lastActivityDaysAgo === null
        ? null
        : daysAgo(now, cfg.lastActivityDaysAgo + Math.floor(rand() * 5));
    const copilotActivity =
      cfg.copilotDaysAgo === undefined || cfg.copilotDaysAgo === null
        ? null
        : daysAgo(now, cfg.copilotDaysAgo + Math.floor(rand() * 5));
    return {
      lastActivity,
      copilotActivity,
      hasMailbox: cfg.skuIds.includes(SKU.E3),
      graph: {
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        displayName: `${first} ${last}`,
        userPrincipalName: upn,
        accountEnabled: cfg.enabled,
        userType: cfg.userType ?? "Member",
        createdDateTime: daysAgo(now, cfg.createdDaysAgo ?? 700).toISOString(),
        assignedLicenses: cfg.skuIds.map((skuId) => ({
          skuId,
          disabledPlans: [],
        })),
        licenseAssignmentStates: cfg.skuIds.map((skuId) => ({
          skuId,
          assignedByGroup: cfg.groupAssigned
            ? "11111111-2222-3333-4444-555555555555"
            : null,
          disabledPlans: [],
          state: "Active",
        })),
        signInActivity: {
          lastSignInDateTime: lastActivity?.toISOString() ?? null,
          lastNonInteractiveSignInDateTime: lastActivity?.toISOString() ?? null,
        },
      },
    };
  };

  let i = 0;

  // 120 active members on E3; some hold Copilot, Power BI, Teams Phone, Visio.
  for (; i < 120; i++) {
    const skuIds: string[] = [SKU.E3];
    if (i >= 1 && i <= 22) skuIds.push(SKU.COPILOT);
    if (i >= 30 && i <= 57) skuIds.push(SKU.POWER_BI);
    if (i >= 40 && i <= 94) skuIds.push(SKU.TEAMS_PHONE);
    if (i >= 60 && i <= 63) skuIds.push(SKU.VISIO);
    users.push(
      make(i, {
        enabled: true,
        skuIds,
        groupAssigned: i % 3 === 0,
        lastActivityDaysAgo: Math.floor(rand() * 21),
        // Copilot seats 1-8 are used, 9-22 never opened it: the demo's headline waste.
        copilotDaysAgo: i >= 1 && i <= 8 ? Math.floor(rand() * 14) : null,
      }),
    );
  }

  // 12 members inactive for more than 90 days.
  for (; i < 132; i++) {
    users.push(
      make(i, {
        enabled: true,
        skuIds: [SKU.E3],
        groupAssigned: i % 2 === 0,
        lastActivityDaysAgo: 95 + Math.floor(rand() * 120),
      }),
    );
  }

  // 6 accounts created two months ago that never signed in.
  for (; i < 138; i++) {
    users.push(
      make(i, {
        enabled: true,
        skuIds: [SKU.E3],
        lastActivityDaysAgo: null,
        createdDaysAgo: 60,
      }),
    );
  }

  // 8 disabled accounts still holding licenses (the offboarding leak).
  for (; i < 146; i++) {
    const skuIds: string[] = [SKU.E3];
    if (i <= 141) skuIds.push(SKU.TEAMS_PHONE);
    if (i === 139) skuIds.push(SKU.COPILOT);
    users.push(
      make(i, {
        enabled: false,
        skuIds,
        groupAssigned: i >= 144,
        lastActivityDaysAgo: 120 + Math.floor(rand() * 180),
      }),
    );
  }

  // 3 licensed guest accounts.
  for (; i < 149; i++) {
    users.push(
      make(i, {
        enabled: true,
        userType: "Guest",
        skuIds: [SKU.E3],
        lastActivityDaysAgo: 10 + Math.floor(rand() * 40),
      }),
    );
  }

  // 6 unlicensed members for realism.
  for (; i < 155; i++) {
    users.push(
      make(i, {
        enabled: true,
        skuIds: [],
        lastActivityDaysAgo: Math.floor(rand() * 30),
      }),
    );
  }

  return users;
};
