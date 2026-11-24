import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

const client = new PGlite();
const db = drizzle(client, { schema });
const notifyOps = vi.fn();
vi.mock("~/server/db", () => ({ db }));
vi.mock("~/server/ops", () => ({ notifyOps }));

const {
  createConsentHandoff,
  createSelfConsentState,
  detectConsentStalls,
  HANDOFF_TTL_MS,
} = await import("./consentState");
const now = new Date("2026-11-24T10:00:00Z").getTime();
const minute = 60_000;
const person = {
  oid: "fake-object-id",
  tid: "22222222-2222-2222-2222-00000000000b",
  email: "alex@example.com",
  name: "Alex Rivera",
};

beforeAll(async () => {
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  for (const stmt of ddl) await client.exec(stmt);
});
beforeEach(async () => {
  await db.delete(schema.tenants);
  notifyOps.mockClear();
});
afterAll(async () => client.close());

const workspace = async (
  values: Partial<typeof schema.tenants.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.tenants)
    .values({ name: "Contoso Test", ...values })
    .returning({ id: schema.tenants.id });
  return row!.id;
};

const start = (
  tenantId: string,
  ageMs: number,
  values: Partial<typeof schema.consentStates.$inferInsert> = {},
) =>
  db.insert(schema.consentStates).values({
    state: crypto.randomUUID(),
    tenantId,
    ...person,
    createdAt: new Date(now - ageMs),
    ...values,
  });

it("reports one stall per unconnected workspace and leaves personal details out of the notice", async () => {
  const stalled = await workspace();
  await start(stalled, 91 * minute);
  await start(stalled, 47 * minute);
  await start(await workspace(), 30 * minute);
  await start(await workspace(), HANDOFF_TTL_MS);
  await start(await workspace(), 45 * minute, { usedAt: new Date(now) });
  await start(await workspace({ tid: "bound-tenant" }), 45 * minute);
  await start(await workspace({ isDemo: true }), 45 * minute);
  const connected = await workspace();
  await db
    .insert(schema.msConnections)
    .values({ tenantId: connected, tid: "connected-tenant", mode: "managed" });
  await start(connected, 45 * minute);
  await start(stalled, 45 * minute, {
    state: `handoff.${crypto.randomUUID()}`,
    kind: "handoff",
  });

  expect(await detectConsentStalls(connected, now)).toEqual([]);
  expect(await detectConsentStalls(undefined, now)).toEqual([
    { tenantId: stalled, oldest: new Date(now - 91 * minute) },
  ]);
  expect(notifyOps).toHaveBeenCalledExactlyOnceWith(
    `workspace ${stalled} generated a consent link 91 min ago but no consent arrived`,
    {
      key: `consent-stall:${stalled}`,
      cooldownMs: HANDOFF_TTL_MS,
      logLevel: "info",
    },
  );
});

it("reuses a live handoff when two workspace admins request approval", async () => {
  const tenantId = await workspace();
  await db.insert(schema.memberships).values({
    tenantId,
    oid: person.oid,
    email: person.email,
    role: "owner",
  });
  const links = await Promise.all([
    createConsentHandoff({ tenantId, ...person }),
    createConsentHandoff({ tenantId, ...person, name: "Second admin" }),
  ]);
  expect(links[0]?.state).toMatch(/^handoff\./);
  expect(links[1]?.state).toBe(links[0]?.state);
  expect(links.map((link) => link?.created).sort()).toEqual([false, true]);
  expect(await db.select().from(schema.consentStates)).toHaveLength(1);
  expect(notifyOps).toHaveBeenCalledTimes(1);
});

it("keeps self consent and detection available before the hosted migration", async () => {
  const tenantId = await workspace();
  await db.insert(schema.memberships).values({
    tenantId,
    oid: person.oid,
    email: person.email,
    role: "owner",
  });
  await db.execute(sql`alter table consent_states drop column kind`);
  try {
    await createSelfConsentState({
      state: crypto.randomUUID(),
      tenantId,
      ...person,
    });
    await db.execute(
      sql`update consent_states set created_at = now() - interval '31 minutes'`,
    );
    expect(await detectConsentStalls(tenantId)).toHaveLength(1);
    expect(await createConsentHandoff({ tenantId, ...person })).toBeUndefined();
  } finally {
    const upgrade = await readFile(
      new URL("../../scripts/db-add-consent-state-kind.sql", import.meta.url),
      "utf8",
    );
    await client.exec(upgrade);
    await client.exec(upgrade);
    expect(await db.query.consentStates.findFirst()).toMatchObject({
      kind: "self",
    });
  }
});
