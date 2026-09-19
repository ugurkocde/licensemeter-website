import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import type { MembershipRole } from "~/server/types";

/**
 * The server actions behind the attach and detach buttons. The buttons are
 * only drawn for owners, but that is never the enforcement: these tests call
 * the actions the way a forged request would.
 */

let billing = true;
let ctx: AccessContext | null = null;

const attachWorkspace = vi.fn();
const detachWorkspace = vi.fn();
const revalidatePath = vi.fn();

vi.mock("~/env", () => ({ billingEnabled: () => billing }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("~/server/billing/mspAccount", () => ({
  attachWorkspace,
  detachWorkspace,
}));

const RANK: Record<MembershipRole, number> = { viewer: 0, admin: 1, owner: 2 };
// The real rule of apiAccess: null below the minimum role.
vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: MembershipRole) =>
    ctx && RANK[ctx.membership.role] >= RANK[minRole] ? ctx : null,
}));

const { attachWorkspaceAction, detachWorkspaceAction } =
  await import("./actions");

const TENANT = "11111111-1111-1111-1111-000000000002";

const ctxWith = (
  role: MembershipRole,
  demo: { user?: boolean; tenant?: boolean } = {},
) =>
  ({
    user: { oid: "user_alice", isDemo: demo.user ?? false },
    tenant: { id: "11111111-1111-1111-1111-000000000001", isDemo: demo.tenant },
    membership: { role },
  }) as unknown as AccessContext;

beforeEach(() => {
  billing = true;
  ctx = ctxWith("owner");
  vi.clearAllMocks();
  attachWorkspace.mockResolvedValue({ ok: true });
  detachWorkspace.mockResolvedValue({ ok: true });
});

const actions = [
  ["attach", attachWorkspaceAction, attachWorkspace],
  ["detach", detachWorkspaceAction, detachWorkspace],
] as const;

describe.each(actions)("%s action", (_name, action, impl) => {
  it("runs for an owner and refreshes the dashboard", async () => {
    expect(await action(TENANT)).toEqual({ ok: true });
    expect(impl).toHaveBeenCalledWith(ctx, TENANT);
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });

  it("refuses a signed-out caller, a viewer and an admin", async () => {
    for (const caller of [null, ctxWith("viewer"), ctxWith("admin")]) {
      ctx = caller;
      expect(await action(TENANT)).toEqual({ ok: false, error: "Not allowed" });
    }
    expect(impl).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses the demo sign-in and the demo workspace", async () => {
    for (const caller of [
      ctxWith("owner", { user: true }),
      ctxWith("owner", { tenant: true }),
    ]) {
      ctx = caller;
      expect((await action(TENANT)).ok).toBe(false);
    }
    expect(impl).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a workspace id", async () => {
    for (const bad of ["", "1", "../etc", `${TENANT}' or 1=1`, null, {}]) {
      expect(await action(bad as string)).toEqual({
        ok: false,
        error: "Unknown workspace",
      });
    }
    expect(impl).not.toHaveBeenCalled();
  });

  it("does nothing on an install without billing", async () => {
    billing = false;
    expect((await action(TENANT)).ok).toBe(false);
    expect(impl).not.toHaveBeenCalled();
  });
});

describe("refusals from the account rules", () => {
  it("does not reveal whether a workspace exists", async () => {
    attachWorkspace.mockResolvedValueOnce({ ok: false, reason: "notFound" });
    const missing = await attachWorkspaceAction(TENANT);
    attachWorkspace.mockResolvedValueOnce({ ok: false, reason: "notOwner" });
    const notOwner = await attachWorkspaceAction(TENANT);

    expect(missing.ok).toBe(false);
    expect(missing).toEqual(notOwner);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains a workspace held by another MSP account", async () => {
    attachWorkspace.mockResolvedValueOnce({
      ok: false,
      reason: "attachedElsewhere",
    });
    const res = await attachWorkspaceAction(TENANT);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("another MSP account");
  });

  it("reports a detach of a workspace the account does not hold", async () => {
    detachWorkspace.mockResolvedValueOnce({ ok: false, reason: "notAttached" });
    const res = await detachWorkspaceAction(TENANT);
    expect(res).toEqual({
      ok: false,
      error: "This workspace is not attached to your MSP account.",
    });
  });
});
