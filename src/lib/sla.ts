import type { DpaLang } from "~/lib/dpa";
import { SUPPORT_EMAIL } from "~/lib/support";

/**
 * The Service Level Agreement for paid hosted plans, in English and German.
 * Every number lives in SLA_TERMS so both languages, the pricing page and the
 * Trust Center quote the same values.
 */
export const SLA_TERMS = {
  effectiveIso: "2026-11-13",
  availabilityTargetPct: 99.5,
  credits: [
    { belowPct: 99.5, creditPct: 5 },
    { belowPct: 99.0, creditPct: 10 },
    { belowPct: 95.0, creditPct: 25 },
  ],
  creditClaimDays: 30,
  maintenanceNoticeHours: 48,
  incidentNoticeHours: 48,
  rtoHours: 24,
  rpoHours: 24,
  changeNoticeDays: 30,
  response: {
    criticalBusinessHours: 4,
    highBusinessDays: 1,
    normalBusinessDays: 2,
  },
} as const;

/** "99.5%" in English, "99,5 %" in German, always with one decimal. */
export const formatPct = (value: number, lang: DpaLang): string =>
  lang === "de"
    ? `${value.toFixed(1).replace(".", ",")} %`
    : `${value.toFixed(1)}%`;

/** Whole-number percentages for credits ("5%", "5 %"). */
const creditPct = (value: number, lang: DpaLang): string =>
  lang === "de" ? `${value} %` : `${value}%`;

/** A paragraph that may embed links: plain strings and link parts in order. */
export type SlaPart = string | { text: string; href: string };

export type SlaSection = {
  id: string;
  title: string;
  paragraphs: SlaPart[][];
  list?: string[];
  after?: SlaPart[];
};

export type SlaContent = {
  eyebrow: string;
  title: string;
  effective: string;
  intro: SlaPart[];
  toggleLabel: string;
  sections: SlaSection[];
};

const T = SLA_TERMS;

const creditList = (lang: DpaLang): string =>
  T.credits
    .map(({ belowPct, creditPct: pct }) =>
      lang === "de"
        ? `unter ${formatPct(belowPct, lang)}: ${creditPct(pct, lang)}`
        : `below ${formatPct(belowPct, lang)}: ${creditPct(pct, lang)}`,
    )
    .join(", ");

const EN: SlaContent = {
  eyebrow: "Service Level Agreement",
  title: "LicenseMeter Service Level Agreement",
  effective: "Effective 13 November 2026",
  intro: [
    "What we commit to on paid plans: availability, service credits, support hours and response times, incident notification and recovery objectives. Questions go to ",
    { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    ".",
  ],
  toggleLabel: "Choose language",
  sections: [
    {
      id: "scope",
      title: "Scope",
      paragraphs: [
        [
          "This SLA applies to the hosted LicenseMeter service on paid plans, regardless of purchase channel (direct, invoice or Microsoft Marketplace).",
        ],
      ],
    },
    {
      id: "availability",
      title: "Availability",
      paragraphs: [
        [
          `We target ${formatPct(T.availabilityTargetPct, "en")} monthly availability of the LicenseMeter web application and API. Excluded from the calculation: scheduled maintenance announced at least ${T.maintenanceNoticeHours} hours in advance and performed outside 08:00 to 18:00 CET/CEST on business days; outages of Microsoft 365, Microsoft Graph or Entra ID; issues caused by the customer's tenant configuration, revoked consent or network; and events beyond our reasonable control. Scheduled data synchronisation (typically nightly) is a feature, not part of availability.`,
        ],
      ],
    },
    {
      id: "service-credits",
      title: "Service credits",
      paragraphs: [
        [
          `If monthly availability falls below target, the customer receives a credit on the monthly fee for the affected month: ${creditList("en")}. Credits must be requested within ${T.creditClaimDays} days after the end of the affected month via the support address, are applied to the next billing period, and are the sole remedy for availability shortfalls. For Microsoft Marketplace purchases, credits are applied as agreed with the customer.`,
        ],
      ],
    },
    {
      id: "support",
      title: "Support",
      paragraphs: [
        [
          "Support is available by email at ",
          { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
          " and the ",
          { text: "support form", href: "/support" },
          ", Monday to Friday, 09:00 to 17:00 CET/CEST, excluding public holidays in North Rhine-Westphalia, Germany. Response times:",
        ],
      ],
      list: [
        `Critical (service unavailable for all users, or suspected security incident): ${T.response.criticalBusinessHours} business hours`,
        `High (core feature unusable, no workaround): ${T.response.highBusinessDays} business day`,
        `Normal (questions, minor issues, feature requests): ${T.response.normalBusinessDays} business days`,
      ],
      after: [
        "Response time means a first response by a person, not resolution.",
      ],
    },
    {
      id: "security-incidents",
      title: "Security incidents",
      paragraphs: [
        [
          `Customers affected by a security incident involving their data are notified without undue delay and at the latest within ${T.incidentNoticeHours} hours of confirmation.`,
        ],
      ],
    },
    {
      id: "recovery",
      title: "Data protection and recovery",
      paragraphs: [
        [
          `The production database is backed up daily. Recovery objectives: restoration within ${T.rtoHours} hours (RTO) with at most ${T.rpoHours} hours of data loss (RPO).`,
        ],
      ],
    },
    {
      id: "changes",
      title: "Changes",
      paragraphs: [
        [
          `We may update this SLA with ${T.changeNoticeDays} days' notice. Changes never reduce commitments during a paid term already in effect.`,
        ],
      ],
    },
  ],
};

const DE: SlaContent = {
  eyebrow: "Service Level Agreement",
  title: "Service Level Agreement für LicenseMeter",
  effective: "Gültig ab 13. November 2026",
  intro: [
    "Was wir in den kostenpflichtigen Tarifen zusagen: Verfügbarkeit, Servicegutschriften, Supportzeiten und Reaktionszeiten, Benachrichtigung bei Sicherheitsvorfällen und Wiederherstellungsziele. Fragen richten Sie an ",
    { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    ".",
  ],
  toggleLabel: "Sprache wählen",
  sections: [
    {
      id: "scope",
      title: "Geltungsbereich",
      paragraphs: [
        [
          "Dieses SLA gilt für den gehosteten LicenseMeter-Dienst in den kostenpflichtigen Tarifen, unabhängig vom Bezugsweg (direkt, auf Rechnung oder über den Microsoft Marketplace).",
        ],
      ],
    },
    {
      id: "availability",
      title: "Verfügbarkeit",
      paragraphs: [
        [
          `Wir streben eine monatliche Verfügbarkeit der LicenseMeter-Webanwendung und -API von ${formatPct(T.availabilityTargetPct, "de")} an. Nicht in die Berechnung einbezogen werden: geplante Wartungsarbeiten, die mindestens ${T.maintenanceNoticeHours} Stunden im Voraus angekündigt und an Werktagen außerhalb von 08:00 bis 18:00 Uhr MEZ/MESZ durchgeführt werden; Ausfälle von Microsoft 365, Microsoft Graph oder Entra ID; Störungen, die durch die Tenant-Konfiguration, eine widerrufene Einwilligung oder das Netzwerk des Kunden verursacht werden; sowie Ereignisse außerhalb unseres zumutbaren Einflussbereichs. Die geplante Datensynchronisierung (in der Regel nächtlich) ist eine Funktion und nicht Teil der Verfügbarkeit.`,
        ],
      ],
    },
    {
      id: "service-credits",
      title: "Servicegutschriften",
      paragraphs: [
        [
          `Unterschreitet die monatliche Verfügbarkeit das Ziel, erhält der Kunde eine Gutschrift auf die Monatsgebühr des betroffenen Monats: ${creditList("de")}. Gutschriften sind innerhalb von ${T.creditClaimDays} Tagen nach Ende des betroffenen Monats über die Support-Adresse anzufordern, werden im nächsten Abrechnungszeitraum verrechnet und sind der einzige Anspruch bei Unterschreitung der Verfügbarkeit. Bei Käufen über den Microsoft Marketplace werden Gutschriften so gewährt, wie mit dem Kunden vereinbart.`,
        ],
      ],
    },
    {
      id: "support",
      title: "Support",
      paragraphs: [
        [
          "Support ist per E-Mail an ",
          { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
          " und über das ",
          { text: "Support-Formular (EN)", href: "/support" },
          " erreichbar, Montag bis Freitag von 09:00 bis 17:00 Uhr MEZ/MESZ, ausgenommen gesetzliche Feiertage in Nordrhein-Westfalen. Reaktionszeiten:",
        ],
      ],
      list: [
        `Kritisch (Dienst für alle Nutzer nicht verfügbar oder Verdacht auf einen Sicherheitsvorfall): ${T.response.criticalBusinessHours} Geschäftsstunden`,
        `Hoch (Kernfunktion nicht nutzbar, keine Umgehungslösung): ${T.response.highBusinessDays} Geschäftstag`,
        `Normal (Fragen, kleinere Probleme, Funktionswünsche): ${T.response.normalBusinessDays} Geschäftstage`,
      ],
      after: [
        "Reaktionszeit bedeutet eine erste Antwort durch einen Menschen, nicht die Lösung.",
      ],
    },
    {
      id: "security-incidents",
      title: "Sicherheitsvorfälle",
      paragraphs: [
        [
          `Kunden, deren Daten von einem Sicherheitsvorfall betroffen sind, werden unverzüglich benachrichtigt, spätestens ${T.incidentNoticeHours} Stunden nach dessen Bestätigung.`,
        ],
      ],
    },
    {
      id: "recovery",
      title: "Datenschutz und Wiederherstellung",
      paragraphs: [
        [
          `Die Produktionsdatenbank wird täglich gesichert. Wiederherstellungsziele: Wiederherstellung innerhalb von ${T.rtoHours} Stunden (RTO) bei höchstens ${T.rpoHours} Stunden Datenverlust (RPO).`,
        ],
      ],
    },
    {
      id: "changes",
      title: "Änderungen",
      paragraphs: [
        [
          `Wir können dieses SLA mit einer Frist von ${T.changeNoticeDays} Tagen ändern. Änderungen verringern niemals die Zusagen während einer bereits laufenden bezahlten Laufzeit.`,
        ],
      ],
    },
  ],
};

export const SLA_CONTENT: Record<DpaLang, SlaContent> = { en: EN, de: DE };

/** The SLA's public path in each language. */
export const SLA_PATH: Record<DpaLang, string> = { en: "/sla", de: "/de/sla" };
