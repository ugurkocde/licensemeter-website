import { renderToBuffer } from "@react-pdf/renderer";

import type { ReportBranding } from "~/server/report/brandStyle";
import { ExecutiveReport } from "~/server/report/ExecutiveReport";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";

/** Renders the one-page executive savings report to a PDF buffer. */
export const renderExecutiveReportPdf = (
  summary: ExecutiveSummary,
  branding: ReportBranding | null = null,
): Promise<Buffer> => renderToBuffer(ExecutiveReport({ summary, branding }));
