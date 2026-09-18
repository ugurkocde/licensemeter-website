import { describe, expect, it } from "vitest";

import { DemoGraphClient } from "~/server/graph/demoGraph";
import { skuDefaultPriceCents } from "~/server/graph/skuCatalog";
import {
  PremiumLicenseRequiredError,
  type GraphUser,
} from "~/server/graph/types";
import { analyzeWaste } from "~/server/waste/engine";
import { entraIdentitiesOf, joinSignals } from "./join";

const NOW = new Date("2026-06-11T00:00:00Z");
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";

const graphUser = (overrides: Partial<GraphUser>): GraphUser => ({
  id: "g-1",
  displayName: "Jane Doe",
  userPrincipalName: "Jane.Doe@contoso.example",
  accountEnabled: true,
  userType: "Member",
  createdDateTime: "2024-01-01T00:00:00Z",
  assignedLicenses: [{ skuId: E3, disabledPlans: [] }],
  licenseAssignmentStates: null,
  signInActivity: null,
  ...overrides,
});

describe("entraIdentitiesOf", () => {
  it("lists the UPN, mail and every smtp proxy address, lowercased, first writer wins", () => {
    const identities = entraIdentitiesOf([
      graphUser({
        id: "g-1",
        userPrincipalName: "Jane.Doe@contoso.example",
        mail: "jane@contoso.com",
        proxyAddresses: [
          "SMTP:jane@contoso.com",
          "smtp:j.doe@contoso.example",
          "x500:/o=Exchange/ou=Group",
          "smtp:  ",
        ],
      }),
      graphUser({
        id: "g-2",
        displayName: "Second",
        userPrincipalName: "second@contoso.example",
        mail: "JANE@contoso.com",
        accountEnabled: false,
      }),
    ]);
    expect(identities.map((i) => [i.upn, i.graphId])).toEqual([
      ["jane.doe@contoso.example", "g-1"],
      ["jane@contoso.com", "g-1"],
      ["j.doe@contoso.example", "g-1"],
      ["second@contoso.example", "g-2"],
    ]);
    expect(identities[1]).toMatchObject({
      displayName: "Jane Doe",
      accountEnabled: true,
    });
  });

  it("falls back to the UPN alone when mail and proxy addresses are absent", () => {
    expect(entraIdentitiesOf([graphUser({ mail: null })])).toEqual([
      {
        graphId: "g-1",
        upn: "jane.doe@contoso.example",
        displayName: "Jane Doe",
        accountEnabled: true,
      },
    ]);
  });
});

describe("joinSignals", () => {
  it("joins usage rows by UPN case-insensitively and takes the max activity date", () => {
    const result = joinSignals({
      hasP1: true,
      graphUsers: [
        graphUser({
          signInActivity: {
            lastSignInDateTime: "2026-05-01T08:00:00Z",
            lastNonInteractiveSignInDateTime: null,
          },
        }),
      ],
      usageRows: [
        {
          userPrincipalName: "JANE.DOE@CONTOSO.EXAMPLE",
          exchangeLastActivityDate: "2026-06-01",
          oneDriveLastActivityDate: null,
          sharePointLastActivityDate: null,
          teamsLastActivityDate: "2026-04-01",
        },
      ],
      copilotRows: [],
    });

    expect(result.concealed).toBe(false);
    expect(result.activitySignal).toBe("full");
    expect(result.copilotSignal).toBe("none");
    expect(result.users[0]!.lastActivity?.toISOString().slice(0, 10)).toBe(
      "2026-06-01",
    );
  });

  it("keeps per-user signal on concealed tenants that have P1 sign-ins", () => {
    const result = joinSignals({
      hasP1: true,
      graphUsers: [
        graphUser({
          signInActivity: {
            lastSignInDateTime: "2026-06-01T08:00:00Z",
            lastNonInteractiveSignInDateTime: null,
          },
        }),
      ],
      usageRows: [
        {
          userPrincipalName: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
          exchangeLastActivityDate: null,
          oneDriveLastActivityDate: null,
          sharePointLastActivityDate: null,
          teamsLastActivityDate: null,
        },
      ],
      copilotRows: [
        {
          userPrincipalName: "ffeeddccbbaa99887766554433221100",
          lastActivityDate: null,
        },
      ],
    });

    expect(result.concealed).toBe(true);
    expect(result.activitySignal).toBe("full");
    expect(result.copilotSignal).toBe("aggregate");
    expect(result.copilotAggregate).toEqual({
      inactiveCount: 1,
      totalCount: 1,
    });
    expect(result.usageAggregate).toEqual({ inactiveCount: 1, totalCount: 1 });
    // Concealed rows must not leak into per-user activity.
    expect(result.users[0]!.lastActivity?.toISOString().slice(0, 10)).toBe(
      "2026-06-01",
    );
  });

  it("degrades to no activity signal without P1 and without usage rows (role-denied delegated scan)", () => {
    const result = joinSignals({
      hasP1: false,
      graphUsers: [graphUser({})],
      usageRows: [],
      copilotRows: [],
    });
    // "full" here would flag every user as never active despite zero data.
    expect(result.activitySignal).toBe("none");
    expect(result.copilotSignal).toBe("none");
    expect(result.usageAggregate).toBeUndefined();
  });

  it("keeps the full signal without P1 when joinable usage rows exist", () => {
    const result = joinSignals({
      hasP1: false,
      graphUsers: [graphUser({})],
      usageRows: [
        {
          userPrincipalName: "jane.doe@contoso.example",
          exchangeLastActivityDate: "2026-06-01",
          oneDriveLastActivityDate: null,
          sharePointLastActivityDate: null,
          teamsLastActivityDate: null,
        },
      ],
      copilotRows: [],
    });
    expect(result.activitySignal).toBe("full");
  });

  it("degrades to no activity signal without P1 and with concealed reports", () => {
    const result = joinSignals({
      hasP1: false,
      graphUsers: [graphUser({})],
      usageRows: [
        {
          userPrincipalName: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
          exchangeLastActivityDate: null,
          oneDriveLastActivityDate: null,
          sharePointLastActivityDate: null,
          teamsLastActivityDate: null,
        },
      ],
      copilotRows: [],
    });
    expect(result.activitySignal).toBe("none");
  });

  it("does not treat report rows with a plain non-email UPN as concealed", () => {
    const result = joinSignals({
      hasP1: false,
      graphUsers: [graphUser({})],
      usageRows: [
        {
          userPrincipalName: "jane.doe",
          exchangeLastActivityDate: "2026-06-01",
          oneDriveLastActivityDate: null,
          sharePointLastActivityDate: null,
          teamsLastActivityDate: null,
        },
      ],
      copilotRows: [],
    });
    expect(result.concealed).toBe(false);
    expect(result.activitySignal).toBe("full");
  });

  it("prefers licenseAssignmentStates (group info) over assignedLicenses", () => {
    const result = joinSignals({
      hasP1: true,
      graphUsers: [
        graphUser({
          licenseAssignmentStates: [
            {
              skuId: E3,
              assignedByGroup: "group-1",
              disabledPlans: null,
              state: "Active",
            },
          ],
        }),
      ],
      usageRows: [],
      copilotRows: [],
    });
    expect(result.users[0]!.licenses).toEqual([
      {
        skuId: E3,
        assignedByGroup: "group-1",
        disabledPlans: [],
        state: "Active",
      },
    ]);
  });
});

describe("demo tenant end-to-end analysis", () => {
  const runDemo = async () => {
    const client = new DemoGraphClient({ now: NOW });
    const [skus, graphUsers, usageRows, copilotRows] = await Promise.all([
      client.getSubscribedSkus(),
      client.listUsers({ includeSignInActivity: true }),
      client.getActiveUserDetail("D90"),
      client.getCopilotUsage("D90"),
    ]);
    const joined = joinSignals({
      graphUsers,
      usageRows,
      copilotRows,
      hasP1: true,
    });
    const prices = Object.fromEntries(
      skus.map((s) => [s.skuId, skuDefaultPriceCents(s.skuId)]),
    );
    return analyzeWaste({
      users: joined.users,
      skus: skus.map((s) => ({
        skuId: s.skuId,
        skuPartNumber: s.skuPartNumber,
        prepaidEnabled: s.prepaidUnits.enabled,
        consumedUnits: s.consumedUnits,
      })),
      prices,
      now: NOW,
      activitySignal: joined.activitySignal,
      copilotSignal: joined.copilotSignal,
      usageAggregate: joined.usageAggregate,
      copilotAggregate: joined.copilotAggregate,
    });
  };

  it("produces findings for all six rules with positive total impact", async () => {
    const findings = await runDemo();
    const byRule = (rule: string) => findings.filter((f) => f.rule === rule);

    expect(byRule("disabled_account_with_license")).toHaveLength(8);
    expect(byRule("never_active")).toHaveLength(6);
    expect(byRule("inactive_90d")).toHaveLength(12);
    expect(byRule("licensed_guest")).toHaveLength(3);
    expect(byRule("copilot_unused")).toHaveLength(14);
    expect(byRule("shelfware")).toHaveLength(5);

    const total = findings.reduce((s, f) => s + f.monthlyImpactCents, 0);
    expect(total).toBeGreaterThan(100_000); // > 1,000 EUR/month of demo waste
  });

  it("rejects sign-in activity requests when the demo tenant lacks P1", async () => {
    const client = new DemoGraphClient({ hasP1: false, now: NOW });
    await expect(
      client.listUsers({ includeSignInActivity: true }),
    ).rejects.toBeInstanceOf(PremiumLicenseRequiredError);
    await expect(
      client.listUsers({ includeSignInActivity: false }),
    ).resolves.toHaveLength(155);
  });
});
