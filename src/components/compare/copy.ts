import type { FeatureValue, Lang } from "~/lib/compare/types";

/** Page chrome for the vendor pages, roundups and index, per edition. */
export const COMPARE_COPY = {
  en: {
    eyebrow: "Compare",
    vs: "vs",
    home: "Home",
    compareIndex: "Compare",
    feature: "Feature",
    values: {
      yes: "Yes",
      no: "No",
      partial: "Partly",
      unknown: "Not stated",
    } satisfies Record<FeatureValue, string>,
    source: "Source",
    shortAnswer: "The short answer",
    pickThem: (name: string) => `Pick ${name} if`,
    pickUs: "Pick LicenseMeter if",
    strengths: (name: string) => `Where ${name} is stronger`,
    featuresTitle: "Feature by feature",
    featuresNote:
      "Not stated means we could not find it on the vendor's own pages, not that it is missing. Values link to where the claim comes from.",
    pricingTitle: "Pricing",
    checked: (name: string, date: string) =>
      `We last checked ${name}'s own website and documentation on ${date}.`,
    readComparison: (name: string) => `LicenseMeter vs ${name}`,
    howWePicked: "How we picked",
    atAGlance: "At a glance",
    bestFor: "Best for",
    pricing: "Pricing",
    website: "Website",
    sourceCode: "Source code",
    lastActivity: "Last activity",
    license: "License",
    updated: (date: string) => `Updated ${date}.`,
    disclosure:
      "We make LicenseMeter, so weigh its place on this list accordingly. Every other entry is described from its own website, with the gaps we found in LicenseMeter stated as plainly as theirs.",
    otherLang: { label: "Deutsch", lang: "de" },
    indexTitle: "Compare LicenseMeter",
    indexLead:
      "Honest comparisons with the tools and habits people weigh LicenseMeter against. Each one says where the other option is the better choice, and every claim renders from a public data file you can correct.",
    groupStatusQuo: "Against doing it yourself",
    groupVendors: "Against other products",
    groupRoundups: "Roundups",
    englishOnly: "",
    ctaTitle: "See your own number",
    ctaBody:
      "Connect read-only and the free scan prices the disabled, inactive and unassigned seats in your tenant. The security overview lists every permission up front.",
    ctaPrimary: "Run my free scan",
    ctaSample: "Open the sample tenant",
    ctaRequestAccess: "Request scan access",
    ctaNote: "Free, with no time limit. No credit card, read-only access.",
  },
  de: {
    eyebrow: "Vergleich",
    vs: "vs.",
    home: "Startseite",
    compareIndex: "Vergleiche",
    feature: "Funktion",
    values: {
      yes: "Ja",
      no: "Nein",
      partial: "Teilweise",
      unknown: "Keine Angabe",
    } satisfies Record<FeatureValue, string>,
    source: "Quelle",
    shortAnswer: "Die kurze Antwort",
    pickThem: (name: string) => `${name} passt, wenn`,
    pickUs: "LicenseMeter passt, wenn",
    strengths: (name: string) => `Wo ${name} stärker ist`,
    featuresTitle: "Funktion für Funktion",
    featuresNote:
      "Keine Angabe heißt: Wir haben es auf den eigenen Seiten des Anbieters nicht gefunden, nicht dass es fehlt. Werte verlinken ihre Quelle.",
    pricingTitle: "Preise",
    checked: (name: string, date: string) =>
      `Website und Dokumentation von ${name} zuletzt geprüft am ${date}.`,
    readComparison: (name: string) => `LicenseMeter vs. ${name}`,
    howWePicked: "Wie wir ausgewählt haben",
    atAGlance: "Auf einen Blick",
    bestFor: "Am besten für",
    pricing: "Preise",
    website: "Website",
    sourceCode: "Quellcode",
    lastActivity: "Letzte Aktivität",
    license: "Lizenz",
    updated: (date: string) => `Aktualisiert am ${date}.`,
    disclosure:
      "LicenseMeter ist unser eigenes Produkt, gewichten Sie seinen Platz in dieser Liste entsprechend. Alle anderen Einträge beschreiben wir anhand ihrer eigenen Websites, und die Lücken von LicenseMeter nennen wir genauso deutlich wie ihre.",
    otherLang: { label: "English", lang: "en" },
    indexTitle: "LicenseMeter im Vergleich",
    indexLead:
      "Ehrliche Vergleiche mit den Werkzeugen und Gewohnheiten, gegen die LicenseMeter abgewogen wird. Jeder Vergleich sagt, wann die andere Option besser passt, und jede Aussage stammt aus einer öffentlichen Datei, die Sie korrigieren können.",
    groupStatusQuo: "Gegen die Arbeit von Hand",
    groupVendors: "Gegen andere Produkte",
    groupRoundups: "Übersichten",
    englishOnly: " (auf Englisch)",
    ctaTitle: "Sehen Sie Ihre eigene Zahl",
    ctaBody:
      "Verbinden Sie sich nur lesend, und der kostenlose Scan beziffert deaktivierte, inaktive und nicht zugewiesene Lizenzen in Ihrem Tenant. Die Sicherheitsübersicht nennt jede Berechtigung vorab.",
    ctaPrimary: "Kostenlosen Scan starten",
    ctaSample: "Beispiel-Tenant öffnen",
    /** Same fallback SignInButtons shows in English when sign-in is off. */
    ctaRequestAccess: "Scan-Zugang anfragen",
    ctaNote:
      "Kostenlos, ohne Zeitlimit. Keine Kreditkarte, nur lesender Zugriff.",
  },
} as const;

export const compareCopy = (lang: Lang) => COMPARE_COPY[lang];

/** "6 November 2026" / "6. November 2026" */
export const formatCheckedOn = (iso: string, lang: Lang): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(
    lang === "de" ? "de-DE" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );

/** Path of a compare page in an edition. */
export const comparePath = (lang: Lang, slug?: string): string =>
  `${lang === "de" ? "/de" : ""}/compare${slug ? `/${slug}` : ""}`;
