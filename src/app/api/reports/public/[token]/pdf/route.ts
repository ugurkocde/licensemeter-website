import { loadPublicReport } from "~/server/report/publicReport";
import { reportFilename } from "~/server/report/filename";
import { renderExecutiveReportPdf } from "~/server/report/renderExecutive";

export const maxDuration = 60;

/**
 * The one-page executive PDF behind a public share link. Same rules as the
 * /r/[token] page: rate limited per client before any lookup, one identical
 * 404 for an unknown, malformed, expired or revoked link (and for a live link
 * whose workspace no longer has the plan), and only the executive summary,
 * which carries no user identifiers.
 */

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/** The one answer for every link that must not be served. */
const notFound = (): Response =>
  new Response("Not found", {
    status: 404,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await loadPublicReport(token, req.headers, "pdf");
  if (result.kind === "rateLimited") {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "600",
      },
    });
  }
  if (result.kind === "notFound") return notFound();
  const { summary, branding } = result.report;
  const pdf = await renderExecutiveReportPdf(summary, branding);
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFilename(
        { name: summary.workspace, id: "workspace" },
        new Date(summary.generatedAt),
        "executive-report",
      )}"`,
    },
  });
}
