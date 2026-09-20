import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "./index";
import * as schema from "./schema";
import { createTenantDb, withTenant } from "./tenant";

/**
 * Proves the tenant-context mechanism end to end against real Postgres
 * semantics (PGlite): with a tenant RLS policy in place and a non-owner role,
 * queries inside withTenant see only that tenant's rows, queries outside see
 * none, and a cross-tenant write is rejected by the policy's WITH CHECK.
 */

const TENANT_A = "11111111-1111-1111-1111-00000000000a";
const TENANT_B = "11111111-1111-1111-1111-00000000000b";

let db: Db;

beforeEach(async () => {
  const client = new PGlite();
  await client.exec(`
    create role app nologin;
    create table items (id int primary key, tenant_id uuid not null, label text);
    insert into items values (1, '${TENANT_A}', 'a-row'), (2, '${TENANT_B}', 'b-row');
    alter table items enable row level security;
    create policy tenant_isolation on items for all to app
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
    grant select, insert, update, delete on items to app;
    set role app;
  `);
  db = createTenantDb(drizzle(client, { schema })) as unknown as Db;
});

const ids = async (): Promise<number[]> => {
  const result = (await db.execute(
    sql`select id from items order by id`,
  )) as unknown as { rows: { id: number }[] };
  return result.rows.map((r) => r.id);
};

describe("tenant-scoped database context", () => {
  it("shows only the active tenant's rows inside withTenant", async () => {
    expect(await withTenant(db, TENANT_A, ids)).toEqual([1]);
    expect(await withTenant(db, TENANT_B, ids)).toEqual([2]);
  });

  it("shows no rows outside a tenant context, so a missed wrapper fails closed", async () => {
    expect(await ids()).toEqual([]);
  });

  it("rejects a write that targets another tenant", async () => {
    await expect(
      withTenant(db, TENANT_A, () =>
        db.execute(
          sql`insert into items (id, tenant_id, label) values (3, ${TENANT_B}, 'cross')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("allows a write to the active tenant", async () => {
    await withTenant(db, TENANT_A, () =>
      db.execute(
        sql`insert into items (id, tenant_id, label) values (4, ${TENANT_A}, 'own')`,
      ),
    );
    expect(await withTenant(db, TENANT_A, ids)).toEqual([1, 4]);
  });
});
