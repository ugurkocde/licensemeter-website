import "server-only";

import { getBranding } from "~/server/billing/branding";
import { db } from "~/server/db";
import { withTenant } from "~/server/db/tenant";
import { hasFeature } from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import type { ReportBranding } from "~/server/report/brandStyle";
import { loadExecutiveSummary } from "~/server/report/executiveData";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";
import {
  findActiveShareLink,
  recordShareView,
} from "~/server/report/shareLinks";
import type { ShareLinkMode } from "~/server/types";

/**
 * What a public share link shows: the executive summary (which holds no user
 * identifiers by construction) and the report's marks. The public page and
 * the public PDF route both read it through here, so both apply the same
 * rate limit, the same plan rule for live links, and the same single
 * not-found answer.
 */

export type PublicReport = {
  mode: ShareLinkMode;
  summary: ExecutiveSummary;
  branding: ReportBranding | null;
  expiresAt: Date;
};

export type PublicReportResult =
  | { kind: "ok"; report: PublicReport }
  /** Unknown, malformed, revoked, expired, demo, or a live link off-plan. */
  | { kind: "notFound" }
  | { kind: "rateLimited" };

/** Per client IP. A real reader opens a report a few times, not hundreds. */
export const PUBLIC_LIMITS = {
  view: { max: 60, windowMs: 10 * 60 * 1000 },
  pdf: { max: 10, windowMs: 10 * 60 * 1000 },
} as const;

export const loadPublicReport = async (
  token: string,
  headerStore: { get(name: string): string | null },
  purpose: keyof typeof PUBLIC_LIMITS,
  now: Date = new Date(),
): Promise<PublicReportResult> => {
  // The limit is checked before the lookup, so hitting it says nothing about
  // whether the token exists.
  const limit = PUBLIC_LIMITS[purpose];
  const allowed = await rateLimitDurable(
    `share-${purpose}:${clientIp(headerStore)}`,
    limit.max,
    limit.windowMs,
    // No limiter, no public report: fail closed.
    "deny",
  );
  if (!allowed) return { kind: "rateLimited" };

  const active = await findActiveShareLink(token, now);
  if (!active) return { kind: "notFound" };
  const { link, tenant, snapshot } = active;

  let report: PublicReport;
  if (snapshot) {
    // Frozen at creation: shown as it was, whatever the plan is today.
    report = {
      mode: "snapshot",
      summary: snapshot.summary,
      branding: snapshot.branding,
      expiresAt: link.expiresAt,
    };
  } else {
    // Live data is a Pro feature at view time: after a cancellation or
    // downgrade a live link reads exactly like an unknown one.
    const entitlement = await loadEntitlement(tenant, now);
    if (!hasFeature(entitlement, "execReport")) return { kind: "notFound" };
    const [summary, branding] = await withTenant(db, tenant.id, () =>
      Promise.all([
        loadExecutiveSummary(tenant, entitlement, now),
        getBranding(tenant, entitlement),
      ]),
    );
    report = { mode: "live", summary, branding, expiresAt: link.expiresAt };
  }
  await recordShareView(link.id, now);
  return { kind: "ok", report };
};
