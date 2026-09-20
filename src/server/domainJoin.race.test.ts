import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import * as schema from "~/server/db/schema";
import { createOwnedWorkspace } from "~/server/domainJoin";

/**
 * Domain claims must be serialised across different users, not just across one
 * person's duplicate requests. The per-oid advisory lock does not do that, so
 * createOwnedWorkspace also takes a domain-scoped lock before its holder
 * re-check. This test holds that lock from a second session and asserts a
 * concurrent first sign-in blocks instead of racing past the re-check.
 *
 * Gated on RACE_TEST_DATABASE_URL, a disposable Postgres: it resets the public
 * schema and needs two real sessions, which the default single-connection
 * PGlite suite cannot provide. Without the env var the suite is skipped.
 */
const url = process.env.RACE_TEST_DATABASE_URL;
const describeRace = url ? describe : describe.skip;

describeRace("createOwnedWorkspace domain claim", () => {
  it("waits on a held domain lock and commits a single holder", async () => {
    const app = postgres(url!, { max: 1, onnotice: () => undefined });
    const holder = postgres(url!, { max: 1, onnotice: () => undefined });
    try {
      await app.unsafe(
        "drop schema if exists public cascade; create schema public;",
      );
      const ddl = await generateMigration(
        generateDrizzleJson({}),
        generateDrizzleJson(schema),
      );
      for (const stmt of ddl) await app.unsafe(stmt);
      const db = drizzle(app, { schema });

      const domain = "race.example";
      await holder.unsafe("begin");
      await holder.unsafe(
        "select pg_advisory_xact_lock(hashtextextended('workspace-domain:race.example', 0))",
      );

      const who = {
        oid: "00000000-0000-4000-8000-0000000000a1",
        tid: "tid-a",
        email: `a@${domain}`,
        emailVerified: true,
        name: null,
      };
      const pending = createOwnedWorkspace(db, who, domain);

      const outcome = await Promise.race([
        pending.then(() => "resolved" as const),
        new Promise<"blocked">((resolve) =>
          setTimeout(() => resolve("blocked"), 400),
        ),
      ]);
      expect(outcome).toBe("blocked");

      await holder.unsafe("commit");
      expect((await pending).created).toBe(true);

      const rows = await db
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.domain, domain));
      expect(rows).toHaveLength(1);
    } finally {
      await app.end();
      await holder.end();
    }
  }, 30_000);
});
