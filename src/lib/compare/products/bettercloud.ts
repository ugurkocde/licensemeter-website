import type { Product } from "../types";

const PRICING = "https://www.bettercloud.com/pricing/";
const M365 = "https://www.bettercloud.com/integrations/microsoft365/";
const AI = "https://www.bettercloud.com/product-updates/ai-governance-arrives/";
const SECURITY = "https://www.bettercloud.com/security-and-compliance/";

export const bettercloud: Product = {
  slug: "bettercloud",
  name: "BetterCloud",
  url: "https://www.bettercloud.com",
  category: "smp",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A hosted SaaS management and AI governance platform focused on automating user lifecycle work across Google Workspace, Microsoft 365 and 100+ other apps, sold as modules on a no-code workflow platform. CoreStack announced its acquisition of BetterCloud on 31 March 2026.",
    de: "Eine gehostete Plattform für SaaS-Management und KI-Governance, die vor allem Abläufe rund um Konten in Google Workspace, Microsoft 365 und über 100 weiteren Anwendungen automatisiert, angeboten als Module auf einer No-Code-Workflow-Plattform. CoreStack hat die Übernahme von BetterCloud am 31. März 2026 bekanntgegeben.",
  },
  strengths: [
    {
      en: "Deep workflow automation: unlimited actions in a no-code builder across 100+ native integrations, for onboarding, offboarding and license reclamation.",
      de: "Tiefe Workflow-Automatisierung: unbegrenzte Aktionen in einem No-Code-Builder über 100 native Integrationen, für Ein- und Austritte und das Zurückholen von Lizenzen.",
    },
    {
      en: "Acts on Microsoft 365 directly: offboarding, license assignment and reclamation, and OneDrive and SharePoint sharing fixes.",
      de: "Handelt direkt in Microsoft 365: Austritte, Zuweisen und Zurückholen von Lizenzen sowie Korrekturen von Freigaben in OneDrive und SharePoint.",
    },
    {
      en: "AI governance: an inventory of AI keys, agents and models across OpenAI, Anthropic, Cursor and GitHub Copilot, with spend per provider.",
      de: "KI-Governance: ein Bestand an KI-Schlüsseln, Agenten und Modellen über OpenAI, Anthropic, Cursor und GitHub Copilot, mit Ausgaben je Anbieter.",
    },
    {
      en: "A free entry tier (Spend Optimization Basic) and a renewal service.",
      de: "Ein kostenloser Einstiegstarif (Spend Optimization Basic) und ein Service für Verlängerungen.",
    },
  ],
  pickThemIf: [
    {
      en: "Your main job is automating onboarding and offboarding across Google Workspace, Microsoft 365 and other apps.",
      de: "Ihre Hauptaufgabe ist die Automatisierung von Ein- und Austritten über Google Workspace, Microsoft 365 und weitere Anwendungen.",
    },
    {
      en: "You want the tool to reclaim licenses itself.",
      de: "Das Werkzeug soll Lizenzen selbst zurückholen.",
    },
  ],
  pickUsIf: [
    {
      en: "You want unassigned seats and unused Microsoft 365 Copilot licenses reported and priced with your own contract prices.",
      de: "Sie wollen nicht zugewiesene Lizenzen und ungenutzte Microsoft-365-Copilot-Lizenzen mit Ihren Vertragspreisen beziffert sehen.",
    },
    {
      en: "You need EU hosting or a self-hosted install; BetterCloud stores customer data in US data centers on Google Cloud.",
      de: "Sie brauchen Hosting in der EU oder eine selbst betriebene Installation; BetterCloud speichert Kundendaten in US-Rechenzentren auf Google Cloud.",
    },
  ],
  pricing: {
    en: "Spend Optimization Basic is free ($0 per month). Paid modules are quoted by license count, connected apps, modules and add-ons.",
    de: "Spend Optimization Basic ist kostenlos (0 $ pro Monat). Bezahlmodule gibt es auf Anfrage, je nach Lizenzanzahl, verbundenen Anwendungen, Modulen und Zusätzen.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Identifies users with inactive or low use of specific apps and reclaims their licenses.",
        de: "Findet Konten mit inaktiver oder geringer Nutzung bestimmter Anwendungen und holt ihre Lizenzen zurück.",
      },
      source: M365,
    },
    m365UnassignedSeats: {
      value: "unknown",
      note: {
        en: "No page found that flags purchased but unassigned Microsoft 365 seats.",
        de: "Keine Seite gefunden, die gekaufte, aber nicht zugewiesene Microsoft-365-Lizenzen ausweist.",
      },
      source: PRICING,
    },
    copilotUsage: {
      value: "unknown",
      note: {
        en: "AI governance covers GitHub Copilot; Microsoft 365 Copilot is not mentioned.",
        de: "Die KI-Governance deckt GitHub Copilot ab; Microsoft 365 Copilot wird nicht erwähnt.",
      },
      source: AI,
    },
    costPerFinding: {
      value: "unknown",
      note: {
        en: "Claims to surface every unused license; whether each carries a cost is not shown.",
        de: "Verspricht, jede ungenutzte Lizenz zu zeigen; ob jede mit Kosten versehen ist, wird nicht gezeigt.",
      },
      source: "https://www.bettercloud.com/monitor/saas-license-management/",
    },
    customPrices: {
      value: "partial",
      note: {
        en: "Contract management and benchmarking; entering per-license prices is not documented.",
        de: "Vertragsverwaltung und Benchmarks; die Eingabe von Preisen je Lizenz ist nicht dokumentiert.",
      },
      source: PRICING,
    },
    nonMicrosoftSaas: {
      value: "yes",
      note: {
        en: "100+ native integrations plus an open API.",
        de: "Über 100 native Integrationen plus offene API.",
      },
      source: "https://www.bettercloud.com/platform/integration-center/",
    },
    shadowItDiscovery: {
      value: "yes",
      note: {
        en: "A Chrome extension, SSO and integrations; AI governance finds unsanctioned AI keys and agents.",
        de: "Chrome-Erweiterung, SSO und Integrationen; die KI-Governance findet nicht freigegebene KI-Schlüssel und Agenten.",
      },
      source: PRICING,
    },
    aiApiSpend: {
      value: "yes",
      note: {
        en: "Inventories OpenAI and Anthropic keys and shows AI spend per provider.",
        de: "Erfasst Schlüssel bei OpenAI und Anthropic und zeigt KI-Ausgaben je Anbieter.",
      },
      source: AI,
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "No desktop or endpoint agent described.",
        de: "Kein Desktop- oder Endgeräte-Agent beschrieben.",
      },
      source: PRICING,
    },
    renewals: {
      value: "yes",
      note: {
        en: "Automatic renewal reminders, contract benchmarking and a renewal service.",
        de: "Automatische Verlängerungserinnerungen, Vertrags-Benchmarks und ein Verlängerungsservice.",
      },
      source: PRICING,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Workflows remove or reassign licenses after a configurable inactivity period.",
        de: "Workflows entziehen oder verschieben Lizenzen nach einer einstellbaren Inaktivitätsdauer.",
      },
      source: M365,
    },
    selfHost: {
      value: "no",
      note: {
        en: "Built and hosted exclusively on Google Cloud.",
        de: "Ausschließlich auf Google Cloud gebaut und gehostet.",
      },
      source: SECURITY,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: PRICING,
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Spend Optimization Basic at $0 per month, with a view of license utilization.",
        de: "Spend Optimization Basic für 0 $ pro Monat, mit Übersicht der Lizenznutzung.",
      },
      source: PRICING,
    },
    publicPricing: {
      value: "partial",
      note: {
        en: "Only the free tier has a price on the page.",
        de: "Nur der kostenlose Tarif hat einen Preis auf der Seite.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "partial",
      note: {
        en: "A partner program and multiple Microsoft 365 tenants (pitched for M&A); no MSP console documented.",
        de: "Ein Partnerprogramm und mehrere Microsoft-365-Tenants (für Firmenübernahmen gedacht); keine MSP-Konsole dokumentiert.",
      },
      source: M365,
    },
    euHosting: {
      value: "no",
      note: {
        en: "Customer personal data is stored in US data centers; EU transfers rely on Standard Contractual Clauses.",
        de: "Personenbezogene Kundendaten liegen in US-Rechenzentren; Übermittlungen aus der EU stützen sich auf Standardvertragsklauseln.",
      },
      source: SECURITY,
    },
  },
};
