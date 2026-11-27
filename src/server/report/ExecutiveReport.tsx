import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ComponentProps } from "react";

import { fmtMoney, fmtNumber } from "~/lib/format";
import { brandBand, type ReportBranding } from "~/server/report/brandStyle";
import {
  actionSavings,
  daysLabel,
  EXEC_FOOTNOTE,
  execDay,
  execMonth,
  perMonth,
  perYear,
  renewalsTotal,
  seatCount,
  trendMax,
} from "~/server/report/executiveFormat";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";

/**
 * The executive savings report: strictly one A4 page for finance and
 * leadership. Lists are capped in executiveSummary.ts so the page holds
 * them at their limits; a test renders the crowded case and counts pages.
 */

const C = {
  canvas: "#fbfcfc",
  ink: "#0c1a17",
  inkSoft: "#3a4541",
  inkFaint: "#687772",
  line: "#e4eae8",
  brand: "#0f766e",
  waste: "#b45309",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.canvas,
    color: C.ink,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 44,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  wordmark: { fontSize: 16, fontFamily: "Times-Roman" },
  hRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
    paddingBottom: 10,
  },
  meta: { color: C.inkSoft, fontSize: 8.5, textAlign: "right" },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 10,
  },
  brandLogo: {
    height: 28,
    maxWidth: 200,
    objectFit: "contain",
    objectPosition: "left",
  },
  brandBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  kpiRow: { flexDirection: "row", marginTop: 16, gap: 8 },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#ffffff",
    padding: 9,
  },
  kpiLabel: {
    fontSize: 6.5,
    color: C.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  kpiValue: { fontSize: 15, fontFamily: "Times-Roman", marginTop: 4 },
  kpiSub: { fontSize: 7, color: C.inkSoft, marginTop: 3 },
  section: {
    fontSize: 7.5,
    color: C.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 6,
  },
  twoCol: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 4,
  },
  cellTitle: { flex: 1, paddingRight: 8 },
  /** Two lines at most, so a long contract name cannot push the page over. */
  clamp: { maxLines: 2, textOverflow: "ellipsis" },
  cellImpact: { width: 70, textAlign: "right", color: C.waste },
  muted: { color: C.inkFaint },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 78,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 6,
  },
  chartCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    height: "100%",
  },
  bar: { width: 9 },
  chartLabels: { flexDirection: "row", gap: 6, marginTop: 3 },
  chartLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 6.5,
    color: C.inkFaint,
  },
  legend: { flexDirection: "row", gap: 10, marginTop: 5, fontSize: 7 },
  swatch: { width: 7, height: 7, marginRight: 3 },
  th: {
    fontSize: 6.5,
    color: C.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
  cName: { flex: 1, paddingRight: 6 },
  cDate: { width: 62 },
  cSeats: { width: 52, textAlign: "right" },
  cSave: { width: 92, textAlign: "right", color: C.waste },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
    fontSize: 6.5,
    color: C.inkFaint,
  },
});

const TITLE = "Executive savings report";

/** Wrap between words only; product and rule names are never hyphenated. */
const wholeWords = (word: string) => [word];
const T = (props: ComponentProps<typeof Text>) => (
  <Text hyphenationCallback={wholeWords} {...props} />
);

const Header = ({
  summary,
  branding,
}: {
  summary: ExecutiveSummary;
  branding: ReportBranding | null;
}) => {
  const meta = (
    <View style={{ alignItems: "flex-end" }}>
      <T style={styles.meta}>{summary.workspace}</T>
      <T style={styles.meta}>Generated {execDay(summary.generatedAt)}</T>
    </View>
  );
  if (!branding) {
    return (
      <View style={styles.hRow}>
        <View>
          <T style={styles.wordmark}>
            License<T style={{ color: C.brand }}>Meter</T>
          </T>
          <T style={{ color: C.inkSoft, marginTop: 4, fontSize: 10 }}>
            {TITLE}
          </T>
        </View>
        {meta}
      </View>
    );
  }
  const band = brandBand(branding.color);
  return (
    <View>
      <View style={styles.brandRow}>
        {branding.logo ? (
          // The PDF image primitive has no alt prop; the brand name is in the band.
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={branding.logo} style={styles.brandLogo} />
        ) : (
          <T style={styles.wordmark}>{branding.name}</T>
        )}
        {meta}
      </View>
      <View style={[styles.brandBand, { backgroundColor: band.background }]}>
        <T style={{ color: band.text }}>{TITLE}</T>
        {branding.name && (
          <T style={{ color: band.text, fontSize: 8.5 }}>
            Prepared by {branding.name}
          </T>
        )}
      </View>
    </View>
  );
};

const Kpi = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) => (
  <View style={styles.kpi}>
    <T style={styles.kpiLabel}>{label}</T>
    <T style={[styles.kpiValue, color ? { color } : {}]}>{value}</T>
    <T style={styles.kpiSub}>{sub}</T>
  </View>
);

export const ExecutiveReport = ({
  summary,
  branding = null,
}: {
  summary: ExecutiveSummary;
  /** White-label marks; null renders the LicenseMeter report. */
  branding?: ReportBranding | null;
}) => {
  const { currency, waste, savings, renewals } = summary;
  const max = trendMax(summary);
  const height = (cents: number | null) =>
    cents ? `${Math.max(2, (cents * 100) / max)}%` : "1%";
  return (
    <Document
      title={
        branding?.name
          ? `${branding.name} ${TITLE.toLowerCase()}: ${summary.workspace}`
          : `${TITLE}: ${summary.workspace}`
      }
      author={branding?.name ?? "LicenseMeter"}
    >
      <Page size="A4" style={styles.page}>
        <Header summary={summary} branding={branding} />

        <View style={styles.kpiRow}>
          <Kpi
            label="License spend"
            value={perYear(summary.spend.annualCents, currency)}
            sub={`${perMonth(summary.spend.monthlyCents, currency)} today`}
          />
          <Kpi
            label="Open waste"
            value={perYear(waste.annualCents, currency)}
            sub={`${fmtNumber(waste.openFindings, currency)} open ${waste.openFindings === 1 ? "finding" : "findings"}`}
            color={C.waste}
          />
          <Kpi
            label="Realized savings"
            value={
              savings ? perYear(savings.annualRunRateCents, currency) : "-"
            }
            sub={
              savings
                ? `${fmtMoney(savings.cumulativeCents, currency)} accrued to date`
                : "Savings ledger not enabled"
            }
            color={C.brand}
          />
          <Kpi
            label={`Renewals, next ${renewals.windowDays} days`}
            value={renewalsTotal(summary)}
            sub={`${seatCount(renewals.cutSeats, currency)} to cut across ${renewals.count} ${renewals.count === 1 ? "renewal" : "renewals"}${renewals.estimate ? " (estimate)" : ""}`}
            color={C.waste}
          />
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <T style={styles.section}>6-month trend</T>
            <View style={styles.chart}>
              {summary.trend.map((p) => (
                <View key={p.month} style={styles.chartCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: height(p.wasteCents),
                        backgroundColor: C.waste,
                        opacity: p.wasteCents ? 1 : 0.25,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      {
                        height: height(p.realizedCents),
                        backgroundColor: C.brand,
                        opacity: p.realizedCents ? 1 : 0.25,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.chartLabels}>
              {summary.trend.map((p) => (
                <T key={p.month} style={styles.chartLabel}>
                  {execMonth(p.month)}
                </T>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[styles.swatch, { backgroundColor: C.waste }]} />
                <T>Open waste per month</T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[styles.swatch, { backgroundColor: C.brand }]} />
                <T>Savings realized that month</T>
              </View>
            </View>
          </View>

          <View style={styles.col}>
            <T style={styles.section}>Open waste by rule</T>
            {waste.byRule.length ? (
              waste.byRule.map((r) => (
                <View key={r.label} style={styles.row}>
                  <T style={styles.cellTitle}>
                    {r.label} ({fmtNumber(r.count, currency)})
                  </T>
                  <T style={styles.cellImpact}>
                    {r.monthlyCents > 0
                      ? perMonth(r.monthlyCents, currency)
                      : "-"}
                  </T>
                </View>
              ))
            ) : (
              <T style={styles.muted}>No open findings.</T>
            )}
            {waste.capped && (
              <T style={[styles.muted, { marginTop: 4, fontSize: 7 }]}>
                Total capped at comparable spend:{" "}
                {perMonth(waste.monthlyCents, currency)}.
              </T>
            )}
          </View>
        </View>

        <T style={styles.section}>
          Renewal actions, next {renewals.windowDays} days
        </T>
        {renewals.actions.length ? (
          <View>
            <View style={styles.tRow}>
              <T style={[styles.th, styles.cName]}>Subscription</T>
              <T style={[styles.th, styles.cDate]}>Renews</T>
              <T style={[styles.th, styles.cDate]}>Decide by</T>
              <T style={[styles.th, styles.cSeats]}>Renew at</T>
              <T style={[styles.th, styles.cSeats]}>Cut</T>
              <T style={[styles.th, styles.cSave, { color: C.inkFaint }]}>
                Savings
              </T>
            </View>
            {renewals.actions.map((a) => (
              <View
                key={`${a.kind}-${a.label}-${a.renewalDate}`}
                style={styles.tRow}
              >
                <View style={styles.cName}>
                  <T style={styles.clamp}>{a.label}</T>
                  <T style={[styles.muted, { fontSize: 7 }]}>
                    {a.vendor} · {daysLabel(a.daysUntil)}
                    {a.estimate ? " · estimate" : ""}
                  </T>
                </View>
                <T style={styles.cDate}>{execDay(a.renewalDate)}</T>
                <T style={styles.cDate}>{execDay(a.decideBy)}</T>
                <T style={styles.cSeats}>
                  {fmtNumber(a.recommendedSeats, currency)} of{" "}
                  {fmtNumber(a.paidSeats, currency)}
                </T>
                <T style={styles.cSeats}>{fmtNumber(a.cutSeats, currency)}</T>
                <T style={styles.cSave}>{actionSavings(a, currency)}</T>
              </View>
            ))}
            {renewals.count > renewals.actions.length && (
              <T style={[styles.muted, { marginTop: 4, fontSize: 7 }]}>
                {renewals.count - renewals.actions.length} more{" "}
                {renewals.count - renewals.actions.length === 1
                  ? "renewal"
                  : "renewals"}{" "}
                in the renewal savings plan.
              </T>
            )}
          </View>
        ) : (
          <T style={styles.muted}>
            No renewal in the next {renewals.windowDays} days has seats to cut.
          </T>
        )}

        <View style={styles.footer} fixed>
          <T>
            {branding?.name ? `Prepared by ${branding.name}. ` : ""}
            {EXEC_FOOTNOTE}
            {branding
              ? " Generated with LicenseMeter (licensemeter.com)."
              : " Generated by LicenseMeter (licensemeter.com)."}
          </T>
        </View>
      </Page>
    </Document>
  );
};
