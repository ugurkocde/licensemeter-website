import { siteUrl } from "~/env";
import { fmtMoney, workspaceLabel } from "~/lib/format";
import { leakAlertHtml } from "~/server/email";
import { leakAlertSubject, summarizeLeakFindings } from "~/server/leakAlerts";

/**
 * Subject and body of a leak alert, from one summary so they cannot disagree.
 * "requested" switches the framing to a summary an admin asked for; the
 * figures, the table and the caveats are the same message.
 */
export const leakAlertMessage = (
  tenant: { name: string | null; tid: string | null; currency: string },
  rows: { title: string; monthlyImpactCents: number }[],
  { requested = false }: { requested?: boolean } = {},
): { subject: string; html: string } => {
  const summary = summarizeLeakFindings(rows);
  const money = (cents: number) => fmtMoney(cents, tenant.currency);
  const name = workspaceLabel(tenant);
  return {
    subject: leakAlertSubject(
      summary.count,
      summary.totalCents,
      tenant.currency,
      name,
      requested,
    ),
    html: leakAlertHtml({
      tenantName: name,
      leakCount: summary.count,
      totalImpact: money(summary.totalCents),
      shownImpact: money(summary.shownCents),
      omittedCount: summary.omittedCount,
      omittedImpact: money(summary.omittedCents),
      zeroCount: summary.zeroCount,
      items: summary.items.map((row) => ({
        title: row.title,
        impact: money(row.monthlyImpactCents),
      })),
      appUrl: siteUrl(),
      requested,
    }),
  };
};
