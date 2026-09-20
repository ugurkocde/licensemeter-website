import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * Who may change the shared notification address. The real guards of
 * ~/server/actions run against a real database; only the access layer and the
 * Resend call are fixtures.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: { role: "viewer" | "admin" | "owner"; isDemo: boolean };

type SendArgs = { to: string[]; subject: string; html: string };
const sendEmailMock = vi.fn((_args: SendArgs) => Promise.resolve(true));

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  ),
  schema,
}));

vi.mock("~/server/email", async (original) => ({
  ...(await original<typeof EmailModule>()),
  emailEnabled: () => true,
  sendEmail: (args: SendArgs) => sendEmailMock(args),
}));

// The currency action's server-only ECB client is outside this suite.
vi.mock("~/server/exchangeRates", () => ({
  fetchEcbReferenceRates: vi.fn(() =>
    Promise.resolve({ asOf: "2026-07-09", perEur: { EUR: 1 } }),
  ),
}));

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole]
      ? ({
          user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
          tenant: { ...tenant, isDemo: member.isDemo },
          membership: { id: "m1", role: member.role, email: "a@a.example" },
          workspaces: [],
        } as unknown as AccessContext)
      : null,
}));

const {
  removeNotificationAddress,
  requestNotificationAddress,
  resendNotificationAddress,
  setNotificationAddressPreference,
} = await import("~/server/actions");

const SHARED = "it-licenses@contoso.test";

const form = (email: string) => {
  const data = new FormData();
  data.set("email", email);
  return data;
};

const row = () =>
  currentDb.query.notificationAddresses.findFirst({
    where: eq(schema.notificationAddresses.tenantId, tenant.id),
  });

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1);
  member = { role: "admin", isDemo: false };
  sendEmailMock.mockClear();
});

describe("requestNotificationAddress", () => {
  it("stores the trimmed, lowercased address and mails the link", async () => {
    expect(
      await requestNotificationAddress(form(" IT-Licenses@Contoso.TEST ")),
    ).toEqual({
      ok: true,
    });

    expect(await row()).toMatchObject({ pendingEmail: SHARED, email: null });
    expect(sendEmailMock.mock.calls[0]?.[0].to).toEqual([SHARED]);
    const [entry] = await currentDb.query.auditLog.findMany();
    expect(entry).toMatchObject({
      action: "notification_address_requested",
      detail: { email: SHARED },
    });
  });

  it("refuses an address that is not an address", async () => {
    const res = await requestNotificationAddress(form("not an address"));
    expect(res.ok).toBe(false);
    expect(await row()).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("stops after five confirmation emails a day", async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        (await requestNotificationAddress(form(`shared${i}@contoso.test`))).ok,
      ).toBe(true);
    }
    const sixth = await requestNotificationAddress(form(SHARED));
    expect(sixth.ok).toBe(false);
    expect(sendEmailMock).toHaveBeenCalledTimes(5);
  });
});

describe("the other shared-address actions", () => {
  it("resends the pending link and removes the address again", async () => {
    await requestNotificationAddress(form(SHARED));
    expect(await resendNotificationAddress()).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);

    expect(await removeNotificationAddress()).toEqual({ ok: true });
    expect(await row()).toBeUndefined();
    // Nothing to resend once the address is gone.
    expect((await resendNotificationAddress()).ok).toBe(false);
  });

  it("changes one switch at a time", async () => {
    await requestNotificationAddress(form(SHARED));

    expect(await setNotificationAddressPreference("leak", false)).toEqual({
      ok: true,
    });
    expect(await row()).toMatchObject({
      leakAlerts: false,
      digest: true,
      report: true,
    });
    expect(
      (await setNotificationAddressPreference("welcome" as never, false)).ok,
    ).toBe(false);
  });
});

describe("who may change it", () => {
  const attempts = async () => [
    await requestNotificationAddress(form(SHARED)),
    await resendNotificationAddress(),
    await removeNotificationAddress(),
    await setNotificationAddressPreference("digest", false),
  ];

  it("refuses a viewer", async () => {
    member = { role: "viewer", isDemo: false };

    for (const res of await attempts()) {
      expect(res).toEqual({ ok: false, error: "Not allowed" });
    }
    expect(await row()).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("refuses an admin of the demo workspace", async () => {
    member = { role: "admin", isDemo: true };

    for (const res of await attempts()) {
      expect(res.ok).toBe(false);
      expect(res.error).toContain("demo workspace is read-only");
    }
    expect(await row()).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
