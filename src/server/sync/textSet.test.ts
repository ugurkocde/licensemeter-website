import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { textSet } from "./textSet";

it("prunes against more than 65534 identities using one bind and preserves quoted values", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    const values = Array.from({ length: 70000 }, (_, i) => `user-${i}`);
    values.push("quote'\\value");
    expect(new PgDialect().sqlToQuery(textSet(values)).params).toHaveLength(1);
    const query = sql`select value from (values ('user-69999'), ('stale'), (${"quote'\\value"})) as inventory(value) where value not in ${textSet(values)}`;
    expect((await db.execute(query)).rows).toEqual([{ value: "stale" }]);
    expect(
      (await db.execute(sql`select 1 where 'any' not in ${textSet([])}`)).rows,
    ).toHaveLength(1);
  } finally {
    await client.close();
  }
}, 30000);
