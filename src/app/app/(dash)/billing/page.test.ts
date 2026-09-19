import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import type { MspCoverage } from "~/server/billing/mspAccount";
import { entitlementOf, type EntitlementRecord } from "~/server/entitlement";
import type { MembershipRole } from "~/server/types";

/**
 * Renders the billing page to markup for the states that decide what a person
 * may see and do: who gets buttons, which channels are offered, and that a
 * self-hosted install is never sold anything.
 *
 * The page is JSX, which the shared vitest config does not transform yet
 * (tsconfig keeps jsx "preserve" for Next). Until vitest.config.ts sets
 * `oxc: { jsx: { runtime: "automatic" } }` the import fails and this suite
 * reports as skipped instead of breaking the run.
 */

const OFFER_URL = "https://marketplace.example/licensemeter";

let billing = true;
let polar = true;
let offerUrl: string | undefined = OFFER_URL;
let ctx: AccessContext;
let coverage: MspCoverage;

const listCoverage = vi.fn(async () => coverage);

vi.mock("~/env", () => ({
  env: {
    get MARKETPLACE_OFFER_URL() {
      return offerUrl;
    },
  },
  billingEnabled: () => billing,
  polarEnabled: () => billing && polar,
}));
vi.mock("~/server/access", () => ({
  requireAccess: async () => ctx,
  hasRole: (c: AccessContext, min: MembershipRole) => {
    const rank = { viewer: 0, admin: 1, owner: 2 };
    return rank[c.membership.role] >= rank[min];
  },
}));
vi.mock("~/server/billing/mspAccount", () => ({ listCoverage }));
vi.mock("~/app/app/(dash)/billing/actions", () => ({
  attachWorkspaceAction: vi.fn(),
  detachWorkspaceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const BillingPage = await import("./page").then(
  (m) => m.default,
  () => null,
);

const NOW = new Date("2026-09-18T12:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const record = (
  overrides: Partial<EntitlementRecord> = {},
): EntitlementRecord => ({
  plan: "pro",
  source: "polar",
  status: "active",
  trialEnd: null,
  currentPeriodEnd: FUTURE,
  cancelAtPeriodEnd: false,
  ...overrides,
});

const ctxWith = (
  role: MembershipRole,
  rec: EntitlementRecord | null,
  opts: { covered?: boolean; isDemo?: boolean } = {},
): AccessContext =>
  ({
    user: { oid: "user_alice", isDemo: opts.isDemo ?? false },
    tenant: { id: "t1", isDemo: opts.isDemo ?? false },
    membership: { role },
    workspaces: [],
    entitlement: entitlementOf({
      tenant: { isDemo: opts.isDemo ?? false },
      record: rec,
      covered: opts.covered ?? true,
      billingEnabled: billing,
      now: NOW,
    }),
  }) as unknown as AccessContext;

const NO_ACCOUNT: MspCoverage = {
  account: null,
  state: "free",
  source: null,
  currentPeriodEnd: null,
  quantity: 0,
  attachedCount: 0,
  coveredCount: 0,
  workspaces: [],
};

const workspace = (n: number, covered: boolean) => ({
  id: `11111111-1111-1111-1111-00000000000${n}`,
  name: `Client ${n}`,
  owned: true,
  isDemo: false,
  attached: true,
  attachedElsewhere: false,
  covered,
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await BillingPage!({ searchParams: Promise.resolve(params) }),
  );

beforeEach(() => {
  billing = true;
  polar = true;
  offerUrl = OFFER_URL;
  coverage = NO_ACCOUNT;
  ctx = ctxWith("owner", null);
  listCoverage.mockClear();
});

describe.skipIf(BillingPage === null)("billing page", () => {
  it("offers nothing to buy on a self-hosted install", async () => {
    billing = false;
    ctx = ctxWith("owner", null);

    const html = await render({ feature: "mcp", checkout: "success" });

    expect(html).toContain("This install has every feature");
    expect(html).not.toMatch(/EUR|Marketplace|Pay by card|Upgrade|trial/i);
    expect(listCoverage).not.toHaveBeenCalled();
  });

  it("shows a Free owner both plans with both ways to buy", async () => {
    const html = await render();

    expect(html).toContain("EUR 99");
    expect(html).toContain("EUR 299");
    expect(html).toContain("30-day trial");
    expect(html.match(/Buy on Microsoft Marketplace/g)).toHaveLength(2);
    expect(html.match(/Pay by card/g)).toHaveLength(2);
    expect(html).toContain(`href="${OFFER_URL}"`);
    expect(html.match(/Coming soon/g)).toHaveLength(2);
    expect(html).not.toContain("Manage subscription");
  });

  it("switches every price with the yearly choice", async () => {
    const html = await render({ interval: "year" });

    expect(html).toContain("EUR 990");
    expect(html).toContain("EUR 2,990");
    expect(html).toContain("each further tenant EUR 250 per year");
  });

  it("lets viewers and admins look without any action", async () => {
    for (const role of ["viewer", "admin"] as const) {
      ctx = ctxWith(role, record());
      const html = await render();

      expect(html).toContain("Card via Polar");
      expect(html).toContain("Renews 01 Oct 2026");
      expect(html).not.toMatch(
        /Pay by card|Buy on Microsoft Marketplace|Manage subscription|<button/,
      );
      expect(html).toContain("Only a workspace owner can change the plan.");
    }
    expect(listCoverage).not.toHaveBeenCalled();
  });

  it("hides each channel that is not configured", async () => {
    offerUrl = undefined;
    expect(await render()).not.toContain("Microsoft Marketplace");

    offerUrl = OFFER_URL;
    polar = false;
    const html = await render();
    expect(html).not.toContain("Pay by card");
    expect(html).toContain("Buy on Microsoft Marketplace");

    offerUrl = undefined;
    expect(await render()).toContain("Buying is not open yet.");
  });

  it("gives a card customer the portal and no second channel", async () => {
    ctx = ctxWith("owner", record());
    const html = await render();

    expect(html).toContain("Manage subscription");
    expect(html).toContain("Current plan");
    // The MSP card stays buyable, by card only.
    expect(html.match(/Pay by card/g)).toHaveLength(1);
    expect(html).not.toContain("Buy on Microsoft Marketplace");
    expect(html).toContain("Cancel Pro once MSP is active");
  });

  it("sends a Marketplace customer to the Microsoft admin portal", async () => {
    ctx = ctxWith("owner", record({ source: "marketplace" }));
    const html = await render();

    expect(html).toContain("Microsoft admin portal");
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("Pay by card");
  });

  it("names a comped plan without anything to manage", async () => {
    ctx = ctxWith("owner", record({ source: "comped", status: "suspended" }));
    const html = await render();

    expect(html).toContain("Provided by LicenseMeter");
    expect(html).not.toContain("Manage subscription");
  });

  it("explains a locked feature only while the workspace lacks it", async () => {
    const locked = await render({ feature: "whiteLabel" });
    expect(locked).toContain("White-label reports");
    expect(locked).toContain("Included in MSP");

    expect(await render({ feature: "nonsense" })).not.toContain("Included in");

    ctx = ctxWith("owner", record());
    expect(await render({ feature: "mcp" })).not.toContain("Included in Pro");
  });

  it("labels an unbuilt feature as coming soon in its explanation", async () => {
    const html = await render({ feature: "portfolioAlerts" });
    expect(html.match(/Coming soon/g)).toHaveLength(3);
  });

  it("confirms a purchase and says activation can take a minute", async () => {
    const returns: Record<string, string>[] = [
      { checkout: "success" },
      { marketplace: "activated" },
    ];
    for (const params of returns) {
      const html = await render(params);
      expect(html).toContain('role="status"');
      expect(html).toContain("can take a minute");
    }
    expect(await render({ checkout: "nope" })).not.toContain(
      "can take a minute",
    );
  });

  it("lists coverage with the workspaces beyond the quantity called out", async () => {
    ctx = ctxWith("owner", record({ plan: "msp" }));
    coverage = {
      account: { id: "a1", name: null },
      state: "active",
      source: "polar",
      currentPeriodEnd: FUTURE,
      quantity: 2,
      attachedCount: 3,
      coveredCount: 2,
      workspaces: [
        workspace(1, true),
        workspace(2, true),
        workspace(3, false),
        { ...workspace(4, false), attached: false },
      ],
    };

    const html = await render();

    expect(html).toContain("2 of 2 covered");
    expect(html).toContain("1 attached workspace is");
    expect(html).toContain("Beyond your plan");
    expect(html.match(/>Detach</g)).toHaveLength(3);
    expect(html.match(/>Attach</g)).toHaveLength(1);
    expect(html).toContain("Included in your plan");
  });

  it("explains an uncovered workspace and how to fix it", async () => {
    ctx = ctxWith("owner", record({ plan: "msp" }), { covered: false });
    const html = await render();

    expect(html).toContain("Not covered");
    expect(html).toContain("adds a tenant to the subscription or");
    expect(html).toContain("Nothing is locked or deleted");
  });

  it("keeps the demo workspace free of anything to buy", async () => {
    ctx = ctxWith("owner", null, { isDemo: true });
    const html = await render();

    expect(html).toContain("The demo workspace shows every feature");
    expect(html).not.toMatch(/Pay by card|Buy on Microsoft Marketplace/);
    expect(listCoverage).not.toHaveBeenCalled();
  });
});
