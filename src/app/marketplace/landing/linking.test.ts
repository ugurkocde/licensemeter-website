import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ownerConflict must consider a plan inherited from the workspace's attached
 * MSP account, not just the workspace's own entitlements row. Before the fix,
 * a covered workspace with no own row was treated as having no plan and a
 * second subscription could be linked.
 */

let ownRows: unknown[] = [];

vi.mock("~/server/entitlementStore", () => ({ loadEntitlement: vi.fn() }));
vi.mock("~/server/billing/mspAccount", () => ({
  getMspAccount: () => Promise.resolve(null),
}));
vi.mock("~/server/db", () => ({
  db: {
    query: { tenants: { findFirst: () => Promise.resolve({ id: "t1" }) } },
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(ownRows) }),
      }),
    }),
  },
}));

const { ownerConflict } = await import("./linking");
const { loadEntitlement } = await import("~/server/entitlementStore");

const resolved = (plan: string) =>
  ({ plan }) as unknown as Awaited<ReturnType<typeof loadEntitlement>>;

beforeEach(() => {
  ownRows = [];
  vi.mocked(loadEntitlement).mockResolvedValue(resolved("free"));
});

describe("ownerConflict", () => {
  it("reports a conflict when the workspace is covered by its MSP account with no own row", async () => {
    vi.mocked(loadEntitlement).mockResolvedValue(resolved("msp"));
    ownRows = [];

    expect(await ownerConflict({ tenantId: "t1" }, "sub_new")).toBe(
      "otherProvider",
    );
  });

  it("still allows re-linking the same Marketplace subscription", async () => {
    vi.mocked(loadEntitlement).mockResolvedValue(resolved("pro"));
    ownRows = [{ source: "marketplace", providerSubscriptionId: "sub_same" }];

    expect(await ownerConflict({ tenantId: "t1" }, "sub_same")).toBeNull();
  });

  it("reports another subscription when a different Marketplace plan grants", async () => {
    vi.mocked(loadEntitlement).mockResolvedValue(resolved("pro"));
    ownRows = [{ source: "marketplace", providerSubscriptionId: "sub_other" }];

    expect(await ownerConflict({ tenantId: "t1" }, "sub_new")).toBe(
      "otherSubscription",
    );
  });
});
