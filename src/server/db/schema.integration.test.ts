import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeAll, describe, expect, it } from "vitest";

import * as schema from "./schema";

/**
 * The schema behind scripts/db-audit-posture.sql: every public foreign key
 * needs a covering index, so a parent delete or update never scans the child
 * table. Checked against a database generated from the Drizzle definitions,
 * using the same predicate as the production posture script.
 */

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  for (const stmt of ddl) await client.exec(stmt);
});

describe("schema foreign keys", () => {
  it("covers every foreign key with a valid, ready index", async () => {
    const { rows } = await client.query<{ constraint_name: string }>(`
      select fk.conname as constraint_name
      from pg_constraint fk
      join pg_namespace n on n.oid = fk.connamespace
      where n.nspname = 'public'
        and fk.contype = 'f'
        and not exists (
          select 1
          from pg_index i
          where i.indrelid = fk.conrelid
            and i.indisvalid
            and i.indisready
            and fk.conkey <@ i.indkey::smallint[]
        )
      order by fk.conname
    `);

    expect(rows.map((row) => row.constraint_name)).toEqual([]);
  });
});
