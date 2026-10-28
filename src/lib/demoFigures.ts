/**
 * Figures of the deterministic demo tenant ("Meridian Industries GmbH"),
 * the single worked example quoted across the marketing pages. The landing
 * ledger card and sample report both render from these constants so
 * the pages can never contradict each other; demoFigures.test.ts
 * recomputes every value from the demo fixtures and the rules engine, so the
 * marketing numbers cannot silently drift from what the live demo shows.
 */
export const DEMO_FIGURES = {
  orgName: "Meridian Industries GmbH",
  users: 155,
  /** Sum of monthlyImpactCents over all findings of the demo tenant. */
  monthlyWasteCents: 297986,
  /** Monthly Microsoft 365 spend: assigned seats times default list price. */
  monthlySpendCents: 697990,
  findingsCount: 65,
  /** Disabled accounts still holding Microsoft 365 licenses. */
  leaverCount: 8,
  /** Of those, people also holding Adobe, Zoom, Atlassian, Salesforce, AI console or AI seat access. */
  crossVendorLeaverCount: 7,
  /** Waste grouped for the landing ledger card; sums to monthlyWasteCents. */
  byCategory: {
    /** Disabled in Entra but still licensed: M365 and connected apps. */
    leavers: 78669,
    /** Connected-app seats with no directory account at all. */
    orphaned: 4599,
    /** Inactive 90+ days or never active: M365 and connected apps. */
    idle: 75158,
    copilotUnused: 39340,
    shelfware: 89210,
    guests: 11010,
  },
  /**
   * The sample Software Metering report at the default 60-day period:
   * fictional Windows devices, summarized from the same generator the demo
   * workspace renders (meteringDemo + summarize, recomputed in the test).
   * Metering evidence is not priced, so none of this is in monthlyWasteCents.
   */
  metering: {
    devices: 42,
    /** Devices whose collector coverage spans the whole 60 days. */
    fullCoverageDevices: 30,
    /** Installed device and app pairs with no start in 60 days. */
    notStartedPairs: 45,
    /** Metered apps (a program file is known), most installed first. */
    apps: [
      { name: "Zoom Workplace", installed: 40, started: 20, notStarted: 11 },
      { name: "Adobe Acrobat Pro", installed: 29, started: 16, notStarted: 7 },
      {
        name: "Adobe Illustrator",
        installed: 16,
        started: 8,
        notStarted: 5,
      },
      { name: "Microsoft Visio", installed: 14, started: 6, notStarted: 7 },
      { name: "Adobe Photoshop", installed: 13, started: 4, notStarted: 7 },
      { name: "AutoCAD 2026", installed: 9, started: 4, notStarted: 4 },
      { name: "Microsoft Project", installed: 7, started: 2, notStarted: 2 },
      { name: "SOLIDWORKS 2025", installed: 5, started: 2, notStarted: 2 },
    ],
    /** Installed app with no known program file; not metered until one is set. */
    unmeteredApp: "Contoso Time Tracker",
  },
} as const;

/** "2.844,86": the German number convention used across the marketing copy. */
export const demoEuros = (cents: number): string =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

/** Annualized waste rounded to the nearest thousand, formatted ("34.000"). */
export const DEMO_ANNUAL_WASTE_ROUNDED = new Intl.NumberFormat("de-DE").format(
  Math.round((DEMO_FIGURES.monthlyWasteCents * 12) / 100_000) * 1000,
);
