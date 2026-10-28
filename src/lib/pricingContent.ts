import {
  MSP_EXTRA_TENANT_PRICE,
  MSP_INCLUDED_TENANTS,
  PLAN_PRICES,
  TRIAL_DAYS,
  type BillingInterval,
} from "~/lib/pricing";

/**
 * Bilingual content for /pricing and /de/pricing, following the single-source
 * pattern of /security and /trust-center. The price figures come from
 * ~/lib/pricing. The comparison table is defined once, language-neutral, in
 * COMPARISON_GROUPS; each language only supplies labels, so the two pages
 * cannot drift apart structurally. The FAQ feeds both the visible list and
 * the FAQPage JSON-LD.
 */

export type PricingLang = "en" | "de";
export const PRICING_LANGS = ["en", "de"] as const;

export const PRICING_PATHS: Record<PricingLang, string> = {
  en: "/pricing",
  de: "/de/pricing",
};

export const PLAN_IDS = ["free", "pro", "msp"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** "€2,990" in English, "2.990 €" in German. Whole euros only. */
export const formatEuro = (amount: number, lang: PricingLang): string => {
  const grouped = String(Math.round(amount)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    lang === "de" ? "." : ",",
  );
  return lang === "de" ? `${grouped}\u00a0€` : `€${grouped}`;
};

/* ---------------------------------------------------------------- table */

type TextKey =
  | "history12"
  | "history24"
  | "oneTenant"
  | "tenTenantsPlus"
  | "noSupport"
  | "email"
  | "uptime"
  | "planned";

/** A check, a dash, a dash read as "not applicable", or a short text value. */
type CellSpec = "yes" | "no" | "na" | { text: TextKey };

type RowSpec<Id extends string> = {
  id: Id;
  /** Free, Pro, MSP. */
  cells: readonly [CellSpec, CellSpec, CellSpec];
  /** Recently launched: the row carries a "New" badge. */
  isNew?: boolean;
};

const ALL: RowSpec<string>["cells"] = ["yes", "yes", "yes"];
const PAID: RowSpec<string>["cells"] = ["no", "yes", "yes"];
const MSP_ONLY: RowSpec<string>["cells"] = ["no", "no", "yes"];

const COMPARISON_GROUPS = [
  {
    id: "find",
    rows: [
      { id: "scan", cells: ALL },
      { id: "priced", cells: ALL },
      { id: "priceBook", cells: ALL },
      { id: "sync", cells: ALL },
      {
        id: "history",
        cells: [
          { text: "history12" },
          { text: "history24" },
          { text: "history24" },
        ],
      },
    ],
  },
  {
    id: "act",
    rows: [
      { id: "reports", cells: ALL },
      { id: "whiteLabel", cells: PAID },
      { id: "scripts", cells: ALL },
      { id: "mcp", cells: PAID },
      { id: "metering", cells: PAID, isNew: true },
    ],
  },
  {
    id: "msp",
    rows: [
      { id: "portfolio", cells: ALL },
      {
        id: "tenantsCovered",
        cells: ["no", { text: "oneTenant" }, { text: "tenTenantsPlus" }],
      },
    ],
  },
  {
    id: "support",
    rows: [
      {
        id: "support",
        cells: [{ text: "noSupport" }, { text: "email" }, { text: "email" }],
      },
      {
        id: "uptime",
        cells: ["no", { text: "uptime" }, { text: "uptime" }],
      },
      { id: "onboarding", cells: MSP_ONLY },
    ],
  },
  {
    id: "governance",
    rows: [
      { id: "euData", cells: ALL },
      { id: "readOnly", cells: ALL },
      { id: "standardDpa", cells: ALL },
      { id: "signedDpa", cells: PAID },
      { id: "subProcessorDpa", cells: MSP_ONLY },
    ],
  },
  {
    id: "buying",
    rows: [
      { id: "marketplace", cells: ["na", "yes", "yes"] },
      { id: "polar", cells: ["na", "yes", "yes"] },
    ],
  },
  {
    /* Not built yet: listed apart from the plans, never with a checkmark. */
    id: "soon",
    rows: [
      { id: "portfolioAlerts", cells: ["no", "no", { text: "planned" }] },
      { id: "mspTeam", cells: ["no", "no", { text: "planned" }] },
    ],
  },
] as const satisfies readonly {
  id: string;
  rows: readonly RowSpec<string>[];
}[];

type GroupId = (typeof COMPARISON_GROUPS)[number]["id"];
type RowId = (typeof COMPARISON_GROUPS)[number]["rows"][number]["id"];

export type ComparisonCell =
  { kind: "yes" | "no" | "na" } | { kind: "text"; text: string };

export type ComparisonGroup = {
  id: GroupId;
  label: string;
  /** True for the group of features that are announced but not available. */
  soon: boolean;
  rows: {
    id: RowId;
    label: string;
    isNew: boolean;
    cells: ComparisonCell[];
  }[];
};

/* -------------------------------------------------------------- content */

/** Plain text and links, in reading order. */
export type RichText = (string | { text: string; href: string })[];

type PlanItem = { text: string; detail?: string; off?: boolean };

type PlanCopy = {
  audience: string;
  highlights: string[];
  pitch: string;
  note: Record<BillingInterval, string>;
  /** A launched feature called out on the card, linking to its section. */
  spotlight?: string;
  includedTitle: string;
  items: PlanItem[];
  /** Announced, not available: rendered apart, without checkmarks. */
  soon?: string[];
};

export type PricingContent = {
  meta: { title: string; description: string };
  breadcrumb: { home: string; page: string };
  toggleLabel: string;
  hero: {
    eyebrow: string;
    /** The struck word is decorative: read aloud, the heading skips it. */
    h1: { pre: string; struck: string; post: string };
    lede: string;
  };
  billing: { legend: string; month: string; year: string; save: string };
  per: { free: string; month: string; year: string };
  plansLabel: string;
  /** The band above the plan cards: what every price covers. */
  unlimited: { title: string; body: string };
  trialTag: string;
  freeTag: string;
  recommended: string;
  planDetails: string;
  soonTitle: string;
  newBadge: string;
  cta: { free: string; marketplace: string; card: string; talk: string };
  plans: Record<PlanId, PlanCopy>;
  /** The Software Metering spotlight under the plan cards. */
  metering: {
    eyebrow: string;
    h2: string;
    body: string;
    points: { title: string; body: string }[];
    requirement: string;
    post: string;
    docs: string;
  };
  buy: {
    eyebrow: string;
    h2: string;
    sub: string;
    options: {
      kicker: string;
      title: string;
      body: string;
      channel?: "marketplace";
    }[];
  };
  compare: {
    eyebrow: string;
    h2: string;
    sub: string;
    tableLabel: string;
    featureHeader: string;
    sr: Record<"yes" | "no" | "na", string>;
    groups: Record<GroupId, string>;
    rows: Record<RowId, string>;
    text: Record<TextKey, string>;
  };
  facts: {
    eyebrow: string;
    h2: string;
    sub: RichText;
    items: { label: string; value: string; detail: string }[];
  };
  faq: {
    eyebrow: string;
    h2: string;
    items: { q: string; a: string; channel?: "marketplace" }[];
  };
  closing: { h2: string; body: string };
};

const pro = PLAN_PRICES.pro;
const msp = PLAN_PRICES.msp;

const en: PricingContent = {
  meta: {
    title: "Pricing",
    description: `LicenseMeter pricing: the Free plan finds and prices Microsoft 365 license waste at no cost. Pro (${formatEuro(pro.month, "en")} per month) adds Windows Software Metering through Intune, support by email, a 99.9% uptime target, a signed DPA (AVV), an MCP server, white-label PDF reports and 24 months of history. MSP (${formatEuro(msp.month, "en")} per month) covers ${MSP_INCLUDED_TENANTS} client tenants with everything in Pro.`,
  },
  breadcrumb: { home: "Home", page: "Pricing" },
  toggleLabel: "Language",
  hero: {
    eyebrow: "Pricing",
    h1: { pre: "Finding the waste costs", struck: "money", post: "nothing." },
    lede: "Start free with every scan, finding and report. Pro adds support and Software Metering for your Windows apps. MSP covers your client portfolio.",
  },
  billing: {
    legend: "Billing period",
    month: "Monthly",
    year: "Yearly",
    save: "2 months off",
  },
  per: { free: "forever", month: "per month", year: "per year" },
  plansLabel: "Plans",
  unlimited: {
    title: "Unlimited users. Unlimited devices.",
    body: "Every price covers your whole tenant, however many people and devices it has. No per-user or per-device fees.",
  },
  trialTag: `${TRIAL_DAYS}-day trial`,
  freeTag: "Open source · No support",
  recommended: "Recommended",
  planDetails: "All plan details",
  soonTitle: "Coming soon",
  newBadge: "New",
  cta: {
    free: "Start free",
    marketplace: "Buy on Microsoft Marketplace",
    card: "Pay by card with Polar",
    talk: "Talk to us",
  },
  plans: {
    free: {
      audience: "For your first scan and beyond",
      highlights: [
        "Every scan, finding and report",
        "No seat or tenant limit",
        "12 months of waste history",
        "Self-host with Docker",
      ],
      pitch:
        "The full product. Connect a tenant, see what the unused licenses cost per month, and hand IT the script that fixes it.",
      note: {
        month: "No card. No seat or tenant limit.",
        year: "No card. No seat or tenant limit.",
      },
      includedTitle: "Included",
      items: [
        {
          text: "Read-only Microsoft 365 scan",
          detail: "Admin consent, no write scope",
        },
        { text: "Every finding priced in euros per month" },
        { text: "Nightly sync and weekly email digest" },
        { text: "PDF waste report, CSV export, PowerShell scripts" },
        { text: "Portfolio view across client tenants" },
        { text: "Self-host with Docker under the MIT license" },
        {
          text: "No support",
          detail: "Support comes with Pro and MSP",
          off: true,
        },
      ],
    },
    pro: {
      audience: "For teams that want support",
      highlights: [
        "Everything in Free for one tenant",
        "Email support and a 99.9% uptime target",
        "Signed DPA and MCP server",
        "24 months of waste history",
      ],
      pitch:
        "Everything in Free for one tenant, with support, Software Metering for your Windows apps, PDF reports under your own brand, a signed data processing agreement and an MCP server for your AI assistant.",
      note: {
        month: "Excluding VAT. Cancel any time.",
        year: "Excluding VAT. Twelve months for the price of ten.",
      },
      spotlight: "Software Metering for Windows apps",
      includedTitle: "Everything in Free, plus",
      items: [
        {
          text: "Windows Software Metering",
          detail:
            "Installed versus started for every Windows app you deploy through Intune",
        },
        { text: "Support", detail: "By email" },
        {
          text: "99.9% uptime target",
          detail: "Tracked on a public status page",
        },
        {
          text: "Signed data processing agreement",
          detail:
            "DPA (AVV) under GDPR Art. 28, signed with your company, in German or English",
        },
        {
          text: "MCP server",
          detail:
            "Query waste, findings and trends from Claude, Copilot or any MCP client",
        },
        {
          text: "White-label PDF reports",
          detail: "Your logo, name and colour on every report",
        },
        { text: "24 months of waste history" },
        { text: "Buy on your Microsoft invoice" },
        { text: "Covers one tenant" },
      ],
    },
    msp: {
      audience: "For your client portfolio",
      highlights: [
        "Everything in Pro",
        `${MSP_INCLUDED_TENANTS} client tenants included`,
        "One brand on every client report",
        "Client DPA and onboarding call",
      ],
      pitch:
        "Pro across your client portfolio, with reports under your own brand and Software Metering on every covered client tenant.",
      note: {
        month: `Excluding VAT. ${MSP_INCLUDED_TENANTS} client tenants included, then ${formatEuro(MSP_EXTRA_TENANT_PRICE.month, "en")} each per month.`,
        year: `Excluding VAT. ${MSP_INCLUDED_TENANTS} client tenants included, then ${formatEuro(MSP_EXTRA_TENANT_PRICE.year, "en")} each per year.`,
      },
      spotlight: "Software Metering on every client tenant",
      includedTitle: "Everything in Pro, plus",
      items: [
        {
          text: `${MSP_INCLUDED_TENANTS} client tenants covered`,
          detail: "Add more at any time",
        },
        {
          text: "DPA that covers your client tenants",
          detail: "LicenseMeter signs as your sub-processor",
        },
        { text: "Onboarding call" },
      ],
      soon: ["Portfolio alerts", "One team across all client tenants"],
    },
  },
  metering: {
    eyebrow: "Included in Pro and MSP",
    h2: "Software Metering: find the Windows licenses nobody starts.",
    body: "For every Windows app you deploy through Intune, see how many devices have it installed and, once LicenseMeter knows its program file, how many started it in the last 30, 60 or 90 days. Visio, Project, Acrobat Pro, AutoCAD: the desktop seats that Microsoft 365 reports cannot see.",
    points: [
      {
        title: "Every Windows app in Intune",
        body: "Win32, Store, WinGet and line-of-business apps, and Microsoft 365 Apps with Visio and Project listed on their own.",
      },
      {
        title: "Set up in three steps",
        body: "LicenseMeter creates the Intune Remediations collector for you once an Admin confirms, or you deploy the script yourself.",
      },
      {
        title: "Read live, never stored",
        body: "Results stay in Intune. LicenseMeter reads them when you open or export the report.",
      },
      {
        title: "No user names",
        body: "Program names and start times per device only, under its own optional Microsoft consent.",
      },
    ],
    requirement:
      "Needs Windows devices managed by Intune and Remediations licensing, such as Windows Enterprise E3 or E5.",
    post: "Read the announcement",
    docs: "Setup guide",
  },
  buy: {
    eyebrow: "Two ways to buy Pro or MSP",
    h2: "Use the channel your procurement already approved.",
    sub: "Same plans, same prices, same features. Your subscription attaches to your tenant either way.",
    options: [
      {
        kicker: "Option 01",
        channel: "marketplace",
        title: "Microsoft Marketplace",
        body: "The charge lands on your existing Microsoft invoice under the agreement you already have. No new vendor to onboard, no card, no separate purchase order.",
      },
      {
        kicker: "Option 02",
        title: "Polar",
        body: "Pay by card in a minute. Polar is the merchant of record, so VAT is calculated correctly for your country and you get a compliant invoice every period.",
      },
    ],
  },
  compare: {
    eyebrow: "Compare plans",
    h2: "Nothing moves out of Free.",
    sub: "The paid plans add commitments and tooling on top. They do not take features away from the free product.",
    tableLabel: "Plan comparison",
    featureHeader: "Feature",
    sr: { yes: "Included", no: "Not included", na: "Not applicable" },
    groups: {
      find: "Find the waste",
      act: "Act on it",
      msp: "For MSPs",
      support: "Support",
      governance: "Data governance",
      buying: "Buying",
      soon: "Coming soon",
    },
    rows: {
      scan: "Read-only tenant scan",
      priced: "Findings priced per month",
      priceBook: "Price book with negotiated rates",
      sync: "Nightly sync and weekly digest",
      history: "Waste history",
      reports: "PDF report and CSV export",
      scripts: "Generated PowerShell scripts",
      mcp: "MCP server for AI assistants",
      metering: "Windows software metering through Intune",
      portfolio: "Portfolio across client tenants",
      whiteLabel: "White-label PDF reports",
      tenantsCovered: "Client tenants covered",
      support: "Support",
      uptime: "Uptime target",
      onboarding: "Onboarding call",
      euData: "Data stored in the EU (Frankfurt)",
      readOnly: "Read-only access to your tenant",
      standardDpa: "Standard DPA (AVV), accepted online",
      signedDpa: "Signed DPA (AVV) with your company",
      subProcessorDpa: "DPA covers client tenants as sub-processor",
      marketplace: "Microsoft Marketplace invoice",
      polar: "Card payment through Polar",
      portfolioAlerts: "Portfolio alerts",
      mspTeam: "One team across all client tenants",
    },
    text: {
      history12: "12 months",
      history24: "24 months",
      oneTenant: "1",
      tenTenantsPlus: `${MSP_INCLUDED_TENANTS}+`,
      noSupport: "No support",
      email: "Email",
      uptime: "99.9%",
      planned: "Planned",
    },
  },
  facts: {
    eyebrow: "What Pro and MSP add",
    h2: "A target we publish, not a promise we cannot keep.",
    sub: [
      "The uptime target covers the hosted service at licensemeter.com and is tracked on the public ",
      { text: "status page", href: "/status" },
      ". It is a target, not a contractual guarantee. The ",
      { text: "data processing agreement", href: "/dpa" },
      " is public, so you can read it before you connect anything.",
    ],
    items: [
      { label: "Uptime target", value: "99.9%", detail: "Measured monthly" },
      {
        label: "Status",
        value: "Public",
        detail: "Live status page for the service and its infrastructure",
      },
      {
        label: "Support",
        value: "Email",
        detail: "Pro and MSP, answered by the people who build it",
      },
      {
        label: "Your data",
        value: "EU",
        detail: "Stored in Frankfurt, DPA (AVV) on every plan",
      },
    ],
  },
  faq: {
    eyebrow: "Questions",
    h2: "Before you ask procurement.",
    items: [
      {
        q: "Will Free stay free?",
        a: "Yes. LicenseMeter is MIT licensed and the hosted product has no seat or tenant limit. The paid plans pay for support, the signed data processing agreement and the extra tooling. They do not gate the scan, the findings or the reports.",
      },
      {
        q: "Is there support on Free?",
        a: "No. Free is the full product without support. Support by email comes with Pro and MSP.",
      },
      {
        q: "Can we sign a data processing agreement?",
        a: "Every plan includes our standard data processing agreement, accepted online with the terms. With Pro and MSP, LicenseMeter, which is operated from Germany, also signs a data processing agreement (Auftragsverarbeitungsvertrag) under GDPR Art. 28 with your company, in German or English. Data is stored in the EU. On MSP the agreement also covers your client tenants, with LicenseMeter as your sub-processor.",
      },
      {
        q: "What does the MCP server give me?",
        a: "Pro and MSP include a Model Context Protocol server for your workspace. Connect it to Claude, Copilot or any MCP client and ask questions in plain language, such as which SKUs wasted the most last quarter. Access is read-only and scoped to the tenants you can already see.",
      },
      {
        q: "What is Software Metering?",
        a: "Pro and MSP include Software Metering for the Windows apps you deploy through Intune. For each app it shows how many devices have it installed and how many started it in the observation period, so you can see which desktop licenses go unused before a renewal. It has its own optional Microsoft consent and a collector that runs as an Intune Remediation, which needs Remediations licensing such as Windows Enterprise E3 or E5. Results are read live from Intune and not stored, and no user names are collected.",
      },
      {
        channel: "marketplace",
        q: "How does buying through Microsoft Marketplace work?",
        a: `You subscribe in Microsoft Marketplace or the Azure portal, sign in to LicenseMeter with the same Microsoft account, and your plan activates on your tenant. The charge appears on your Microsoft invoice. The ${TRIAL_DAYS}-day trial runs there too.`,
      },
      {
        q: "I run an MSP. Which plan do I need?",
        a: `You can connect as many client tenants as you like on Free. Pro covers a single tenant, with white-label PDF reports under your own brand. MSP covers ${MSP_INCLUDED_TENANTS} client tenants with everything in Pro, one brand across every client report, plus an onboarding call. Further tenants cost ${formatEuro(MSP_EXTRA_TENANT_PRICE.month, "en")} each per month.`,
      },
      {
        q: "Do I need a plan if I self-host?",
        a: "No. The self-hosted edition is MIT licensed and includes every feature without a plan. The paid plans, the uptime target and support apply to the hosted service at licensemeter.com.",
      },
      {
        q: "Can I cancel?",
        a: "Any time, under Plan and billing in your workspace. Your workspace drops back to Free at the end of the period and nothing is deleted.",
      },
    ],
  },
  closing: {
    h2: "Run the scan first. Decide about a paid plan after you see the number.",
    body: "The first scan takes a few minutes and shows what your unused licenses cost per month.",
  },
};

const de: PricingContent = {
  meta: {
    title: "Preise",
    description: `Preise von LicenseMeter: Der Free-Tarif findet und beziffert Lizenzverschwendung in Microsoft 365 kostenlos. Pro (${formatEuro(pro.month, "de")} pro Monat) ergänzt Windows Software Metering über Intune, Support per E-Mail, ein Verfügbarkeitsziel von 99,9 %, einen unterzeichneten Auftragsverarbeitungsvertrag (AVV), einen MCP-Server, White-Label-PDF-Berichte und 24 Monate Verlauf. MSP (${formatEuro(msp.month, "de")} pro Monat) deckt ${MSP_INCLUDED_TENANTS} Kunden-Tenants mit allem aus Pro ab.`,
  },
  breadcrumb: { home: "Startseite", page: "Preise" },
  toggleLabel: "Sprache",
  hero: {
    eyebrow: "Preise",
    h1: {
      pre: "Verschwendung zu finden kostet",
      struck: "Geld",
      post: "nichts.",
    },
    lede: "Starten Sie kostenlos mit allen Scans, Ergebnissen und Berichten. Pro ergänzt Support und Software Metering für Ihre Windows-Apps. MSP deckt Ihr Kundenportfolio ab.",
  },
  billing: {
    legend: "Abrechnungszeitraum",
    month: "Monatlich",
    year: "Jährlich",
    save: "2 Monate gratis",
  },
  per: { free: "dauerhaft", month: "pro Monat", year: "pro Jahr" },
  plansLabel: "Tarife",
  unlimited: {
    title: "Unbegrenzte Nutzer. Unbegrenzte Geräte.",
    body: "Jeder Preis gilt für Ihren gesamten Tenant, egal wie viele Personen und Geräte er umfasst. Keine Gebühren pro Nutzer oder Gerät.",
  },
  trialTag: `${TRIAL_DAYS} Tage Testphase`,
  freeTag: "Open Source · Kein Support",
  recommended: "Empfohlen",
  planDetails: "Alle Tarifdetails",
  soonTitle: "In Vorbereitung",
  newBadge: "Neu",
  cta: {
    free: "Kostenlos starten",
    marketplace: "Im Microsoft Marketplace kaufen",
    card: "Per Karte über Polar zahlen",
    talk: "Sprechen Sie mit uns",
  },
  plans: {
    free: {
      audience: "Für Ihren ersten Scan und mehr",
      highlights: [
        "Alle Scans, Ergebnisse und Berichte",
        "Kein Nutzer- oder Tenant-Limit",
        "12 Monate Verlaufsdaten",
        "Selbst hosten mit Docker",
      ],
      pitch:
        "Das vollständige Produkt. Verbinden Sie einen Tenant, sehen Sie, was ungenutzte Lizenzen pro Monat kosten, und geben Sie der IT das Skript, das es behebt.",
      note: {
        month: "Keine Kreditkarte. Kein Limit für Nutzer oder Tenants.",
        year: "Keine Kreditkarte. Kein Limit für Nutzer oder Tenants.",
      },
      includedTitle: "Enthalten",
      items: [
        {
          text: "Nur lesender Microsoft-365-Scan",
          detail: "Administrator-Einwilligung, keine Schreibberechtigung",
        },
        { text: "Jedes Ergebnis in Euro pro Monat beziffert" },
        {
          text: "Nächtliche Synchronisierung und wöchentliche Zusammenfassung per E-Mail",
        },
        { text: "PDF-Bericht, CSV-Export, PowerShell-Skripte" },
        { text: "Portfolio-Ansicht über alle Kunden-Tenants" },
        { text: "Selbst hosten mit Docker unter der MIT-Lizenz" },
        {
          text: "Kein Support",
          detail: "Support ist in Pro und MSP enthalten",
          off: true,
        },
      ],
    },
    pro: {
      audience: "Für Teams, die Support brauchen",
      highlights: [
        "Alles aus Free für einen Tenant",
        "E-Mail-Support und 99,9 % Verfügbarkeitsziel",
        "Unterzeichneter AVV und MCP-Server",
        "24 Monate Verlaufsdaten",
      ],
      pitch:
        "Alles aus Free für einen Tenant, dazu Support, Software Metering für Ihre Windows-Apps, PDF-Berichte unter Ihrer eigenen Marke, ein unterzeichneter Auftragsverarbeitungsvertrag und ein MCP-Server für Ihren KI-Assistenten.",
      note: {
        month: "Zzgl. USt. Jederzeit kündbar.",
        year: "Zzgl. USt. Zwölf Monate zum Preis von zehn.",
      },
      spotlight: "Software Metering für Windows-Apps",
      includedTitle: "Alles aus Free, zusätzlich",
      items: [
        {
          text: "Windows Software Metering",
          detail:
            "Installiert und gestartet, für jede Windows-App, die Sie über Intune verteilen",
        },
        { text: "Support", detail: "Per E-Mail" },
        {
          text: "Verfügbarkeitsziel von 99,9 %",
          detail: "Nachvollziehbar auf einer öffentlichen Statusseite",
        },
        {
          text: "Unterzeichneter Auftragsverarbeitungsvertrag",
          detail:
            "AVV nach Art. 28 DSGVO, mit Ihrem Unternehmen geschlossen, auf Deutsch oder Englisch",
        },
        {
          text: "MCP-Server",
          detail:
            "Verschwendung, Ergebnisse und Trends aus Claude, Copilot oder jedem MCP-Client abfragen",
        },
        {
          text: "White-Label-PDF-Berichte",
          detail: "Ihr Logo, Name und Ihre Farbe auf jedem Bericht",
        },
        { text: "24 Monate Verlaufsdaten" },
        { text: "Kauf über Ihre Microsoft-Rechnung" },
        { text: "Gilt für einen Tenant" },
      ],
    },
    msp: {
      audience: "Für Ihr Kundenportfolio",
      highlights: [
        "Alles aus Pro",
        `${MSP_INCLUDED_TENANTS} Kunden-Tenants inklusive`,
        "Eine Marke auf jedem Kundenbericht",
        "Kunden-AVV und Onboarding-Gespräch",
      ],
      pitch:
        "Pro für Ihr gesamtes Kundenportfolio, mit Berichten unter Ihrer eigenen Marke und Software Metering auf jedem abgedeckten Kunden-Tenant.",
      note: {
        month: `Zzgl. USt. ${MSP_INCLUDED_TENANTS} Kunden-Tenants inklusive, jeder weitere ${formatEuro(MSP_EXTRA_TENANT_PRICE.month, "de")} pro Monat.`,
        year: `Zzgl. USt. ${MSP_INCLUDED_TENANTS} Kunden-Tenants inklusive, jeder weitere ${formatEuro(MSP_EXTRA_TENANT_PRICE.year, "de")} pro Jahr.`,
      },
      spotlight: "Software Metering auf jedem Kunden-Tenant",
      includedTitle: "Alles aus Pro, zusätzlich",
      items: [
        {
          text: `${MSP_INCLUDED_TENANTS} Kunden-Tenants abgedeckt`,
          detail: "Weitere jederzeit ergänzbar",
        },
        {
          text: "AVV, der Ihre Kunden-Tenants abdeckt",
          detail: "LicenseMeter wird Ihr Unterauftragsverarbeiter",
        },
        { text: "Onboarding-Gespräch" },
      ],
      soon: [
        "Portfolio-Benachrichtigungen",
        "Ein Team für alle Kunden-Tenants",
      ],
    },
  },
  metering: {
    eyebrow: "Enthalten in Pro und MSP",
    h2: "Software Metering: Finden Sie die Windows-Lizenzen, die niemand startet.",
    body: "Sehen Sie für jede Windows-App, die Sie über Intune verteilen, auf wie vielen Geräten sie installiert ist und, sobald LicenseMeter ihre Programmdatei kennt, auf wie vielen sie in den letzten 30, 60 oder 90 Tagen gestartet wurde. Visio, Project, Acrobat Pro, AutoCAD: die Desktop-Lizenzen, die Microsoft-365-Berichte nicht zeigen.",
    points: [
      {
        title: "Jede Windows-App in Intune",
        body: "Win32-, Store-, WinGet- und Branchen-Apps sowie Microsoft 365 Apps, mit Visio und Project als eigenen Einträgen.",
      },
      {
        title: "In drei Schritten eingerichtet",
        body: "LicenseMeter legt das Intune-Remediations-Paket für Sie an, sobald ein Admin bestätigt, oder Sie verteilen das Skript selbst.",
      },
      {
        title: "Live gelesen, nie gespeichert",
        body: "Die Ergebnisse bleiben in Intune. LicenseMeter liest sie, wenn Sie den Bericht öffnen oder exportieren.",
      },
      {
        title: "Keine Benutzernamen",
        body: "Nur Programmnamen und Startzeiten pro Gerät, mit einer eigenen, optionalen Microsoft-Einwilligung.",
      },
    ],
    requirement:
      "Voraussetzung sind über Intune verwaltete Windows-Geräte und eine Lizenz für Remediations, etwa Windows Enterprise E3 oder E5.",
    post: "Zur Ankündigung (EN)",
    docs: "Einrichtungsanleitung (EN)",
  },
  buy: {
    eyebrow: "Zwei Wege zu Pro oder MSP",
    h2: "Nutzen Sie den Weg, den Ihr Einkauf bereits freigegeben hat.",
    sub: "Gleiche Tarife, gleiche Preise, gleicher Funktionsumfang. Ihr Abonnement wird in beiden Fällen Ihrem Tenant zugeordnet.",
    options: [
      {
        kicker: "Option 01",
        channel: "marketplace",
        title: "Microsoft Marketplace",
        body: "Der Betrag erscheint auf Ihrer bestehenden Microsoft-Rechnung, im Rahmen des Vertrags, den Sie bereits haben. Kein neuer Lieferant, keine Kreditkarte, keine gesonderte Bestellung.",
      },
      {
        kicker: "Option 02",
        title: "Polar",
        body: "In einer Minute per Karte bezahlt. Polar ist Ihr Vertragspartner für die Zahlung (Merchant of Record), berechnet die Umsatzsteuer für Ihr Land korrekt und stellt für jeden Abrechnungszeitraum eine ordnungsgemäße Rechnung aus.",
      },
    ],
  },
  compare: {
    eyebrow: "Tarife vergleichen",
    h2: "Aus Free wird nichts herausgenommen.",
    sub: "Die kostenpflichtigen Tarife ergänzen Zusagen und Werkzeuge. Dem kostenlosen Produkt nehmen sie keine Funktionen weg.",
    tableLabel: "Tarifvergleich",
    featureHeader: "Funktion",
    sr: { yes: "Enthalten", no: "Nicht enthalten", na: "Nicht zutreffend" },
    groups: {
      find: "Verschwendung finden",
      act: "Handeln",
      msp: "Für MSPs",
      support: "Support",
      governance: "Datenschutz und Governance",
      buying: "Kauf",
      soon: "In Vorbereitung",
    },
    rows: {
      scan: "Nur lesender Tenant-Scan",
      priced: "Ergebnisse mit Monatskosten beziffert",
      priceBook: "Preisbuch mit verhandelten Konditionen",
      sync: "Nächtliche Synchronisierung und wöchentliche Zusammenfassung",
      history: "Verlaufsdaten",
      reports: "PDF-Bericht und CSV-Export",
      scripts: "Generierte PowerShell-Skripte",
      mcp: "MCP-Server für KI-Assistenten",
      metering: "Windows Software Metering über Intune",
      portfolio: "Portfolio über alle Kunden-Tenants",
      whiteLabel: "White-Label-PDF-Berichte",
      tenantsCovered: "Abgedeckte Kunden-Tenants",
      support: "Support",
      uptime: "Verfügbarkeitsziel",
      onboarding: "Onboarding-Gespräch",
      euData: "Datenspeicherung in der EU (Frankfurt)",
      readOnly: "Nur lesender Zugriff auf Ihren Tenant",
      standardDpa: "Standard-AVV, online akzeptiert",
      signedDpa: "Unterzeichneter AVV mit Ihrem Unternehmen",
      subProcessorDpa:
        "AVV deckt Kunden-Tenants ab (Unterauftragsverarbeitung)",
      marketplace: "Abrechnung über Microsoft Marketplace",
      polar: "Kartenzahlung über Polar",
      portfolioAlerts: "Portfolio-Benachrichtigungen",
      mspTeam: "Ein Team für alle Kunden-Tenants",
    },
    text: {
      history12: "12 Monate",
      history24: "24 Monate",
      oneTenant: "1",
      tenTenantsPlus: `${MSP_INCLUDED_TENANTS}+`,
      noSupport: "Kein Support",
      email: "E-Mail",
      uptime: "99,9 %",
      planned: "Geplant",
    },
  },
  facts: {
    eyebrow: "Was Pro und MSP ergänzen",
    h2: "Ein Ziel, das wir veröffentlichen, statt eines Versprechens, das wir nicht halten können.",
    sub: [
      "Das Verfügbarkeitsziel gilt für den gehosteten Dienst unter licensemeter.com und ist auf der öffentlichen ",
      { text: "Statusseite (EN)", href: "/status" },
      " nachvollziehbar. Es ist ein Ziel, keine vertragliche Garantie. Der ",
      { text: "Auftragsverarbeitungsvertrag (AVV)", href: "/de/dpa" },
      " ist öffentlich einsehbar, bevor Sie etwas verbinden.",
    ],
    items: [
      {
        label: "Verfügbarkeitsziel",
        value: "99,9 %",
        detail: "Monatlich gemessen",
      },
      {
        label: "Status",
        value: "Öffentlich",
        detail: "Live-Statusseite für den Dienst und seine Infrastruktur",
      },
      {
        label: "Support",
        value: "E-Mail",
        detail: "In Pro und MSP, beantwortet von den Menschen, die es bauen",
      },
      {
        label: "Ihre Daten",
        value: "EU",
        detail: "Gespeichert in Frankfurt, AVV in jedem Tarif",
      },
    ],
  },
  faq: {
    eyebrow: "Fragen",
    h2: "Bevor Sie den Einkauf fragen.",
    items: [
      {
        q: "Bleibt Free kostenlos?",
        a: "Ja. LicenseMeter steht unter der MIT-Lizenz, und das gehostete Produkt kennt kein Limit für Nutzer oder Tenants. Die kostenpflichtigen Tarife finanzieren den Support, den unterzeichneten Auftragsverarbeitungsvertrag und die zusätzlichen Werkzeuge. Scan, Ergebnisse und Berichte bleiben davon unberührt.",
      },
      {
        q: "Gibt es Support im Free-Tarif?",
        a: "Nein. Free ist das vollständige Produkt ohne Support. Support per E-Mail ist in Pro und MSP enthalten.",
      },
      {
        q: "Können wir einen Auftragsverarbeitungsvertrag abschließen?",
        a: "Jeder Tarif enthält unseren Standard-Auftragsverarbeitungsvertrag (AVV), der online zusammen mit den Nutzungsbedingungen akzeptiert wird. In Pro und MSP unterzeichnet LicenseMeter, betrieben aus Deutschland, zusätzlich einen AVV nach Art. 28 DSGVO mit Ihrem Unternehmen, auf Deutsch oder Englisch. Die Daten werden in der EU gespeichert. Im MSP-Tarif deckt der Vertrag auch Ihre Kunden-Tenants ab, mit LicenseMeter als Ihrem Unterauftragsverarbeiter.",
      },
      {
        q: "Was bringt mir der MCP-Server?",
        a: "Pro und MSP enthalten einen Model-Context-Protocol-Server für Ihren Workspace. Verbinden Sie ihn mit Claude, Copilot oder einem anderen MCP-Client und stellen Sie Fragen in natürlicher Sprache, etwa welche SKUs im letzten Quartal am meisten Verschwendung verursacht haben. Der Zugriff ist nur lesend und auf die Tenants beschränkt, die Sie ohnehin sehen dürfen.",
      },
      {
        q: "Was ist Software Metering?",
        a: "Pro und MSP enthalten Software Metering für die Windows-Apps, die Sie über Intune verteilen. Für jede App sehen Sie, auf wie vielen Geräten sie installiert ist und auf wie vielen sie im Beobachtungszeitraum gestartet wurde. So erkennen Sie vor einer Verlängerung, welche Desktop-Lizenzen ungenutzt bleiben. Software Metering hat eine eigene, optionale Microsoft-Einwilligung und einen Collector, der als Intune Remediation läuft. Dafür ist eine Lizenz für Remediations nötig, etwa Windows Enterprise E3 oder E5. Die Ergebnisse werden live aus Intune gelesen und nicht gespeichert, Benutzernamen werden nicht erfasst.",
      },
      {
        channel: "marketplace",
        q: "Wie funktioniert der Kauf über den Microsoft Marketplace?",
        a: `Sie schließen das Abonnement im Microsoft Marketplace oder im Azure-Portal ab, melden sich mit demselben Microsoft-Konto bei LicenseMeter an, und Ihr Tarif wird für Ihren Tenant aktiviert. Der Betrag erscheint auf Ihrer Microsoft-Rechnung. Die Testphase von ${TRIAL_DAYS} Tagen gilt dort ebenfalls.`,
      },
      {
        q: "Ich betreibe einen MSP. Welchen Tarif brauche ich?",
        a: `Im Free-Tarif können Sie beliebig viele Kunden-Tenants verbinden. Pro deckt einen einzelnen Tenant ab, mit White-Label-PDF-Berichten unter Ihrer eigenen Marke. MSP deckt ${MSP_INCLUDED_TENANTS} Kunden-Tenants mit allem aus Pro ab, mit einer Marke auf jedem Kundenbericht und einem Onboarding-Gespräch. Jeder weitere Tenant kostet ${formatEuro(MSP_EXTRA_TENANT_PRICE.month, "de")} pro Monat.`,
      },
      {
        q: "Brauche ich einen Tarif, wenn ich selbst hoste?",
        a: "Nein. Die selbst gehostete Edition steht unter der MIT-Lizenz und enthält alle Funktionen ohne Tarif. Die kostenpflichtigen Tarife, das Verfügbarkeitsziel und der Support gelten für den gehosteten Dienst unter licensemeter.com.",
      },
      {
        q: "Kann ich kündigen?",
        a: "Jederzeit, unter „Plan and billing“ in Ihrem Workspace. Ihr Workspace fällt zum Ende des Abrechnungszeitraums auf Free zurück, und es wird nichts gelöscht.",
      },
    ],
  },
  closing: {
    h2: "Starten Sie mit dem Scan. Über einen kostenpflichtigen Tarif entscheiden Sie, wenn Sie die Zahl kennen.",
    body: "Der erste Scan dauert wenige Minuten und zeigt, was Ihre ungenutzten Lizenzen pro Monat kosten.",
  },
};

export const PRICING_CONTENT: Record<PricingLang, PricingContent> = { en, de };

/** Which purchase channels can complete a purchase right now. */
export type PricingChannels = { marketplace: boolean };

/**
 * The page content for one language. A channel that cannot take an order yet
 * is left out entirely, so the page never describes a purchase nobody can make.
 */
export const pricingContent = (
  lang: PricingLang,
  channels: PricingChannels,
): PricingContent => {
  const c = PRICING_CONTENT[lang];
  if (channels.marketplace) return c;
  const open = (item: { channel?: "marketplace" }) => !item.channel;
  return {
    ...c,
    buy: { ...c.buy, options: c.buy.options.filter(open) },
    faq: { ...c.faq, items: c.faq.items.filter(open) },
  };
};

/** The comparison table for one language, built from the shared structure. */
export const comparisonGroups = (
  lang: PricingLang,
  channels: PricingChannels,
): ComparisonGroup[] => {
  const c = PRICING_CONTENT[lang].compare;
  return COMPARISON_GROUPS.map((group) => ({
    id: group.id,
    label: c.groups[group.id],
    soon: group.id === "soon",
    rows: group.rows
      .filter((row) => channels.marketplace || row.id !== "marketplace")
      .map((row) => ({
        id: row.id,
        label: c.rows[row.id],
        isNew: "isNew" in row && row.isNew,
        cells: row.cells.map((cell): ComparisonCell =>
          typeof cell === "string"
            ? { kind: cell }
            : { kind: "text", text: c.text[cell.text] },
        ),
      })),
  }));
};

/** What one plan costs per interval; Free is always zero. */
export const planPrice = (plan: PlanId, interval: BillingInterval): number =>
  plan === "free" ? 0 : PLAN_PRICES[plan][interval];
