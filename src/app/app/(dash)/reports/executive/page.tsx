import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { ExecutiveReportPreview } from "~/components/workspace/ExecutiveReportPreview";
import { PlanBadge } from "~/components/workspace/FeatureLock";
import { savingsTrialLabel } from "~/components/workspace/PriceConfidence";
import { ShareLinksPanel } from "~/components/workspace/ShareLinksPanel";
import { fmtAgo, fmtDate } from "~/lib/format";
import { upgradePath } from "~/lib/upgrade";
import { hasRole, requireAccess } from "~/server/access";
import { getBranding } from "~/server/billing/branding";
import { hasFeature } from "~/server/entitlement";
import { loadExecutiveSummary } from "~/server/report/executiveData";
import { deliverableRecipients } from "~/server/report/recipients";
import {
  listShareLinks,
  MAX_ACTIVE_LINKS,
  SHARE_LABEL_MAX,
} from "~/server/report/shareLinks";

export const metadata: Metadata = { title: "Executive report" };

export default async function ExecutiveReportPage() {
  const ctx = await requireAccess("viewer");
  const { tenant, entitlement } = ctx;
  const full = hasFeature(entitlement, "execReport");
  // Share links and finance recipients reach people outside the workspace,
  // so they are for owners and admins, and never for the shared demo.
  const isAdmin = hasRole(ctx, "admin");
  const canManage = isAdmin && !tenant.isDemo;
  const [summary, branding, links, financeRecipients] = await Promise.all([
    loadExecutiveSummary(tenant, entitlement),
    full ? getBranding(tenant, entitlement) : null,
    canManage ? listShareLinks(tenant.id) : [],
    canManage ? deliverableRecipients(tenant.id, "finance") : [],
  ]);
  const now = Date.now();
  const activeLinks = links.filter((l) => l.expiresAt.getTime() > now).length;
  const createBlocked = full
    ? null
    : "Creating share links is included in Pro. Existing links can still be revoked here.";

  return (
    <div className="mx-auto grid max-w-5xl min-w-0 grid-cols-1 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">
              Executive report
            </h1>
            <PlanBadge feature="execReport" locked={!full} />
          </div>
          <p className="text-ink-soft mt-1 max-w-2xl text-sm">
            {full
              ? "One page for finance and leadership: license spend, open waste, realized savings, the renewal actions due in the next 90 days and a 6-month trend. The preview below uses live data; the PDF is the same page."
              : "A one-page PDF for finance and leadership. The preview below shows your own totals; Pro adds realized savings, waste by rule and the renewal actions due in the next 90 days, the PDF download, share links and the monthly email to finance."}
          </p>
        </div>
        {full ? (
          <ButtonAnchor
            href="/api/reports/executive/pdf"
            variant="primary"
            download
          >
            <Download aria-hidden="true" className="size-4" />
            Download 1-page PDF
          </ButtonAnchor>
        ) : (
          <ButtonLink href={upgradePath("execReport")} variant="primary">
            {entitlement.state === "overQuantity"
              ? "See plans"
              : savingsTrialLabel}
          </ButtonLink>
        )}
      </header>
      {entitlement.state === "overQuantity" && (
        <p className="text-ink-soft text-sm">
          This workspace is not covered by your MSP plan.
        </p>
      )}
      {canManage && (full || links.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card
            title="Share with finance"
            badge={<PlanBadge feature="execReport" locked={!full} />}
          >
            <ShareLinksPanel
              links={links.map((l) => ({
                id: l.id,
                label: l.label,
                tokenPrefix: l.tokenPrefix,
                mode: l.mode,
                created: fmtDate(l.createdAt),
                expires: fmtDate(l.expiresAt),
                expired: l.expiresAt.getTime() <= now,
                lastViewed: fmtAgo(l.lastViewedAt),
                viewCount: l.viewCount,
              }))}
              canManage={canManage}
              createBlocked={createBlocked}
              atLimit={activeLinks >= MAX_ACTIVE_LINKS}
              labelMax={SHARE_LABEL_MAX}
            />
          </Card>
          <Card title="Monthly delivery">
            <p className="text-ink-soft text-sm">
              {financeRecipients.length === 0
                ? "Email this report to finance on the first of each month, as a PDF."
                : `This report goes to ${financeRecipients.length} confirmed finance ${financeRecipients.length === 1 ? "recipient" : "recipients"} on the first of each month.`}
            </p>
            <p className="mt-3 text-sm">
              <Link
                href="/app/settings#finance-delivery"
                className="hover:text-ink font-medium underline underline-offset-4"
              >
                {financeRecipients.length === 0
                  ? "Add finance recipients"
                  : "Manage finance recipients"}
              </Link>
            </p>
          </Card>
        </div>
      )}
      {isAdmin && tenant.isDemo && (
        <p className="text-ink-faint text-sm">
          Share links and the monthly email to finance are not available in the
          demo workspace.
        </p>
      )}
      <ExecutiveReportPreview
        summary={summary}
        teaser={!full}
        branding={branding}
      />
    </div>
  );
}
