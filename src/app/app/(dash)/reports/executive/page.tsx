import { Download } from "lucide-react";
import type { Metadata } from "next";

import { ButtonAnchor, ButtonLink } from "~/components/ui";
import { ExecutiveReportPreview } from "~/components/workspace/ExecutiveReportPreview";
import { PlanBadge } from "~/components/workspace/FeatureLock";
import { savingsTrialLabel } from "~/components/workspace/PriceConfidence";
import { upgradePath } from "~/lib/upgrade";
import { requireAccess } from "~/server/access";
import { getBranding } from "~/server/billing/branding";
import { hasFeature } from "~/server/entitlement";
import { loadExecutiveSummary } from "~/server/report/executiveData";

export const metadata: Metadata = { title: "Executive report" };

export default async function ExecutiveReportPage() {
  const { tenant, entitlement } = await requireAccess("viewer");
  const full = hasFeature(entitlement, "execReport");
  const [summary, branding] = await Promise.all([
    loadExecutiveSummary(tenant, entitlement),
    full ? getBranding(tenant, entitlement) : null,
  ]);

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
              : "A one-page PDF for finance and leadership. The preview below shows your own totals; Pro adds realized savings, waste by rule and the renewal actions due in the next 90 days, and the PDF download."}
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
      <ExecutiveReportPreview
        summary={summary}
        teaser={!full}
        branding={branding}
      />
    </div>
  );
}
