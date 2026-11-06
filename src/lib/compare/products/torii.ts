import type { Product } from "../types";

const SMP = "https://www.toriihq.com/products/saas-management-product";
const ENTRA =
  "https://www.toriihq.com/articles/how-to-find-license-count-entra-id";
const M365 =
  "https://support.toriihq.com/hc/en-us/articles/5192093877659-Microsoft-365-Office-365-Integration";
const PRICING = "https://www.toriihq.com/pricing";

export const torii: Product = {
  slug: "torii",
  name: "Torii",
  url: "https://www.toriihq.com",
  category: "smp",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A hosted SaaS and AI management platform that discovers the SaaS and AI stack, reclaims wasted spend and automates onboarding and offboarding, sold as SaaS management, identity governance and AI management. Freshworks agreed to acquire Torii on 12 October 2026; when we checked, the deal had not closed and Torii said it operates independently until then.",
    de: "Eine gehostete Plattform für SaaS und KI, die den Anwendungsbestand aufspürt, verschwendete Ausgaben zurückholt und Ein- und Austritte automatisiert, angeboten als SaaS-Management, Identity Governance und KI-Management. Freshworks hat am 12. Oktober 2026 die Übernahme von Torii vereinbart; bei unserer Prüfung war sie noch nicht abgeschlossen, und Torii arbeitet bis dahin nach eigener Aussage eigenständig.",
  },
  strengths: [
    {
      en: "Hundreds of pre-built integrations, plus an AI builder, API and CSV for the rest.",
      de: "Hunderte fertige Integrationen, dazu ein KI-Builder, API und CSV für den Rest.",
    },
    {
      en: "No-code workflows that act on findings, including an Unassign Microsoft 365 license action and approvals in Slack.",
      de: "No-Code-Workflows, die bei Funden handeln, darunter eine Aktion zum Entziehen von Microsoft-365-Lizenzen und Freigaben in Slack.",
    },
    {
      en: "Shadow IT discovery from a browser extension, OAuth grants, SSO and finance data.",
      de: "Erkennung von Schatten-IT über Browser-Erweiterung, OAuth-Freigaben, SSO und Finanzdaten.",
    },
    {
      en: "Microsoft 365 Copilot reporting with prompts and active days per person and dormant-seat detection.",
      de: "Berichte zu Microsoft 365 Copilot mit Prompts und aktiven Tagen je Person und Erkennung ruhender Lizenzen.",
    },
  ],
  pickThemIf: [
    {
      en: "You need shadow IT discovery and automated joiner, mover and leaver workflows across hundreds of apps.",
      de: "Sie brauchen Erkennung von Schatten-IT und automatisierte Ein-, Wechsel- und Austritts-Workflows über hunderte Anwendungen.",
    },
    {
      en: "You want identity governance and access reviews from the same vendor.",
      de: "Sie wollen Identity Governance und Zugriffsprüfungen vom selben Anbieter.",
    },
  ],
  pickUsIf: [
    {
      en: "You want Microsoft 365 waste found and priced without a sales process or a platform budget.",
      de: "Sie wollen Microsoft-365-Verschwendung finden und beziffern, ohne Vertriebsprozess und ohne Plattform-Budget.",
    },
    {
      en: "You need EU hosting, a self-hosted install, or read-only access.",
      de: "Sie brauchen Hosting in der EU, eine selbst betriebene Installation oder nur lesenden Zugriff.",
    },
  ],
  pricing: {
    en: "Quote-based, with no public price list and no free plan.",
    de: "Auf Anfrage, ohne öffentliche Preisliste und ohne kostenlosen Tarif.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Marks licenses inactive after an inactivity period (default 30 days) and can disable Entra ID users for leavers.",
        de: "Markiert Lizenzen nach einer Inaktivitätsdauer (Standard 30 Tage) als inaktiv und kann Entra-ID-Konten bei Austritten deaktivieren.",
      },
      source: ENTRA,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Splits license totals into active, inactive and unassigned.",
        de: "Teilt Lizenzbestände in aktiv, inaktiv und nicht zugewiesen.",
      },
      source: ENTRA,
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "With the AI module: Copilot seats, prompts and active days per person over 7 to 180 days, and seats with no prompts in 90 days.",
        de: "Mit dem KI-Modul: Copilot-Lizenzen, Prompts und aktive Tage je Person über 7 bis 180 Tage sowie Lizenzen ohne Prompt in 90 Tagen.",
      },
      source: M365,
    },
    costPerFinding: {
      value: "yes",
      note: {
        en: "Each downgrade or reclamation shows its savings impact.",
        de: "Jede Verkleinerung oder Rückholung zeigt ihre Einsparung.",
      },
      source: SMP,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Copilot cost uses the license price you record in Torii.",
        de: "Copilot-Kosten nutzen den Lizenzpreis, den Sie in Torii hinterlegen.",
      },
      source: M365,
    },
    nonMicrosoftSaas: {
      value: "yes",
      note: {
        en: "Hundreds of pre-built integrations, no exact count published.",
        de: "Hunderte fertige Integrationen, keine genaue Zahl veröffentlicht.",
      },
      source: "https://www.toriihq.com/integration",
    },
    shadowItDiscovery: {
      value: "yes",
      note: {
        en: "Browser extension, OAuth grants, identity, finance and procurement sources.",
        de: "Browser-Erweiterung, OAuth-Freigaben, Identitäts-, Finanz- und Einkaufsquellen.",
      },
      source: SMP,
    },
    aiApiSpend: {
      value: "yes",
      note: {
        en: "Tracks OpenAI API keys and token volume by model; Anthropic is a connected vendor.",
        de: "Verfolgt OpenAI-API-Schlüssel und Token-Volumen je Modell; Anthropic ist angebunden.",
      },
      source: "https://www.toriihq.com/products/openai-spend-management",
    },
    endpointMetering: {
      value: "partial",
      note: {
        en: "No agent of its own; imports app and, for some sources, usage data from MDM tools such as Jamf and Intune.",
        de: "Kein eigener Agent; übernimmt Anwendungs- und teils Nutzungsdaten aus MDM-Werkzeugen wie Jamf und Intune.",
      },
      source:
        "https://support.toriihq.com/hc/en-us/articles/5129309596955-Application-Usage-Data",
    },
    renewals: {
      value: "yes",
      note: {
        en: "Contract ingestion, renewal clause detection and alerts.",
        de: "Vertragserfassung, Erkennung von Verlängerungsklauseln und Alarme.",
      },
      source: SMP,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Workflows reclaim seats after an inactivity threshold, with Slack approvals.",
        de: "Workflows holen Lizenzen nach einer Inaktivitätsschwelle zurück, mit Freigabe in Slack.",
      },
      source: ENTRA,
    },
    selfHost: {
      value: "no",
      note: {
        en: "Torii states there is no on-premise deployment option.",
        de: "Laut Torii gibt es keine lokale Installation.",
      },
      source:
        "https://www.toriihq.com/articles/seven-best-saas-management-platforms",
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: PRICING,
    },
    freeTier: {
      value: "no",
      note: {
        en: "Every offering leads to a demo request.",
        de: "Jedes Angebot führt zu einer Demo-Anfrage.",
      },
      source: PRICING,
    },
    publicPricing: {
      value: "no",
      note: {
        en: "No public price list.",
        de: "Keine öffentliche Preisliste.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "partial",
      note: {
        en: "An MSP partner track exists; a multi-customer console is not documented.",
        de: "Es gibt ein MSP-Partnerprogramm; eine Konsole für viele Kunden ist nicht dokumentiert.",
      },
      source: "https://www.toriihq.com/partners",
    },
    euHosting: {
      value: "no",
      note: {
        en: "Data is processed in the United States, Israel, Canada and elsewhere; no EU region documented.",
        de: "Daten werden in den USA, Israel, Kanada und anderswo verarbeitet; keine EU-Region dokumentiert.",
      },
      source: "https://www.toriihq.com/privacy-notice",
    },
  },
};
