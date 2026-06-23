import { and, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { siteUrl } from "~/env";
import { fmtMoney, workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import {
  aiSpendDaily,
  findings,
  memberships,
  snapshots,
  syncRuns,
  tenants,
} from "~/server/db/schema";
import {
  computeAiSpendDelta,
  computeDigestDelta,
  daysUntilRenewal,
  DELTA_WINDOW_MS,
  renewalPhrase,
} from "~/server/digestDelta";
import {
  allClearHtml,
  digestHtml,
  emailEnabled,
  sendEmail,
} from "~/server/email";
import { notifyOps } from "~/server/ops";
import { requireCronAuth } from "~/server/cronAuth";

export const maxDuration = 300;

/** Only syncs this fresh keep a zero-findings tenant in the all-clear loop. */
const RECENT_SYNC_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Weekly digest to workspace owners/admins. No-op until Resend is configured.
 * Leads with the 7-day delta; tenants with zero open findings get a short
 * all-clear instead of silence (silence right after everything is fixed reads
 * like the product stopped working, a churn signal).
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }

  const allTenants = await db.query.tenants.findMany({
    where: eq(tenants.isDemo, false),
  });
  const now = new Date();
  // Covers both 7-day buckets of computeAiSpendDelta; UTC-pinned like the
  // yyyy-mm-dd day column it is compared against.
  const aiSpendSince = new Date(now.getTime() - 2 * DELTA_WINDOW_MS)
    .toISOString()
    .slice(0, 10);
  let sent = 0;

  for (const tenant of allTenants) {
    try {
      const [admins, open, resolvedRecent, latest, aiSpendRows] =
        await Promise.all([
          db.query.memberships.findMany({
            where: and(
              eq(memberships.tenantId, tenant.id),
              inArray(memberships.role, ["owner", "admin"]),
              // Claimed via either provider (entra oid / workos workosUserId);
              // pending invites have neither and are excluded.
              or(
                isNotNull(memberships.oid),
                isNotNull(memberships.workosUserId),
              ),
            ),
          }),
          db.query.findings.findMany({
            where: and(
              eq(findings.tenantId, tenant.id),
              inArray(findings.status, ["open", "acknowledged"]),
            ),
            orderBy: desc(findings.monthlyImpactCents),
          }),
          db.query.findings.findMany({
            where: and(
              eq(findings.tenantId, tenant.id),
              // status filter keeps this disjoint from the open/acknowledged
              // query above: a reopened finding can carry a stale resolvedAt.
              eq(findings.status, "resolved"),
              isNotNull(findings.resolvedAt),
              gte(
                findings.resolvedAt,
                new Date(now.getTime() - DELTA_WINDOW_MS),
              ),
            ),
          }),
          db.query.snapshots.findFirst({
            where: eq(snapshots.tenantId, tenant.id),
            orderBy: desc(snapshots.day),
          }),
          db.query.aiSpendDaily.findMany({
            where: and(
              eq(aiSpendDaily.tenantId, tenant.id),
              gte(aiSpendDaily.day, aiSpendSince),
            ),
            columns: { day: true, amountCents: true },
          }),
        ]);

      const to = admins.map((m) => m.email).filter(Boolean);
      if (to.length === 0) continue;

      const delta = computeDigestDelta([...open, ...resolvedRecent], now);
      const renewalDays = daysUntilRenewal(tenant.renewalDate, now);
      // AI API spend is metered in USD by the providers and never converted,
      // so the line is formatted in USD regardless of the workspace currency.
      let aiSpendLine: string | undefined;
      if (aiSpendRows.length > 0) {
        const { last7Cents, prior7Cents } = computeAiSpendDelta(
          aiSpendRows,
          now,
        );
        const diff = last7Cents - prior7Cents;
        const vsPrior =
          prior7Cents > 0
            ? ` (${diff >= 0 ? "+" : "-"}${fmtMoney(Math.abs(diff), "USD")} vs prior week)`
            : "";
        aiSpendLine = `AI API spend last 7 days: ${fmtMoney(last7Cents, "USD")}${vsPrior}, billed in USD.`;
      }
      const tenantLabel = tenant.name ?? "your tenant";
      const tenantName = workspaceLabel(tenant);

      if (open.length === 0) {
        // All clear, but only for tenants that actually synced recently.
        // A stale tenant with no data would get a hollow "all clear" forever.
        const recentSync = await db.query.syncRuns.findFirst({
          where: and(
            eq(syncRuns.tenantId, tenant.id),
            // "partial" counts: connector hiccups still leave the M365 data
            // fresh, and a flaky connector must not mute the all-clear forever.
            inArray(syncRuns.status, ["success", "partial"]),
            isNotNull(syncRuns.finishedAt),
            gte(syncRuns.finishedAt, new Date(now.getTime() - RECENT_SYNC_MS)),
          ),
        });
        if (!recentSync) continue;

        await sendEmail({
          to,
          subject: `LicenseMeter: all clear in ${tenantLabel}`,
          html: allClearHtml({
            tenantName,
            resolvedCount: delta.resolvedCount,
            resolvedImpact: fmtMoney(delta.resolvedCents, tenant.currency),
            renewalLine:
              renewalDays === null
                ? undefined
                : `${renewalPhrase(renewalDays)}. You go in clean.`,
            aiSpendLine,
            appUrl: siteUrl(),
          }),
        });
        sent++;
        continue;
      }

      const wasteCents = latest?.totalMonthlyWasteCents ?? 0;
      const openCents = open.reduce((s, f) => s + f.monthlyImpactCents, 0);
      // New findings lead the subject; otherwise fall back to the standing
      // totals. With unpriced SKUs the waste is 0. Lead with the findings
      // count instead of an underwhelming zero.
      const subject =
        delta.newCount > 0
          ? `LicenseMeter: ${delta.newCount} new finding${delta.newCount === 1 ? "" : "s"}, +${fmtMoney(delta.newCents, tenant.currency)}/mo in ${tenantLabel}`
          : wasteCents > 0
            ? `LicenseMeter: ${fmtMoney(wasteCents, tenant.currency)}/mo wasted in ${tenantLabel}`
            : `LicenseMeter: ${open.length} open findings in ${tenantLabel}`;

      await sendEmail({
        to,
        subject,
        html: digestHtml({
          tenantName,
          currency: tenant.currency,
          monthlySpend: fmtMoney(
            latest?.totalMonthlySpendCents ?? 0,
            tenant.currency,
          ),
          monthlyWaste: fmtMoney(
            latest?.totalMonthlyWasteCents ?? 0,
            tenant.currency,
          ),
          openFindings: open.length,
          topFindings: open.slice(0, 5).map((f) => ({
            title: f.title,
            impact: fmtMoney(f.monthlyImpactCents, tenant.currency),
          })),
          delta: {
            newCount: delta.newCount,
            newImpact: fmtMoney(delta.newCents, tenant.currency),
            resolvedCount: delta.resolvedCount,
            resolvedImpact: fmtMoney(delta.resolvedCents, tenant.currency),
          },
          renewalLine:
            renewalDays === null
              ? undefined
              : `${renewalPhrase(renewalDays)}, with ${open.length} open finding${open.length === 1 ? "" : "s"} worth ${fmtMoney(openCents, tenant.currency)}/mo to reclaim before you re-commit.`,
          aiSpendLine,
          appUrl: siteUrl(),
        }),
      });
      sent++;
    } catch (err) {
      void notifyOps(
        `digest failed for tenant ${workspaceLabel(tenant)}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `digest:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  }

  return NextResponse.json({ tenants: allTenants.length, sent });
};
