import type { Product } from "../types";

const PRICING = "https://zylo.com/pricing";
const STACK = "https://zylo.com/blog/does-zylo-work-with-your-tech-stack";
const SAVINGS = "https://zylo.com/product/savings-center/";

export const zylo: Product = {
  slug: "zylo",
  name: "Zylo",
  url: "https://zylo.com",
  category: "smp",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A hosted SaaS and AI spend management platform for enterprises. It builds a system of record for software spend, usage, AI consumption and contracts, mainly from finance data and direct integrations, with license reclamation, renewal management and optional managed services for operations and negotiation.",
    de: "Eine gehostete Plattform für SaaS- und KI-Ausgaben in Konzernen. Sie baut ein zentrales Verzeichnis für Software-Ausgaben, Nutzung, KI-Verbrauch und Verträge auf, vor allem aus Finanzdaten und direkten Integrationen, mit Rückholung von Lizenzen, Verlängerungsmanagement und optionalen Diensten für Betrieb und Verhandlung.",
  },
  strengths: [
    {
      en: "Sees paid apps across the whole portfolio: discovery from finance data, 61 direct integrations and a no-code connector for the rest.",
      de: "Sieht bezahlte Anwendungen im gesamten Portfolio: Erkennung aus Finanzdaten, 61 direkte Integrationen und ein No-Code-Konnektor für den Rest.",
    },
    {
      en: "Pricing benchmarks and a managed negotiation service for renewals.",
      de: "Preis-Benchmarks und ein Verhandlungsservice für Verlängerungen.",
    },
    {
      en: "Maps licenses to contracts, benchmarks and usage to size and rank savings, with a renewal calendar.",
      de: "Ordnet Lizenzen Verträgen, Benchmarks und Nutzung zu, um Einsparungen zu beziffern und zu priorisieren, mit Verlängerungskalender.",
    },
    {
      en: "Acts on findings: removes or downgrades Office 365 licenses inside Zylo and runs reclamation workflows that survey users first.",
      de: "Handelt bei Funden: entzieht oder verkleinert Office-365-Lizenzen direkt in Zylo und startet Rückhol-Workflows, die vorher bei den Personen nachfragen.",
    },
  ],
  pickThemIf: [
    {
      en: "You manage a large software portfolio across many vendors and need spend, contracts and renewals in one system of record.",
      de: "Sie verwalten ein großes Software-Portfolio über viele Anbieter und brauchen Ausgaben, Verträge und Verlängerungen in einem zentralen Verzeichnis.",
    },
    {
      en: "You want help negotiating renewals, not only the data for them.",
      de: "Sie wollen Unterstützung bei Verlängerungsverhandlungen, nicht nur die Daten dafür.",
    },
  ],
  pickUsIf: [
    {
      en: "Most of your waste is in Microsoft 365 and Copilot, and you want it found and priced today, for free.",
      de: "Der Großteil Ihrer Verschwendung liegt in Microsoft 365 und Copilot, und Sie wollen sie heute finden und beziffern, kostenlos.",
    },
    {
      en: "You need EU hosting, a self-hosted install, or read-only access.",
      de: "Sie brauchen Hosting in der EU, eine selbst betriebene Installation oder nur lesenden Zugriff.",
    },
  ],
  pricing: {
    en: "Quote-based. Three plans (Core, Premium, Enterprise) with no published prices and no free plan.",
    de: "Auf Anfrage. Drei Tarife (Core, Premium, Enterprise) ohne veröffentlichte Preise und ohne kostenlosen Tarif.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Pinpoints inactive or low-use Microsoft 365 licenses and alerts when former employees keep access.",
        de: "Findet inaktive oder wenig genutzte Microsoft-365-Lizenzen und warnt, wenn ehemalige Beschäftigte Zugriff behalten.",
      },
      source: "https://zylo.com/blog/microsoft-365-license-management",
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Shows whether licenses are used, underused or unassigned, described for licenses in general.",
        de: "Zeigt, ob Lizenzen genutzt, wenig genutzt oder nicht zugewiesen sind, beschrieben für Lizenzen allgemein.",
      },
      source: "https://zylo.com/solutions/license-waste",
    },
    copilotUsage: {
      value: "unknown",
      note: {
        en: "No page found on Microsoft 365 Copilot seat usage.",
        de: "Keine Seite zur Nutzung von Microsoft-365-Copilot-Lizenzen gefunden.",
      },
      source: STACK,
    },
    costPerFinding: {
      value: "yes",
      note: {
        en: "The Savings Center estimates the financial impact of each savings opportunity.",
        de: "Das Savings Center schätzt die finanzielle Wirkung jeder Einsparmöglichkeit.",
      },
      source: SAVINGS,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Unit costs come from your own contracts, transactions and spend.",
        de: "Stückkosten stammen aus Ihren eigenen Verträgen, Buchungen und Ausgaben.",
      },
      source: SAVINGS,
    },
    nonMicrosoftSaas: {
      value: "yes",
      note: {
        en: "61 direct integrations plus a no-code Usage Connect option.",
        de: "61 direkte Integrationen plus No-Code-Option Usage Connect.",
      },
      source: STACK,
    },
    shadowItDiscovery: {
      value: "yes",
      note: {
        en: "App discovery, mainly from financial data, so free apps usually do not appear.",
        de: "Erkennung von Anwendungen, vor allem aus Finanzdaten, kostenlose Anwendungen erscheinen daher meist nicht.",
      },
      source: STACK,
    },
    aiApiSpend: {
      value: "yes",
      note: {
        en: "OpenAI and Anthropic cost integrations, by SKU, project or account.",
        de: "Kosten-Integrationen für OpenAI und Anthropic, nach SKU, Projekt oder Konto.",
      },
      source: STACK,
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "No desktop or endpoint agent mentioned.",
        de: "Kein Desktop- oder Endgeräte-Agent erwähnt.",
      },
      source: "https://zylo.com/product/integrations",
    },
    renewals: {
      value: "yes",
      note: {
        en: "Renewal calendar from contract, spend and app data, with renewal support.",
        de: "Verlängerungskalender aus Vertrags-, Ausgaben- und Anwendungsdaten, mit Unterstützung bei Verlängerungen.",
      },
      source: "https://zylo.com/solutions/renewal-savings",
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Removes or downgrades Office 365 licenses inside Zylo; Premium adds Okta and Entra actions.",
        de: "Entzieht oder verkleinert Office-365-Lizenzen in Zylo; Premium ergänzt Aktionen für Okta und Entra.",
      },
      source: "https://zylo.com/blog/optimize-microsoft-office-365-licenses",
    },
    selfHost: {
      value: "no",
      note: {
        en: "Hosted SaaS; no self-hosted edition documented.",
        de: "Gehostetes SaaS; keine selbst betriebene Edition dokumentiert.",
      },
      source: PRICING,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: PRICING,
    },
    freeTier: {
      value: "no",
      note: {
        en: "All three plans are quote-based.",
        de: "Alle drei Tarife nur auf Anfrage.",
      },
      source: PRICING,
    },
    publicPricing: {
      value: "no",
      note: {
        en: "Plan features are published, prices are not.",
        de: "Funktionen der Tarife sind veröffentlicht, Preise nicht.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "unknown",
      note: {
        en: "No MSP program found; Enterprise supports multiple business units.",
        de: "Kein MSP-Programm gefunden; Enterprise unterstützt mehrere Geschäftsbereiche.",
      },
      source: PRICING,
    },
    euHosting: {
      value: "no",
      note: {
        en: "Personal data is processed in the United States under the EU-U.S. Data Privacy Framework; no EU region documented.",
        de: "Personenbezogene Daten werden in den USA unter dem EU-U.S. Data Privacy Framework verarbeitet; keine EU-Region dokumentiert.",
      },
      source: "https://zylo.com/privacy-policy",
    },
  },
};
