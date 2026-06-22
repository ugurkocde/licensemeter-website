/**
 * Phase F backfill: give every existing tenant that has an Entra tid a managed
 * msConnections row, so the connector model is uniform after the Phase C
 * migration. Behaviour is identical with or without these rows
 * (resolveMsCredential already falls back to managed using tenants.tid), so
 * this is purely cleanup — no customer re-consents, nothing changes for them.
 *
 * Idempotent: onConflictDoNothing skips workspaces that already have a row.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-ms-connections.ts
 *
 * Without DATABASE_URL it runs against the local PGlite store (dev/demo).
 */
import { and, isNotNull, isNull, eq } from "drizzle-orm";

import { db } from "../src/server/db";
import { msConnections, tenants } from "../src/server/db/schema";

const main = async () => {
  // Tenants with a tid but no msConnections row yet.
  const rows = await db
    .select({ id: tenants.id, tid: tenants.tid })
    .from(tenants)
    .leftJoin(msConnections, eq(msConnections.tenantId, tenants.id))
    .where(and(isNotNull(tenants.tid), isNull(msConnections.tenantId)));

  if (rows.length === 0) {
    console.log("No tenants need backfilling. Done.");
    return;
  }

  let inserted = 0;
  for (const row of rows) {
    const res = await db
      .insert(msConnections)
      .values({ tenantId: row.id, mode: "managed", tid: row.tid! })
      .onConflictDoNothing();
    // onConflictDoNothing returns rowCount 0 when a concurrent run already
    // inserted the row; only count + log rows we actually wrote.
    const rowCount = (res as { rowCount?: number }).rowCount ?? 1;
    if (rowCount > 0) {
      inserted += rowCount;
      console.log(`  + managed msConnection for tenant ${row.id} (tid ${row.tid})`);
    } else {
      console.log(`  ~ already present, skipped tenant ${row.id}`);
    }
  }

  console.log(`Backfilled ${inserted} managed Microsoft connection(s).`);
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
