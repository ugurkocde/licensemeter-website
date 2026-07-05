/**
 * Welcome-tour backfill: stamp both tour timestamps on every existing
 * membership so the dashboard tour only shows for users who sign up after
 * the tour ships. Run once, after `npm run db:push` has added the
 * welcome_tour_at / data_tour_at columns and before (or right after) the
 * feature deploys.
 *
 * Idempotent: only rows where both timestamps are still NULL are touched,
 * so memberships created post-release (which should see the tour) and
 * users who already interacted with it are left alone.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/backfill-tour-state.ts
 *
 * Without DATABASE_URL it runs against the local PGlite store (dev/demo).
 */
import { and, isNull } from "drizzle-orm";

import { db } from "../src/server/db";
import { memberships } from "../src/server/db/schema";

const main = async () => {
  const now = new Date();
  const res = await db
    .update(memberships)
    .set({ welcomeTourAt: now, dataTourAt: now })
    .where(
      and(isNull(memberships.welcomeTourAt), isNull(memberships.dataTourAt)),
    );

  const rowCount = (res as { rowCount?: number }).rowCount ?? 0;
  console.log(
    rowCount === 0
      ? "No memberships need backfilling. Done."
      : `Marked the tour as seen for ${rowCount} existing membership(s).`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
