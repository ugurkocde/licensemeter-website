import type { Product } from "../types";

const PRICING = "https://www.vertice.one/pricing";
const INTEGRATIONS = "https://www.vertice.one/platform/integrations";
const USAGE = "https://www.vertice.one/platform/saas-usage-analytics";
const CONTRACTS = "https://www.vertice.one/platform/contract-management";

export const vertice: Product = {
  slug: "vertice",
  name: "Vertice",
  url: "https://www.vertice.one",
  category: "smp",
  checkedOn: "2026-11-06",
  headToHead: false,
  summary: {
    en: "A platform for finance and procurement teams: intake-to-procure workflows, vendor, risk and contract management, SaaS usage analytics, a software pricing dataset and negotiation with guaranteed savings, plus cloud and AI cost optimization. Vertice announced its acquisition of Vendr on 1 June 2026.",
    de: "Eine Plattform für Finanz- und Einkaufsteams: Beschaffungs-Workflows von der Anfrage bis zur Bestellung, Lieferanten-, Risiko- und Vertragsverwaltung, SaaS-Nutzungsanalyse, ein Datenbestand zu Software-Preisen und Verhandlung mit garantierten Einsparungen, dazu Kostenoptimierung für Cloud und KI. Vertice hat die Übernahme von Vendr am 1. Juni 2026 bekanntgegeben.",
  },
  strengths: [
    {
      en: "Negotiation as a service, with savings contractually guaranteed on the SaaS Purchasing plan.",
      de: "Verhandlung als Dienstleistung, mit vertraglich garantierten Einsparungen im Tarif SaaS Purchasing.",
    },
    {
      en: "Pricing intelligence on 32,000+ vendors, enlarged by the Vendr acquisition.",
      de: "Preisdaten zu über 32.000 Anbietern, erweitert durch die Übernahme von Vendr.",
    },
    {
      en: "Procurement workflows LicenseMeter does not attempt: intake, approvals, vendor risk and contract management.",
      de: "Beschaffungs-Workflows, die LicenseMeter nicht abdeckt: Anfragen, Freigaben, Lieferantenrisiko und Vertragsverwaltung.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "Published starting prices: Intake-to-Procure from $30,000, SaaS Purchasing from $40,000, Cloud Cost Optimization from $20,000. The page does not say per what period.",
    de: "Veröffentlichte Einstiegspreise: Intake-to-Procure ab 30.000 $, SaaS Purchasing ab 40.000 $, Cloud Cost Optimization ab 20.000 $. Für welchen Zeitraum, sagt die Seite nicht.",
  },
  features: {
    m365InactiveUsers: {
      value: "partial",
      note: {
        en: "Finds underused licenses from SSO sign-in data (Entra ID, Okta); no Microsoft 365-specific report documented.",
        de: "Findet wenig genutzte Lizenzen aus SSO-Anmeldedaten (Entra ID, Okta); kein eigener Microsoft-365-Bericht dokumentiert.",
      },
      source: INTEGRATIONS,
    },
    m365UnassignedSeats: {
      value: "unknown",
      note: { en: "Not described.", de: "Nicht beschrieben." },
      source: USAGE,
    },
    copilotUsage: {
      value: "unknown",
      note: {
        en: "Microsoft 365 Copilot is not mentioned.",
        de: "Microsoft 365 Copilot wird nicht erwähnt.",
      },
      source: "https://www.vertice.one/platform/ai-cost-optimization",
    },
    costPerFinding: {
      value: "unknown",
      note: {
        en: "Flags cost-saving opportunities; a figure per unused-license finding is not shown.",
        de: "Zeigt Einsparmöglichkeiten; eine Zahl je ungenutzter Lizenz wird nicht gezeigt.",
      },
      source: "https://www.vertice.one/explore/saas-license-management",
    },
    customPrices: {
      value: "partial",
      note: {
        en: "Costs come from uploaded contracts and ERP spend; per-license price entry is not documented.",
        de: "Kosten stammen aus hochgeladenen Verträgen und ERP-Ausgaben; die Eingabe von Preisen je Lizenz ist nicht dokumentiert.",
      },
      source: CONTRACTS,
    },
    nonMicrosoftSaas: {
      value: "partial",
      note: {
        en: "Spend and contracts for any vendor and usage through SSO; no direct license connectors listed.",
        de: "Ausgaben und Verträge für jeden Anbieter und Nutzung über SSO; keine direkten Lizenz-Konnektoren aufgeführt.",
      },
      source: INTEGRATIONS,
    },
    shadowItDiscovery: {
      value: "yes",
      note: {
        en: "Detects unknown and unauthorized SaaS subscriptions from SSO data.",
        de: "Erkennt unbekannte und nicht genehmigte SaaS-Abonnements aus SSO-Daten.",
      },
      source: USAGE,
    },
    aiApiSpend: {
      value: "yes",
      note: {
        en: "AI cost optimization across OpenAI, Anthropic and Cursor.",
        de: "KI-Kostenoptimierung über OpenAI, Anthropic und Cursor.",
      },
      source: "https://www.vertice.one/platform/ai-cost-optimization",
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "No endpoint agent mentioned.",
        de: "Kein Endgeräte-Agent erwähnt.",
      },
      source: INTEGRATIONS,
    },
    renewals: {
      value: "yes",
      note: {
        en: "Renewal deadlines and notice periods with alerts by email, Slack or Teams.",
        de: "Verlängerungstermine und Kündigungsfristen mit Alarmen per E-Mail, Slack oder Teams.",
      },
      source: CONTRACTS,
    },
    automatedRemediation: {
      value: "partial",
      note: {
        en: "The Entra ID integration is said to reclaim licenses during offboarding; the mechanism is not documented.",
        de: "Die Entra-ID-Integration soll Lizenzen bei Austritten zurückholen; wie, ist nicht dokumentiert.",
      },
      source: INTEGRATIONS,
    },
    selfHost: {
      value: "unknown",
      note: {
        en: "Sold as a hosted platform; a self-hosted edition is not documented.",
        de: "Als gehostete Plattform angeboten; eine selbst betriebene Edition ist nicht dokumentiert.",
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
        en: "The cheapest product starts from $20,000.",
        de: "Das günstigste Produkt beginnt bei 20.000 $.",
      },
      source: PRICING,
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "Starting prices are published.",
        de: "Einstiegspreise sind veröffentlicht.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "unknown",
      note: { en: "Not mentioned.", de: "Nicht erwähnt." },
      source: PRICING,
    },
    euHosting: {
      value: "yes",
      note: {
        en: "Personal data is primarily stored and processed in the European Economic Area.",
        de: "Personenbezogene Daten werden vorrangig im Europäischen Wirtschaftsraum gespeichert und verarbeitet.",
      },
      source: "https://www.vertice.one/legal",
    },
  },
};
