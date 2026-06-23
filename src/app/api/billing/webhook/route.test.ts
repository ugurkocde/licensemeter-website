import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Integration test for the Stripe webhook money-write path (#9).
 *
 * Harness: the handler reads `db`, `stripe()`, `env`, the email senders and
 * `notifyOps` at module scope, so they are all mocked. The DB mock is the heart
 * of the test — it is a REAL Drizzle/PGlite instance (fresh in-memory database
 * per test, seeded by replaying the committed drizzle migration SQL). That
 * makes the dedup insert, the wrapping transaction, the onConflict upserts and
 * the post-failure rollback all execute against genuine Postgres semantics
 * rather than a hand-rolled stub, which is exactly what the money-path contract
 * depends on. Stripe, env, email and ops are stubbed because they are I/O.
 *
 * The route imports `db` as an ESM binding, so the mock exposes a stable proxy
 * that forwards every access to a per-test `currentDb`, swapped in beforeEach.
 */

// --- mutable test state, captured by the vi.mock factories below ------------

let currentDb: ReturnType<typeof makeDb>;
let billingOn = true;
const stripeClient = {
  webhooks: { constructEventAsync: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
};
const planFromPriceIdMock =
  vi.fn<(id: string) => { tier: string; interval: string } | null>();
const notifyOpsMock = vi.fn(() => Promise.resolve());
const sendPaymentFailedMock = vi.fn(() => Promise.resolve());
const sendSubscriptionConfirmedMock = vi.fn(() => Promise.resolve());

vi.mock("~/env", () => ({
  billingEnabled: () => billingOn,
  env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));

vi.mock("~/server/stripe", () => ({
  stripe: () => stripeClient,
  planFromPriceId: (id: string) => planFromPriceIdMock(id),
}));

vi.mock("~/server/ops", () => ({
  notifyOps: (...args: unknown[]) => notifyOpsMock(...(args as [])),
}));

vi.mock("~/server/billingEmail", () => ({
  sendPaymentFailed: (...args: unknown[]) =>
    sendPaymentFailedMock(...(args as [])),
  sendSubscriptionConfirmed: (...args: unknown[]) =>
    sendSubscriptionConfirmedMock(...(args as [])),
}));

// planByTier is only reached for the confirmed-email plan label; keep it simple.
vi.mock("~/lib/plans", () => ({
  planByTier: (tier: string) => ({ name: `Plan ${tier}` }),
}));

// Stable proxy so the route's `import { db }` binding always hits currentDb.
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  );
  return { db: proxy, schema };
});

// --- DB harness --------------------------------------------------------------

/**
 * Generate the live-schema DDL straight from the Drizzle schema (the source of
 * truth — the committed migration SQL lags behind it) and apply it to a fresh
 * in-memory PGlite. Cached once per file: the DDL is identical across tests.
 */
let cachedDdl: string[] | null = null;
async function schemaDdl(): Promise<string[]> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
}

async function seedSchema(client: PGlite): Promise<void> {
  for (const stmt of await schemaDdl()) await client.exec(stmt);
}

function makeDb(client: PGlite) {
  return drizzle(client, { schema });
}

// --- fixtures ----------------------------------------------------------------

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "cus_test_123";
const SUB_ID = "sub_test_123";
const PERIOD_END = 1_900_000_000; // far-future unix seconds

// MSP fixtures: a separate account, customer and subscription so a test can
// prove the tenant and MSP paths never touch each other's rows.
const MSP_ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const MSP_CUSTOMER_ID = "cus_msp_123";
const MSP_SUB_ID = "sub_msp_123";

/** Insert a tenant; overrides patch the defaults. */
async function seedTenant(
  db: ReturnType<typeof makeDb>,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<void> {
  await db
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme", ...overrides });
}

function makeSubscription(
  over: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: SUB_ID,
    customer: CUSTOMER_ID,
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { tenantId: TENANT_ID },
    items: {
      data: [
        {
          price: { id: "price_growth_monthly" },
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

/** Insert an MSP account; overrides patch the defaults. */
async function seedMspAccount(
  db: ReturnType<typeof makeDb>,
  overrides: Partial<typeof schema.mspAccounts.$inferInsert> = {},
): Promise<void> {
  await db
    .insert(schema.mspAccounts)
    .values({ id: MSP_ACCOUNT_ID, name: "Contoso MSP", ...overrides });
}

/**
 * A live Stripe.Subscription carrying an MSP account id in metadata. Unlike the
 * tenant fixture, this has a quantity and a price.recurring.interval (the MSP
 * path mirrors those, not a tier).
 */
function makeMspSubscription(
  over: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: MSP_SUB_ID,
    customer: MSP_CUSTOMER_ID,
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { mspAccountId: MSP_ACCOUNT_ID },
    items: {
      data: [
        {
          price: { id: "price_msp_monthly", recurring: { interval: "month" } },
          current_period_end: PERIOD_END,
          quantity: 3,
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

function makeEvent(over: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_test_1",
    type: "customer.subscription.updated",
    created: 1_800_000_000,
    data: { object: { id: SUB_ID } },
    ...over,
  } as unknown as Stripe.Event;
}

/** Minimal NextRequest-shaped stub: only .headers.get and .text() are used. */
function makeRequest(opts: { signature?: string | null; body?: string } = {}) {
  const { signature = "sig_valid", body = "{}" } = opts;
  return {
    headers: { get: (name: string) => (name === "stripe-signature" ? signature : null) },
    text: () => Promise.resolve(body),
  } as unknown as Parameters<typeof POST>[0];
}

// Imported after the mocks are registered (top-level vi.mock is hoisted).
const { POST } = await import("./route");

// --- helpers to read state ---------------------------------------------------

const getTenant = (db: ReturnType<typeof makeDb>) =>
  db.query.tenants.findFirst({ where: eq(schema.tenants.id, TENANT_ID) });
const getSub = (db: ReturnType<typeof makeDb>) =>
  db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.tenantId, TENANT_ID),
  });
const countEvents = async (db: ReturnType<typeof makeDb>) =>
  (await db.select().from(schema.stripeEvents)).length;
const getMspAccount = (db: ReturnType<typeof makeDb>) =>
  db.query.mspAccounts.findFirst({
    where: eq(schema.mspAccounts.id, MSP_ACCOUNT_ID),
  });

// --- per-test setup ----------------------------------------------------------

beforeEach(async () => {
  billingOn = true;
  const client = new PGlite();
  await seedSchema(client);
  currentDb = makeDb(client);

  stripeClient.webhooks.constructEventAsync.mockReset();
  stripeClient.subscriptions.retrieve.mockReset();
  planFromPriceIdMock.mockReset();
  notifyOpsMock.mockClear();
  sendPaymentFailedMock.mockClear();
  sendSubscriptionConfirmedMock.mockClear();

  // Default happy-path stubs; individual tests override.
  stripeClient.subscriptions.retrieve.mockResolvedValue(makeSubscription());
  planFromPriceIdMock.mockReturnValue({ tier: "growth", interval: "month" });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Configure constructEventAsync to return a crafted event. */
function withEvent(event: Stripe.Event) {
  stripeClient.webhooks.constructEventAsync.mockResolvedValue(event);
}

describe("POST /api/billing/webhook", () => {
  it("billing disabled -> 200 no-op, no DB writes", async () => {
    billingOn = false;
    await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // Nothing touched: no dedup row, no entitlement.
    expect(await countEvents(currentDb)).toBe(0);
    expect((await getTenant(currentDb))?.subscriptionStatus).toBeNull();
    expect(stripeClient.webhooks.constructEventAsync).not.toHaveBeenCalled();
  });

  it("missing stripe-signature header -> 400 no_signature", async () => {
    const res = await POST(makeRequest({ signature: null }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_signature" });
    expect(await countEvents(currentDb)).toBe(0);
  });

  it("bad signature (constructEventAsync throws) -> 400 bad_signature", async () => {
    stripeClient.webhooks.constructEventAsync.mockRejectedValue(
      new Error("no match"),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_signature" });
    expect(await countEvents(currentDb)).toBe(0);
  });

  it("duplicate event id -> dedup no-op, 200, handler not re-run", async () => {
    await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
    // Pre-insert the dedup row so the insert conflicts.
    await currentDb
      .insert(schema.stripeEvents)
      .values({ id: "evt_test_1", type: "customer.subscription.updated" });
    withEvent(makeEvent());

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // Dedup => handleEvent never runs => no subscription retrieve, no entitlement.
    expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(await getSub(currentDb)).toBeUndefined();
    expect((await getTenant(currentDb))?.subscriptionStatus).toBeNull();
    expect(await countEvents(currentDb)).toBe(1);
  });

  it("handler throws -> 500 handler_failed AND dedup row rolled back", async () => {
    await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
    // Force the handler to throw mid-transaction (after the dedup insert).
    stripeClient.subscriptions.retrieve.mockRejectedValue(
      new Error("stripe down"),
    );
    withEvent(makeEvent());

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "handler_failed" });
    // The whole transaction rolled back: the dedup row is gone, so Stripe's
    // retry of the same event id will reprocess it.
    expect(await countEvents(currentDb)).toBe(0);
    expect(await getSub(currentDb)).toBeUndefined();
    expect(notifyOpsMock).toHaveBeenCalled();
  });

  it("customer mismatch -> upsert rejected, no entitlement written", async () => {
    // Tenant bound to a DIFFERENT customer than the event's.
    await seedTenant(currentDb, { stripeCustomerId: "cus_someone_else" });
    withEvent(makeEvent());

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // No subscription row, no entitlement columns written.
    expect(await getSub(currentDb)).toBeUndefined();
    const tenant = await getTenant(currentDb);
    expect(tenant?.subscriptionStatus).toBeNull();
    expect(tenant?.paidUntil).toBeNull();
    // The dedup row is committed (the event WAS processed and rejected cleanly).
    expect(await countEvents(currentDb)).toBe(1);
    expect(notifyOpsMock).toHaveBeenCalled();
  });

  it("unverifiable (null) customer on tenant -> rejected", async () => {
    await seedTenant(currentDb); // stripeCustomerId stays null
    withEvent(makeEvent());

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await getSub(currentDb)).toBeUndefined();
    expect((await getTenant(currentDb))?.subscriptionStatus).toBeNull();
  });

  it("stale event (older than stored lastEventAt) -> no overwrite", async () => {
    await seedTenant(currentDb, {
      stripeCustomerId: CUSTOMER_ID,
      subscriptionStatus: "active",
    });
    const newer = new Date(2_000_000_000 * 1000);
    await currentDb.insert(schema.subscriptions).values({
      tenantId: TENANT_ID,
      stripeSubscriptionId: SUB_ID,
      stripeCustomerId: CUSTOMER_ID,
      stripePriceId: "price_growth_monthly",
      tier: "growth",
      status: "active",
      lastEventAt: newer,
    });
    // Event is OLDER than the stored lastEventAt.
    withEvent(makeEvent({ created: 1_000_000_000 }));
    // The stale event reports a CANCELED state; it must NOT overwrite.
    stripeClient.subscriptions.retrieve.mockResolvedValue(
      makeSubscription({ status: "canceled" }),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const sub = await getSub(currentDb);
    expect(sub?.status).toBe("active"); // unchanged
    expect(sub?.lastEventAt?.getTime()).toBe(newer.getTime());
  });

  it("unmapped price id -> tier stored null (never coerced)", async () => {
    await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
    planFromPriceIdMock.mockReturnValue(null); // unmapped
    stripeClient.subscriptions.retrieve.mockResolvedValue(
      makeSubscription({
        items: {
          data: [
            { price: { id: "price_unknown" }, current_period_end: PERIOD_END },
          ],
        } as unknown as Stripe.Subscription["items"],
      }),
    );
    withEvent(makeEvent());

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const sub = await getSub(currentDb);
    expect(sub).toBeDefined();
    expect(sub?.tier).toBeNull();
    expect(sub?.interval).toBeNull();
    expect(sub?.stripePriceId).toBe("price_unknown");
    // Still entitled (active) even though the tier is unknown.
    expect((await getTenant(currentDb))?.subscriptionStatus).toBe("active");
    expect(notifyOpsMock).toHaveBeenCalled(); // env-gap alert fired
  });

  describe("checkout.session.completed", () => {
    const checkoutEvent = (
      session: Partial<Stripe.Checkout.Session>,
    ): Stripe.Event =>
      makeEvent({
        id: "evt_checkout_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { tenantId: TENANT_ID },
            customer: CUSTOMER_ID,
            subscription: SUB_ID,
            ...session,
          },
        } as unknown as Stripe.Event["data"],
      } as Partial<Stripe.Event>);

    it("binds stripeCustomerId (the only place) + writes entitlement", async () => {
      await seedTenant(currentDb); // customer not yet bound (null)
      stripeClient.subscriptions.retrieve.mockResolvedValue(makeSubscription());
      withEvent(checkoutEvent({}));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      // The customer id is now bound on the tenant.
      const tenant = await getTenant(currentDb);
      expect(tenant?.stripeCustomerId).toBe(CUSTOMER_ID);
      // And, because the binding succeeded, the first upsert wrote entitlement.
      expect(tenant?.subscriptionStatus).toBe("active");
      const sub = await getSub(currentDb);
      expect(sub?.stripeCustomerId).toBe(CUSTOMER_ID);
    });

    it("bind conflict (already bound to another customer) -> returns without writing", async () => {
      await seedTenant(currentDb, { stripeCustomerId: "cus_already_bound" });
      withEvent(checkoutEvent({}));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      // Existing binding is NOT overwritten.
      expect((await getTenant(currentDb))?.stripeCustomerId).toBe(
        "cus_already_bound",
      );
      // No subscription processed (returned before upsert).
      expect(await getSub(currentDb)).toBeUndefined();
      expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(notifyOpsMock).toHaveBeenCalled();
    });
  });

  describe("paidUntil derivation", () => {
    const run = async (status: Stripe.Subscription.Status) => {
      await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeSubscription({ status }),
      );
      withEvent(makeEvent({ id: `evt_${status}` }));
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      return getTenant(currentDb);
    };

    it("active sets the paid horizon", async () => {
      const tenant = await run("active");
      expect(tenant?.subscriptionStatus).toBe("active");
      expect(tenant?.paidUntil?.getTime()).toBe(PERIOD_END * 1000);
    });

    it("trialing sets the paid horizon", async () => {
      const tenant = await run("trialing");
      expect(tenant?.paidUntil?.getTime()).toBe(PERIOD_END * 1000);
    });

    it("past_due keeps the horizon (grace window)", async () => {
      const tenant = await run("past_due");
      expect(tenant?.paidUntil?.getTime()).toBe(PERIOD_END * 1000);
    });

    it("canceled clears the horizon", async () => {
      const tenant = await run("canceled");
      expect(tenant?.subscriptionStatus).toBe("canceled");
      expect(tenant?.paidUntil).toBeNull();
    });
  });

  describe("post-commit emails", () => {
    const invoiceEvent = (over: {
      type: "invoice.paid" | "invoice.payment_failed";
      billing_reason?: string;
    }): Stripe.Event =>
      makeEvent({
        id: `evt_${over.type}`,
        type: over.type,
        data: {
          object: {
            parent: { subscription_details: { subscription: SUB_ID } },
            hosted_invoice_url: "https://invoice.example/i_1",
            billing_reason: over.billing_reason ?? "subscription_cycle",
          },
        } as unknown as Stripe.Event["data"],
      } as Partial<Stripe.Event>);

    it("invoice.payment_failed sends the payment-failed email AFTER commit", async () => {
      await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeSubscription({ status: "past_due" }),
      );
      withEvent(invoiceEvent({ type: "invoice.payment_failed" }));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(sendPaymentFailedMock).toHaveBeenCalledTimes(1);
      // Entitlement was committed before the email fired.
      expect((await getTenant(currentDb))?.subscriptionStatus).toBe("past_due");
    });

    it("invoice.paid on subscription_create sends the confirmation email", async () => {
      await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(makeSubscription());
      withEvent(
        invoiceEvent({
          type: "invoice.paid",
          billing_reason: "subscription_create",
        }),
      );

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(sendSubscriptionConfirmedMock).toHaveBeenCalledTimes(1);
    });
  });

  // --- MSP quantity-subscription path (M5) ----------------------------------
  //
  // An MSP account is billed by one quantity subscription keyed by
  // metadata.mspAccountId. The dispatcher routes any event whose live
  // subscription/session carries that key to the MSP handlers, which mirror the
  // money-path guards onto the mspAccounts row and never touch the tenant tables.
  describe("MSP quantity subscription", () => {
    const subEvent = (over: Partial<Stripe.Event> = {}): Stripe.Event =>
      makeEvent({
        id: "evt_msp_sub_1",
        type: "customer.subscription.updated",
        data: { object: { id: MSP_SUB_ID } } as unknown as Stripe.Event["data"],
        ...over,
      } as Partial<Stripe.Event>);

    const mspCheckoutEvent = (
      session: Partial<Stripe.Checkout.Session>,
    ): Stripe.Event =>
      makeEvent({
        id: "evt_msp_checkout_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { mspAccountId: MSP_ACCOUNT_ID },
            customer: MSP_CUSTOMER_ID,
            subscription: MSP_SUB_ID,
            ...session,
          },
        } as unknown as Stripe.Event["data"],
      } as Partial<Stripe.Event>);

    it("subscription.updated writes the mspAccounts row, tenant tables untouched", async () => {
      await seedMspAccount(currentDb, { stripeCustomerId: MSP_CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription(),
      );
      withEvent(subEvent());

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      expect(account?.subscriptionStatus).toBe("active");
      expect(account?.stripeSubscriptionId).toBe(MSP_SUB_ID);
      expect(account?.stripePriceId).toBe("price_msp_monthly");
      expect(account?.interval).toBe("month"); // from price.recurring.interval
      // quantity is NOT written by the webhook (owned by syncMspQuantity); it
      // stays at the seeded default.
      expect(account?.quantity).toBe(0);
      expect(account?.paidUntil?.getTime()).toBe(PERIOD_END * 1000);
      expect(account?.currentPeriodEnd?.getTime()).toBe(PERIOD_END * 1000);
      // The tenant money path was never entered: no subscriptions row exists.
      expect(await getSub(currentDb)).toBeUndefined();
    });

    it("subscription.created writes the mspAccounts row (created path)", async () => {
      await seedMspAccount(currentDb, { stripeCustomerId: MSP_CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription(),
      );
      withEvent(
        subEvent({ id: "evt_msp_created", type: "customer.subscription.created" }),
      );

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      expect(account?.subscriptionStatus).toBe("active");
      expect(account?.stripeSubscriptionId).toBe(MSP_SUB_ID);
    });

    it("checkout.session.completed binds the customer to the MSP account + first upsert", async () => {
      await seedMspAccount(currentDb); // customer not yet bound (null)
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription(),
      );
      withEvent(mspCheckoutEvent({}));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      expect(account?.stripeCustomerId).toBe(MSP_CUSTOMER_ID);
      // Binding succeeded so the first upsert wrote the subscription state.
      expect(account?.subscriptionStatus).toBe("active");
      expect(account?.quantity).toBe(0); // webhook doesn't write quantity
    });

    it("checkout bind conflict (already bound to another customer) -> rejected, not overwritten", async () => {
      await seedMspAccount(currentDb, {
        stripeCustomerId: "cus_msp_already_bound",
      });
      withEvent(mspCheckoutEvent({}));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      // Existing binding is preserved.
      expect((await getMspAccount(currentDb))?.stripeCustomerId).toBe(
        "cus_msp_already_bound",
      );
      // Returned before processing the subscription: no retrieve, no state.
      expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
      expect((await getMspAccount(currentDb))?.subscriptionStatus).toBeNull();
      expect(notifyOpsMock).toHaveBeenCalled();
    });

    it("customer mismatch (event customer != account customer) -> rejected, no write", async () => {
      // Account bound to a DIFFERENT customer than the event's subscription.
      await seedMspAccount(currentDb, {
        stripeCustomerId: "cus_msp_someone_else",
      });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription(), // customer = MSP_CUSTOMER_ID
      );
      withEvent(subEvent());

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      // No entitlement columns written.
      expect(account?.subscriptionStatus).toBeNull();
      expect(account?.paidUntil).toBeNull();
      expect(account?.stripeSubscriptionId).toBeNull();
      // The dedup row is committed (event processed and rejected cleanly).
      expect(await countEvents(currentDb)).toBe(1);
      expect(notifyOpsMock).toHaveBeenCalled();
    });

    it("unverifiable (null) customer on account -> rejected", async () => {
      await seedMspAccount(currentDb); // stripeCustomerId stays null
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription(),
      );
      withEvent(subEvent());

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect((await getMspAccount(currentDb))?.subscriptionStatus).toBeNull();
    });

    it("stale event (older than stored lastEventAt) -> no overwrite", async () => {
      const newer = new Date(2_000_000_000 * 1000);
      await seedMspAccount(currentDb, {
        stripeCustomerId: MSP_CUSTOMER_ID,
        subscriptionStatus: "active",
        quantity: 3,
        lastEventAt: newer,
      });
      // Event is OLDER than the stored lastEventAt and reports a canceled state.
      withEvent(subEvent({ created: 1_000_000_000 }));
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription({ status: "canceled" }),
      );

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      expect(account?.subscriptionStatus).toBe("active"); // unchanged
      expect(account?.quantity).toBe(3);
      expect(account?.lastEventAt?.getTime()).toBe(newer.getTime());
    });

    it("canceled MSP subscription clears the paid horizon", async () => {
      await seedMspAccount(currentDb, { stripeCustomerId: MSP_CUSTOMER_ID });
      stripeClient.subscriptions.retrieve.mockResolvedValue(
        makeMspSubscription({ status: "canceled" }),
      );
      withEvent(subEvent({ id: "evt_msp_canceled" }));

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const account = await getMspAccount(currentDb);
      expect(account?.subscriptionStatus).toBe("canceled");
      expect(account?.paidUntil).toBeNull();
    });

    // CRITICAL dispatcher-discrimination guard: the tenant and MSP paths are
    // routed solely by the presence of mspAccountId in metadata. These two tests
    // prove neither path ever writes the other's tables (no cross-contamination).
    describe("cross-contamination guard", () => {
      it("a tenant event (tenantId, NO mspAccountId) writes tenant tables and leaves mspAccounts untouched", async () => {
        await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
        await seedMspAccount(currentDb, { stripeCustomerId: MSP_CUSTOMER_ID });
        // Default retrieve stub returns the tenant subscription (metadata.tenantId).
        stripeClient.subscriptions.retrieve.mockResolvedValue(
          makeSubscription(),
        );
        withEvent(makeEvent({ id: "evt_tenant_only" }));

        const res = await POST(makeRequest());

        expect(res.status).toBe(200);
        // Tenant path wrote.
        expect((await getTenant(currentDb))?.subscriptionStatus).toBe("active");
        expect(await getSub(currentDb)).toBeDefined();
        // MSP row is pristine: only the seeded customer binding, no sub state.
        const account = await getMspAccount(currentDb);
        expect(account?.subscriptionStatus).toBeNull();
        expect(account?.stripeSubscriptionId).toBeNull();
        expect(account?.quantity).toBe(0); // schema default, never written
        expect(account?.lastEventAt).toBeNull();
      });

      it("an MSP event (mspAccountId) writes mspAccounts and leaves the tenant tables untouched", async () => {
        await seedTenant(currentDb, { stripeCustomerId: CUSTOMER_ID });
        await seedMspAccount(currentDb, { stripeCustomerId: MSP_CUSTOMER_ID });
        stripeClient.subscriptions.retrieve.mockResolvedValue(
          makeMspSubscription(),
        );
        withEvent(subEvent({ id: "evt_msp_only" }));

        const res = await POST(makeRequest());

        expect(res.status).toBe(200);
        // MSP row wrote.
        const account = await getMspAccount(currentDb);
        expect(account?.subscriptionStatus).toBe("active");
        expect(account?.quantity).toBe(0); // webhook doesn't write quantity
        // Tenant tables are pristine: no subscriptions row, status never set.
        expect(await getSub(currentDb)).toBeUndefined();
        expect((await getTenant(currentDb))?.subscriptionStatus).toBeNull();
        expect((await getTenant(currentDb))?.paidUntil).toBeNull();
      });
    });
  });
});
