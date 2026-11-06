import type { Product } from "../types";

const LEARN = "https://learn.microsoft.com/en-us";
const REPORTS = `${LEARN}/microsoft-365/admin/activity-reports/activity-reports`;
const COPILOT = `${LEARN}/microsoft-365/admin/activity-reports/microsoft-365-copilot-usage`;
const LICENSES = `${LEARN}/microsoft-365/commerce/licenses/subscriptions-and-licenses`;
const OVERVIEW = `${LEARN}/microsoft-365/admin/admin-overview/admin-center-overview`;

/*
 * The admin center belongs in an honest roundup: it is free, included and
 * authoritative. Every cell is sourced from Microsoft Learn. The detailed
 * comparison lives on the hand-written /compare/m365-admin-center page.
 */
export const m365AdminCenterProduct: Product = {
  slug: "m365-admin-center",
  name: "Microsoft 365 admin center",
  url: "https://admin.microsoft.com",
  category: "microsoft",
  checkedOn: "2026-11-06",
  headToHead: false,
  comparePath: "/compare/m365-admin-center",
  summary: {
    en: "Microsoft's own console for every Microsoft 365 tenant: buying and assigning licenses under Billing, and usage reports per workload, including a Copilot usage report, under Reports > Usage.",
    de: "Die Konsole von Microsoft für jeden Microsoft-365-Tenant: Lizenzen kaufen und zuweisen unter Abrechnung, Nutzungsberichte je Dienst einschließlich eines Copilot-Nutzungsberichts unter Berichte > Nutzung.",
  },
  strengths: [
    {
      en: "Included with every tenant and the source of truth for license counts.",
      de: "In jedem Tenant enthalten und maßgeblich für Lizenzzahlen.",
    },
    {
      en: "Where licenses are actually assigned and removed, so nothing extra needs access.",
      de: "Hier werden Lizenzen tatsächlich zugewiesen und entzogen, ohne zusätzlichen Zugriff.",
    },
  ],
  pickThemIf: [
    {
      en: "Your tenant is small enough to review by hand and you only need Microsoft 365.",
      de: "Ihr Tenant ist klein genug für eine Prüfung von Hand und Sie brauchen nur Microsoft 365.",
    },
  ],
  pickUsIf: [
    {
      en: "You want inactive seats joined across workloads per person and priced, every night, without exporting reports.",
      de: "Sie wollen inaktive Lizenzen je Person über alle Dienste zusammengeführt und beziffert, jede Nacht, ohne Berichte zu exportieren.",
    },
  ],
  pricing: {
    en: "Included with every Microsoft 365 subscription.",
    de: "In jedem Microsoft-365-Abonnement enthalten.",
  },
  features: {
    m365InactiveUsers: {
      value: "partial",
      note: {
        en: "Last-activity dates per workload, one report at a time. Joining them per person is up to you.",
        de: "Letzte Aktivität je Dienst, ein Bericht nach dem anderen. Die Zusammenführung je Person bleibt Ihnen überlassen.",
      },
      source: REPORTS,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Billing > Licenses shows assigned and available licenses per product.",
        de: "Abrechnung > Lizenzen zeigt zugewiesene und verfügbare Lizenzen je Produkt.",
      },
      source: LICENSES,
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "The Copilot usage report lists each licensed user's last Copilot activity over up to 180 days. Names are hidden by default.",
        de: "Der Copilot-Nutzungsbericht zeigt für jede lizenzierte Person die letzte Copilot-Aktivität über bis zu 180 Tage. Namen sind standardmäßig ausgeblendet.",
      },
      source: COPILOT,
    },
    costPerFinding: {
      value: "no",
      note: {
        en: "Counts only, no cost attached.",
        de: "Nur Anzahlen, keine Kosten.",
      },
      source: REPORTS,
    },
    customPrices: {
      value: "no",
      note: {
        en: "No place to record negotiated prices.",
        de: "Kein Ort für verhandelte Preise.",
      },
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Microsoft subscriptions only.",
        de: "Nur Microsoft-Abonnements.",
      },
    },
    shadowItDiscovery: {
      value: "no",
      note: {
        en: "Not in the admin center. Microsoft Defender for Cloud Apps, a separate product, discovers cloud apps.",
        de: "Nicht im Admin Center. Microsoft Defender for Cloud Apps, ein separates Produkt, erkennt Cloud-Anwendungen.",
      },
      source: `${LEARN}/defender-cloud-apps/what-is-defender-for-cloud-apps`,
    },
    aiApiSpend: {
      value: "no",
      note: {
        en: "Not covered.",
        de: "Nicht abgedeckt.",
      },
    },
    endpointMetering: {
      value: "no",
      note: {
        en: "Not in the admin center.",
        de: "Nicht im Admin Center.",
      },
    },
    renewals: {
      value: "partial",
      note: {
        en: "Billing > Your products shows each Microsoft subscription's expiration date.",
        de: "Abrechnung > Ihre Produkte zeigt das Ablaufdatum jedes Microsoft-Abonnements.",
      },
      source: `${LEARN}/microsoft-365/commerce/subscriptions/renew-your-subscription`,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "Admins unassign licenses themselves, user by user or in bulk.",
        de: "Admins entziehen Lizenzen selbst, einzeln oder gesammelt.",
      },
      source: LICENSES,
    },
    selfHost: {
      value: "no",
      note: {
        en: "Part of the Microsoft 365 service.",
        de: "Teil des Microsoft-365-Dienstes.",
      },
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Included at no extra cost.",
        de: "Ohne Aufpreis enthalten.",
      },
      source: OVERVIEW,
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "No separate price.",
        de: "Kein separater Preis.",
      },
      source: OVERVIEW,
    },
    mspMultiTenant: {
      value: "partial",
      note: {
        en: "One tenant at a time. Microsoft 365 Lighthouse gives CSP partners a free multi-tenant view focused on security and device management.",
        de: "Ein Tenant nach dem anderen. Microsoft 365 Lighthouse bietet CSP-Partnern eine kostenlose mandantenübergreifende Ansicht mit Fokus auf Sicherheit und Geräte.",
      },
      source: `${LEARN}/microsoft-365/lighthouse/m365-lighthouse-overview`,
    },
    euHosting: {
      value: "yes",
      note: {
        en: "Reports stay inside Microsoft 365, wherever your tenant's data lives.",
        de: "Berichte bleiben in Microsoft 365, wo auch immer Ihre Tenant-Daten liegen.",
      },
      source: `${LEARN}/microsoft-365/enterprise/o365-data-locations`,
    },
  },
};
