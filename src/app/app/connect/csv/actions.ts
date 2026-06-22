"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  requireSession,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "~/server/access";
import { db } from "~/server/db";
import {
  memberships,
  priceBook,
  tenants,
  tenantSkus,
  tenantUsers,
} from "~/server/db/schema";
import {
  detectConcealment,
  mapLicenses,
  parseDirectoryExport,
  parseUsageExport,
  type CsvSku,
  type UsageRow,
} from "~/server/csvTrial";
import { skuDefaultPriceCents } from "~/server/graph/skuCatalog";
import { rateLimit } from "~/server/rateLimit";
import { runAnalysis } from "~/server/sync/runSync";
import type { UserLicense, WorkloadActivity } from "~/server/types";

export type CsvTrialResult = { ok: boolean; error?: string };

const fail = (error: string): CsvTrialResult => ({ ok: false, error });

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Most common UPN domain, the default workspace name. */
const dominantDomain = (upns: string[]): string | null => {
  const counts = new Map<string, number>();
  for (const upn of upns) {
    const domain = upn.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [domain, count] of counts) {
    if (count > bestCount) {
      best = domain;
      bestCount = count;
    }
  }
  return best;
};

/**
 * Zero-consent trial: parse the two admin-center exports, store them in the
 * exact shapes the Graph sync uses (tenants.consentedAt null marks the
 * workspace as a trial), prefill prices and run the rules engine. When an
 * admin later completes the real consent flow, the first sync's
 * upsert-and-prune storage replaces every csv:-prefixed row automatically.
 *
 * No audit entries are written here: the audit helper needs the full
 * AccessContext of an existing workspace, which does not exist before the
 * tenant row is created, and the frozen AuditAction union has no action that
 * truthfully describes a CSV trial import.
 */
export const submitCsvTrial = async (
  formData: FormData,
): Promise<CsvTrialResult> => {
  const session = await requireSession();
  const { oid, tid, upn, name, email } = session.user;
  const workosUserId = session.user.workosUserId;

  // Either provider may run the CSV trial. entra keys the workspace on the
  // signer's Microsoft tenant id (colleagues share one); workos has no Microsoft
  // tenant, so the trial workspace is keyed on the WorkOS user (a personal
  // trial — org sharing arrives later with WorkOS organizations).
  if (!oid && !workosUserId) {
    return fail("Please sign in again to start a CSV trial.");
  }

  // --- Input guards (order: session, sizes, rate limit, parse) ------------
  const directoryFile = formData.get("directory");
  if (!(directoryFile instanceof File) || directoryFile.size === 0) {
    return fail("Please choose the user export file (Users > Active users > Export users).");
  }
  const usageFile = formData.get("usage");
  const hasUsage = usageFile instanceof File && usageFile.size > 0;
  if (directoryFile.size > MAX_FILE_BYTES || (hasUsage && usageFile.size > MAX_FILE_BYTES)) {
    return fail("Each file must be 5 MB or smaller.");
  }

  // Keyed by organization (entra tenant) or by user (workos): one uploader gets
  // 10 uploads per hour either way.
  const rlKey = tid ? `csvtrial:${tid}` : `csvtrial:ws:${workosUserId}`;
  if (!rateLimit(rlKey, 10, 60 * 60 * 1000)) {
    return fail("Too many uploads for your organization. Please try again later.");
  }

  const directoryParsed = parseDirectoryExport(await directoryFile.text());
  if (!directoryParsed.ok) return fail(directoryParsed.error);
  const directoryRows = directoryParsed.rows;
  if (directoryRows.length === 0) {
    return fail("The user export contains no users.");
  }

  let usageRows: UsageRow[] = [];
  if (hasUsage) {
    const usageParsed = parseUsageExport(await usageFile.text());
    if (!usageParsed.ok) return fail(usageParsed.error);
    usageRows = usageParsed.rows;
    if (detectConcealment(directoryRows, usageRows)) {
      return fail(
        "The usage report does not join to your users: report identities are " +
          "concealed. In the Microsoft 365 admin center, turn off Reports > " +
          "Settings > display concealed names, re-export, and upload again " +
          "(or leave the usage file out).",
      );
    }
  }

  const orgNameRaw = formData.get("orgName");
  const typedName =
    typeof orgNameRaw === "string" ? orgNameRaw.trim().slice(0, 200) : "";

  // --- Tenant resolution --------------------------------------------------
  // The owner membership is matched/created by whichever identity the session
  // carries. entra resolves the workspace by Microsoft tenant id (shared across
  // colleagues); workos has none, so it resolves this user's own non-consented
  // trial workspace, or creates a fresh tid-less one.
  const matchActor = oid
    ? eq(memberships.oid, oid)
    : eq(memberships.workosUserId, workosUserId!);
  const existing = tid
    ? await db.query.tenants.findFirst({ where: eq(tenants.tid, tid) })
    : (
        await db
          .select({ tenant: tenants })
          .from(memberships)
          .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
          .where(and(matchActor, isNull(tenants.consentedAt)))
          .limit(1)
      )[0]?.tenant;

  // Typed name wins; a re-upload without one keeps the current name; new
  // workspaces default to the dominant UPN domain of the export.
  const orgName =
    typedName !== ""
      ? typedName
      : (existing?.name ??
        dominantDomain(directoryRows.map((r) => r.upn)) ??
        "CSV trial workspace");

  let tenantId: string;
  if (existing) {
    if (existing.isDemo) {
      return fail("The CSV trial is not available for the demo workspace.");
    }
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.tenantId, existing.id), matchActor),
    });
    if (existing.consentedAt) {
      return fail(
        membership
          ? "Your organization already has a connected workspace. Open it from the workspace switcher."
          : "Your organization already has a connected workspace. Ask an admin there for an invite.",
      );
    }
    if (!membership) {
      return fail(
        "A trial workspace for your organization already exists. Ask the colleague who created it for an invite.",
      );
    }
    // Replacing the stored data is destructive, so viewers may not re-upload;
    // first-time creation below still makes the uploader the owner.
    if (membership.role !== "owner" && membership.role !== "admin") {
      return fail(
        "Your role in this workspace is view only. Ask a workspace admin to refresh the data.",
      );
    }
    tenantId = existing.id;
    // Replace the previous upload: in a trial workspace every stored user and
    // SKU row came from CSV, so clearing both tables (price book untouched,
    // edited prices survive) and repopulating is exact.
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
    await db.delete(tenantSkus).where(eq(tenantSkus.tenantId, tenantId));
  } else {
    // Create the workspace and its owner membership together. onConflictDoNothing
    // guards the entra race (two colleagues, same tid); workos rows have a null
    // tid (partial-unique index ignores nulls) and never collide.
    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(tenants)
        .values({
          tid: tid ?? null,
          name: orgName,
          consentedAt: null,
          // Trial clock starts the moment the workspace is created.
          trialStartedAt: new Date(),
          concealedNames: false,
          hasP1: false,
          activitySignal: hasUsage ? "full" : "none",
          copilotSignal: "none",
        })
        .onConflictDoNothing()
        .returning({ id: tenants.id });
      if (!inserted) return null;
      await tx
        .insert(memberships)
        .values({
          tenantId: inserted.id,
          oid: oid ?? null,
          workosUserId: workosUserId ?? null,
          email: email ?? upn,
          name: name || null,
          role: "owner",
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.email],
          set: oid
            ? { oid, role: "owner" }
            : { workosUserId: workosUserId!, role: "owner" },
        });
      return inserted.id;
    });
    if (!created) {
      return fail(
        "Someone in your organization created this workspace just now. Ask them for an invite.",
      );
    }
    tenantId = created;
  }

  // --- Build the stored shapes --------------------------------------------
  const now = new Date();
  const usageByUpn = new Map(usageRows.map((r) => [r.upn.toLowerCase(), r]));
  const skusById = new Map<string, CsvSku & { count: number }>();
  const emptyWorkloads: WorkloadActivity = {
    exchange: null,
    oneDrive: null,
    sharePoint: null,
    teams: null,
    copilot: null,
  };

  const seenUpns = new Set<string>();
  const userRows: {
    graphId: string;
    upn: string;
    displayName: string | null;
    accountEnabled: boolean;
    lastActivity: Date | null;
    workloadActivity: WorkloadActivity;
    licenses: UserLicense[];
  }[] = [];
  for (const row of directoryRows) {
    const upnKey = row.upn.toLowerCase();
    if (seenUpns.has(upnKey)) continue;
    seenUpns.add(upnKey);
    const { licenses, skus } = mapLicenses(row.licenseNames);
    for (const sku of skus) {
      const tally = skusById.get(sku.skuId);
      if (tally) tally.count += 1;
      else skusById.set(sku.skuId, { ...sku, count: 1 });
    }
    const usage = usageByUpn.get(upnKey);
    userRows.push({
      graphId: `csv:${upnKey}`,
      upn: row.upn,
      displayName: row.displayName,
      accountEnabled: row.accountEnabled,
      lastActivity: usage?.lastActivity ?? null,
      workloadActivity: usage?.workloadActivity ?? emptyWorkloads,
      licenses,
    });
  }

  // --- Persist (same upsert shapes as the Graph sync) ---------------------
  const skuRows = [...skusById.values()];
  if (skuRows.length > 0) {
    await db
      .insert(tenantSkus)
      .values(
        skuRows.map((s) => ({
          tenantId,
          skuId: s.skuId,
          skuPartNumber: s.partNumber,
          displayName: s.displayName,
          // No purchased-seat data in the exports: purchased = assigned, so
          // the shelfware rule stays silent instead of guessing.
          prepaidEnabled: s.count,
          prepaidSuspended: 0,
          prepaidWarning: 0,
          consumedUnits: s.count,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [tenantSkus.tenantId, tenantSkus.skuId],
        set: {
          skuPartNumber: sql`excluded.sku_part_number`,
          displayName: sql`excluded.display_name`,
          prepaidEnabled: sql`excluded.prepaid_enabled`,
          consumedUnits: sql`excluded.consumed_units`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  for (const batch of chunk(userRows, 250)) {
    await db
      .insert(tenantUsers)
      .values(
        batch.map((u) => ({
          tenantId,
          graphId: u.graphId,
          upn: u.upn,
          displayName: u.displayName,
          accountEnabled: u.accountEnabled,
          userType: null,
          createdDateTime: null,
          lastInteractiveSignIn: null,
          lastNonInteractiveSignIn: null,
          lastActivity: u.lastActivity,
          workloadActivity: u.workloadActivity,
          licenses: u.licenses,
          syncedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [tenantUsers.tenantId, tenantUsers.graphId],
        set: {
          upn: sql`excluded.upn`,
          displayName: sql`excluded.display_name`,
          accountEnabled: sql`excluded.account_enabled`,
          lastActivity: sql`excluded.last_activity`,
          workloadActivity: sql`excluded.workload_activity`,
          licenses: sql`excluded.licenses`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  // Prefill missing price book rows from the static catalog (mirrors the
  // sync's prefill); synthetic csv: SKUs default to 0 until edited.
  const existingPrices = await db.query.priceBook.findMany({
    where: eq(priceBook.tenantId, tenantId),
  });
  const known = new Set(existingPrices.map((p) => p.skuId));
  const missing = skuRows.filter((s) => !known.has(s.skuId));
  if (missing.length > 0) {
    await db
      .insert(priceBook)
      .values(
        missing.map((s) => ({
          tenantId,
          skuId: s.skuId,
          monthlyPriceCents: skuDefaultPriceCents(s.skuId),
          source: "default" as const,
        })),
      )
      .onConflictDoNothing();
  }

  // Refresh the signal columns on every upload (a usage file may be added or
  // dropped between uploads). runAnalysis reads them from the tenant row.
  await db
    .update(tenants)
    .set({
      name: orgName,
      concealedNames: false,
      hasP1: false,
      activitySignal: hasUsage ? "full" : "none",
      copilotSignal: "none",
      usageAggregate: null,
      copilotAggregate: null,
      // Start the trial on first connect; coalesce so a re-upload never resets it
      // (and stamps it when reusing the auto-provisioned, never-connected workspace).
      trialStartedAt: sql`coalesce(${tenants.trialStartedAt}, now())`,
    })
    .where(eq(tenants.id, tenantId));

  await runAnalysis(tenantId);

  (await cookies()).set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());
  redirect("/app");
};
