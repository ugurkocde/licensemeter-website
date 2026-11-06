import type { Roundup } from "../types";
import { CURRENT, LICENSEMETER_GAPS, SOURCED } from "./shared";

export const zyloAlternatives: Roundup = {
  slug: "zylo-alternatives",
  subject: "zylo",
  title: {
    en: "Zylo alternatives for SaaS license management",
    de: "Zylo-Alternativen für SaaS-Lizenzmanagement",
  },
  description: {
    en: "Alternatives to Zylo for SaaS license and spend management: Torii, BetterCloud, Vertice and LicenseMeter, with sourced features, hosting and prices, and who each one suits.",
    de: "Alternativen zu Zylo für SaaS-Lizenz- und Ausgabenmanagement: Torii, BetterCloud, Vertice und LicenseMeter, mit belegten Funktionen, Hosting und Preisen, und für wen sich welches eignet.",
  },
  intro: [
    {
      en: "Zylo builds a system of record for software spend from finance data and integrations. The alternatives lean in different directions: Torii toward discovery and automation, BetterCloud toward user lifecycle workflows, Vertice toward procurement and negotiation, and LicenseMeter toward a free, read-only look at Microsoft 365 and a handful of other apps.",
      de: "Zylo baut aus Finanzdaten und Integrationen ein zentrales Verzeichnis der Software-Ausgaben. Die Alternativen setzen andere Schwerpunkte: Torii auf Erkennung und Automatisierung, BetterCloud auf Abläufe rund um Konten, Vertice auf Einkauf und Verhandlung, und LicenseMeter auf einen kostenlosen, nur lesenden Blick auf Microsoft 365 und einige weitere Anwendungen.",
    },
    {
      en: "The SaaS management market moved a lot in 2026: Freshworks agreed to buy Torii, CoreStack announced its acquisition of BetterCloud, and Vertice announced its acquisition of Vendr. Each entry below says where things stood when we checked.",
      de: "Der Markt für SaaS-Management hat sich 2026 stark bewegt: Freshworks hat die Übernahme von Torii vereinbart, CoreStack hat die Übernahme von BetterCloud bekanntgegeben, und Vertice hat die Übernahme von Vendr bekanntgegeben. Jeder Eintrag unten nennt den Stand bei unserer Prüfung.",
    },
  ],
  criteria: [
    {
      en: "It manages SaaS licenses or spend across vendors, not only one suite.",
      de: "Es verwaltet SaaS-Lizenzen oder -Ausgaben über mehrere Anbieter, nicht nur eine Suite.",
    },
    CURRENT,
    SOURCED,
  ],
  entries: [
    {
      product: "torii",
      bestFor: {
        en: "Shadow IT discovery and automated joiner, mover and leaver workflows.",
        de: "Erkennung von Schatten-IT und automatisierte Ein-, Wechsel- und Austritts-Workflows.",
      },
      verdict: {
        en: "Hundreds of integrations, no-code workflows that reclaim seats, and Copilot reporting per person. Quote-based.",
        de: "Hunderte Integrationen, No-Code-Workflows zum Zurückholen von Lizenzen und Copilot-Berichte je Person. Preise auf Anfrage.",
      },
    },
    {
      product: "bettercloud",
      bestFor: {
        en: "Automating onboarding and offboarding across Google Workspace and Microsoft 365.",
        de: "Ein- und Austritte über Google Workspace und Microsoft 365 automatisieren.",
      },
      verdict: {
        en: "Deep workflow automation and AI governance, with a free Spend Optimization Basic tier. Data is stored in the United States.",
        de: "Tiefe Workflow-Automatisierung und KI-Governance, mit kostenlosem Tarif Spend Optimization Basic. Daten liegen in den USA.",
      },
    },
    {
      product: "vertice",
      bestFor: {
        en: "Finance and procurement teams that want negotiation done for them.",
        de: "Finanz- und Einkaufsteams, die Verhandlungen abgeben wollen.",
      },
      verdict: {
        en: "Procurement workflows, a large pricing dataset and guaranteed negotiated savings, with EU-primary data storage. Usage comes from SSO data rather than per-app license connectors.",
        de: "Beschaffungs-Workflows, ein großer Preisdatenbestand und garantierte Verhandlungsersparnisse, mit Datenhaltung vorrangig in der EU. Nutzung stammt aus SSO-Daten statt aus Lizenz-Konnektoren je Anwendung.",
      },
    },
    {
      product: "licensemeter",
      bestFor: {
        en: "Microsoft 365-heavy organizations that want waste priced for free before buying a platform.",
        de: "Organisationen mit Schwerpunkt Microsoft 365, die Verschwendung kostenlos beziffern wollen, bevor sie eine Plattform kaufen.",
      },
      verdict: {
        en: `Free, open source and EU-hosted, with deep Microsoft 365 and Copilot findings. No shadow IT discovery. ${LICENSEMETER_GAPS.en}`,
        de: `Kostenlos, quelloffen und in der EU gehostet, mit tiefen Funden zu Microsoft 365 und Copilot. Keine Erkennung von Schatten-IT. ${LICENSEMETER_GAPS.de}`,
      },
    },
  ],
  featureKeys: [
    "nonMicrosoftSaas",
    "shadowItDiscovery",
    "m365InactiveUsers",
    "copilotUsage",
    "costPerFinding",
    "aiApiSpend",
    "renewals",
    "automatedRemediation",
    "freeTier",
    "publicPricing",
    "euHosting",
  ],
  updated: "2026-11-06",
};
