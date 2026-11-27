import { Download } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ButtonAnchor } from "~/components/ui";
import { ExecutiveReportPreview } from "~/components/workspace/ExecutiveReportPreview";
import { fmtDate } from "~/lib/format";
import { loadPublicReport } from "~/server/report/publicReport";

export const dynamic = "force-dynamic";

/*
 * The token is the whole authorization: keep it out of search indexes, out
 * of any Referer header and out of the canonical URL. next.config.js sets the
 * same policy as response headers (no-referrer, private no-store, noindex).
 */
export const metadata: Metadata = {
  title: "Executive savings report",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  referrer: "no-referrer",
};

/**
 * Read-only executive savings report behind a share link, for people without
 * a LicenseMeter account. It shows the executive summary only, which carries
 * no user names, UPNs, emails or ids. Unknown, malformed, expired and revoked
 * links, and live links whose workspace no longer has the plan, all get the
 * same 404.
 */
export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadPublicReport(token, await headers(), "view");
  if (result.kind === "notFound") notFound();
  if (result.kind === "rateLimited") {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-2xl tracking-tight">
            Too many requests
          </h1>
          <p className="text-ink-soft mt-3 text-sm">
            This address opened many reports in a short time. Try again in a few
            minutes.
          </p>
        </div>
      </main>
    );
  }
  const { report } = result;
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-5xl min-w-0 grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-soft text-sm">
            {report.mode === "snapshot"
              ? `Snapshot from ${fmtDate(new Date(report.summary.generatedAt))}. `
              : "Live report, updated with every sync. "}
            Read-only link, valid until {fmtDate(report.expiresAt)}.
          </p>
          <ButtonAnchor
            href={`/api/reports/public/${token}/pdf`}
            variant="primary"
            download
            rel="noreferrer"
          >
            <Download aria-hidden="true" className="size-4" />
            Download 1-page PDF
          </ButtonAnchor>
        </div>
        <ExecutiveReportPreview
          summary={report.summary}
          branding={report.branding}
        />
        <p className="text-ink-faint text-xs">
          Shared from LicenseMeter. This page names no employees and is not
          indexed by search engines.
        </p>
      </div>
    </main>
  );
}
