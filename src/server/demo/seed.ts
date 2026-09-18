import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  findings,
  memberships,
  snapshots,
  syncRuns,
  tenants,
  vendorRenewals,
} from "~/server/db/schema";
import { runSync } from "~/server/sync/runSync";
import { DEMO_EMAIL, DEMO_OID, DEMO_TID } from "./constants";

/**
 * Creates the demo workspace on first demo sign-in and runs the initial sync
 * against the fixture Graph client so the dashboard is populated immediately.
 * Deduplicated per process: layout and page render concurrently in the App
 * Router, and both resolve access (and would both seed) on first load.
 */
let seeding: Promise<void> | null = null;

export const ensureDemoWorkspace = (): Promise<void> => {
  // Successful seeds stay latched for the process lifetime (idempotent checks
  // are cheap but pointless to repeat); failures reset so the next request retries.
  seeding ??= seedDemoWorkspace().catch((err) => {
    seeding = null;
    throw err;
  });
  return seeding;
};

const seedDemoWorkspace = async (): Promise<void> => {
  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.tid, DEMO_TID),
  });

  if (!tenant) {
    // No conflict target: tenants_tid_idx is a partial unique index
    // (WHERE tid IS NOT NULL), which Postgres will not accept as an ON CONFLICT
    // arbiter. A bare DO NOTHING swallows the tid race harmlessly (the only
    // unique column this insert sets), matching scan.ts / csv upload.
    const inserted = await db
      .insert(tenants)
      .values({
        tid: DEMO_TID,
        name: "Meridian Industries GmbH (Demo)",
        isDemo: true,
        consentedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    tenant =
      inserted[0] ??
      (await db.query.tenants.findFirst({ where: eq(tenants.tid, DEMO_TID) }));
  }
  if (!tenant) throw new Error("Failed to create demo tenant");

  const member = await db.query.memberships.findFirst({
    where: eq(memberships.tenantId, tenant.id),
  });
  if (!member) {
    await db
      .insert(memberships)
      .values({
        tenantId: tenant.id,
        oid: DEMO_OID,
        email: DEMO_EMAIL,
        name: "Demo Admin",
        role: "owner",
      })
      .onConflictDoNothing();
  }

  const anyRun = await db.query.syncRuns.findFirst({
    where: eq(syncRuns.tenantId, tenant.id),
  });
  if (!anyRun) {
    await seedDemoHistory(tenant.id);
    await runSync(tenant.id);
  }
  await seedDemoShowcase(tenant.id);
};

/**
 * Read-only demo content for workflows that a Graph sync does not naturally
 * create: verified savings, assigned remediation, and procurement deadlines.
 * Every insert/update is idempotent so it is safe on each demo access.
 */
const seedDemoShowcase = async (tenantId: string): Promise<void> => {
  const owner = await db.query.memberships.findFirst({
    where: eq(memberships.tenantId, tenantId),
  });

  const resolved = await db.query.findings.findFirst({
    where: and(
      eq(findings.tenantId, tenantId),
      eq(findings.dedupeKey, "demo|verified-saving|project-plan"),
    ),
  });
  if (!resolved) {
    await db.insert(findings).values({
      tenantId,
      dedupeKey: "demo|verified-saving|project-plan",
      rule: "inactive_90d",
      title: "Reclaimed inactive Project Plan seat",
      detail: {
        displayName: "Former contractor",
        inactiveDays: 143,
        hint: "License removed and confirmed by the next directory sync.",
      },
      monthlyImpactCents: 2_990,
      status: "resolved",
      remediationStatus: "in_progress",
      assigneeMembershipId: owner?.id ?? null,
      workflowNote: "Validated with the project delivery owner before removal.",
      resolvedAt: new Date(),
    });
  }

  const planned = await db.query.findings.findFirst({
    where: and(eq(findings.tenantId, tenantId), eq(findings.status, "open")),
    orderBy: desc(findings.monthlyImpactCents),
  });
  if (planned?.remediationStatus === "unassigned") {
    const due = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await db
      .update(findings)
      .set({
        remediationStatus: "planned",
        assigneeMembershipId: owner?.id ?? null,
        dueDate: due,
        workflowNote:
          "Confirm the owner and downstream mailbox retention before reclaiming.",
      })
      .where(eq(findings.id, planned.id));
  }

  const existingRenewal = await db.query.vendorRenewals.findFirst({
    where: eq(vendorRenewals.tenantId, tenantId),
  });
  if (!existingRenewal) {
    const dateAfter = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    await db.insert(vendorRenewals).values([
      {
        tenantId,
        vendor: "Microsoft",
        contractName: "Microsoft Customer Agreement",
        renewalDate: dateAfter(74),
        noticeDays: 45,
        annualValueCents: 8_375_880,
        ownerMembershipId: owner?.id ?? null,
        notes: "Review Copilot adoption and shelfware before the true-up.",
      },
      {
        tenantId,
        vendor: "Adobe",
        contractName: "Creative Cloud for teams",
        renewalDate: dateAfter(132),
        noticeDays: 30,
        annualValueCents: 1_248_000,
        ownerMembershipId: owner?.id ?? null,
        notes: "Validate leaver removals with the design operations lead.",
      },
    ]);
  }
};

/**
 * 45 days of synthetic snapshot history so the demo shows the trend chart
 * (a real tenant accumulates these nightly). Waste drifts down, the story
 * the product sells. Deterministic; today's row is overwritten by the sync.
 */
const seedDemoHistory = async (tenantId: string): Promise<void> => {
  const today = new Date();
  const rows = Array.from({ length: 45 }, (_, i) => {
    const day = new Date(today.getTime() - (45 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const wobble = Math.sin(i * 1.7) * 9_000;
    return {
      tenantId,
      day,
      totalMonthlySpendCents: 697_990 + Math.round(Math.sin(i * 0.9) * 12_000),
      totalMonthlyWasteCents: Math.max(
        Math.round(310_000 - i * 1_500 + wobble),
        200_000,
      ),
      purchasedSeats: 300,
      assignedSeats: 263,
      bySku: {},
    };
  });
  await db.insert(snapshots).values(rows).onConflictDoNothing();
};
