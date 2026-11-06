import type { Product } from "../types";

const PAGE =
  "https://www.enowsoftware.com/products/microsoft-365-license-optimization";
const HOME = "https://www.enowsoftware.com/";
const R140 =
  "https://www.enowsoftware.com/news/enow-365-governance-accelerator-1-4-0";
const R150 =
  "https://www.enowsoftware.com/news/enow-365-governance-accelerator-1-5-0";

export const enow: Product = {
  slug: "enow",
  name: "ENow License Optimization",
  url: PAGE,
  category: "m365",
  checkedOn: "2026-11-06",
  headToHead: false,
  summary: {
    en: "License optimization inside ENow's 365 Governance Accelerator, a hosted platform. It recommends licenses to reclaim or downgrade from inactive, overlapping, duplicate and underused licenses and shows potential annual savings from your own agreement prices. ENow pitches it for Microsoft Enterprise Agreement renewals, with an optional negotiation consulting service.",
    de: "Lizenzoptimierung im 365 Governance Accelerator von ENow, einer gehosteten Plattform. Sie empfiehlt Lizenzen zum Zurückholen oder Verkleinern anhand inaktiver, überlappender, doppelter und wenig genutzter Lizenzen und zeigt mögliche Jahreseinsparungen mit Ihren eigenen Vertragspreisen. ENow positioniert sie für die Verlängerung von Microsoft Enterprise Agreements, mit optionaler Verhandlungsberatung.",
  },
  strengths: [
    {
      en: "Finds overlapping, duplicate and downgrade-candidate licenses, not only unused ones, with a plain-language reason for each recommendation.",
      de: "Findet überlappende, doppelte und verkleinerbare Lizenzen, nicht nur ungenutzte, mit einer verständlichen Begründung je Empfehlung.",
    },
    {
      en: "A consulting service for Enterprise Agreement renewal negotiations.",
      de: "Ein Beratungsangebot für Verhandlungen zur Verlängerung von Enterprise Agreements.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "365 Governance Accelerator Standard Edition is listed at $3,500 a year up to 1,000 users, $6,500 up to 5,000 and $9,500 above. Which edition includes License Optimization is not published.",
    de: "Der 365 Governance Accelerator Standard Edition kostet laut Liste 3.500 $ pro Jahr bis 1.000 Konten, 6.500 $ bis 5.000 und 9.500 $ darüber. In welcher Edition License Optimization enthalten ist, ist nicht veröffentlicht.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Combines account status and last sign-in to find inactive licenses.",
        de: "Verbindet Kontostatus und letzte Anmeldung, um inaktive Lizenzen zu finden.",
      },
      source: R140,
    },
    m365UnassignedSeats: {
      value: "unknown",
      note: {
        en: "Public pages do not mention unassigned purchased seats.",
        de: "Öffentliche Seiten erwähnen keine gekauften, nicht zugewiesenen Lizenzen.",
      },
      source: PAGE,
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "A separate Copilot Center reports Copilot readiness and usage to find underusers.",
        de: "Ein separates Copilot Center berichtet über Bereitschaft und Nutzung, um wenig nutzende Konten zu finden.",
      },
      source: "https://www.enowsoftware.com/solutions/microsoft-365-copilot",
    },
    costPerFinding: {
      value: "yes",
      note: {
        en: "The Over Licensed Users report shows potential annual savings.",
        de: "Der Bericht Over Licensed Users zeigt mögliche Jahreseinsparungen.",
      },
      source: R150,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Savings use your tenant cost settings from your Microsoft agreement.",
        de: "Einsparungen nutzen Ihre Kosteneinstellungen aus dem Microsoft-Vertrag.",
      },
      source: PAGE,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Microsoft 365, Entra ID and on-premises Exchange and Active Directory.",
        de: "Microsoft 365, Entra ID sowie lokales Exchange und Active Directory.",
      },
      source: HOME,
    },
    shadowItDiscovery: {
      value: "partial",
      note: {
        en: "Covers apps registered in Entra ID only.",
        de: "Nur in Entra ID registrierte Anwendungen.",
      },
      source: HOME,
    },
    aiApiSpend: {
      value: "unknown",
      note: {
        en: "Not described on its pages.",
        de: "Auf den Seiten nicht beschrieben.",
      },
      source: HOME,
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "Monitors service performance; software usage metering is not described.",
        de: "Überwacht die Leistung der Dienste; eine Messung der Software-Nutzung ist nicht beschrieben.",
      },
      source: HOME,
    },
    renewals: {
      value: "partial",
      note: {
        en: "Positioned for Enterprise Agreement renewals; no renewal date tracking described.",
        de: "Für Verlängerungen von Enterprise Agreements positioniert; keine Verwaltung von Terminen beschrieben.",
      },
      source: PAGE,
    },
    automatedRemediation: {
      value: "unknown",
      note: {
        en: "Recommendations are reviewed by approvers; automatic removal is not documented.",
        de: "Empfehlungen werden von Freigebenden geprüft; automatisches Entziehen ist nicht dokumentiert.",
      },
      source: R150,
    },
    selfHost: {
      value: "unknown",
      note: {
        en: "Moved into ENow's SaaS platform; a self-hosted option is not stated.",
        de: "In die SaaS-Plattform von ENow umgezogen; eine selbst betriebene Variante ist nicht genannt.",
      },
      source: R140,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: HOME,
    },
    freeTier: {
      value: "no",
      note: {
        en: "No free plan; a free one-off governance assessment exists.",
        de: "Kein kostenloser Tarif; es gibt eine einmalige kostenlose Governance-Bewertung.",
      },
      source: R150,
    },
    publicPricing: {
      value: "partial",
      note: {
        en: "Standard Edition prices are published; which edition includes License Optimization is not.",
        de: "Preise der Standard Edition sind veröffentlicht; welche Edition License Optimization enthält, nicht.",
      },
      source: R140,
    },
    mspMultiTenant: {
      value: "unknown",
      note: { en: "Not mentioned.", de: "Nicht erwähnt." },
      source: HOME,
    },
    euHosting: {
      value: "unknown",
      note: {
        en: "The hosting region is not stated.",
        de: "Die Hosting-Region ist nicht genannt.",
      },
      source: "https://trust.enowsoftware.com/",
    },
  },
};
