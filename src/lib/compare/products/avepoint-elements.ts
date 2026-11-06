import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Product } from "../types";

const PAGE = "https://www.avepoint.com/products/elements/license-optimization";
const ELEMENTS = "https://www.avepoint.com/products/elements";
const GUIDE =
  "https://learn.avepoint.com/elements-user-guide/about-elements.html";
const BROCHURE =
  "https://cdn.avepoint.com/pdfs/en/brochures/Elements-Brochure-License-Optimization.pdf";

export const avepointElements: Product = {
  slug: "avepoint-elements",
  name: "AvePoint Elements",
  url: PAGE,
  category: "m365",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A multi-tenant SaaS platform for MSPs that run Microsoft 365 and Azure services for their clients. License Optimization is one of its modules: it finds unused, oversized and unassigned licenses across client tenants and supports cleanup and reallocation. It comes at no extra cost with the Baseline, Workspace or User and Device Management modules.",
    de: "Eine mandantenfähige SaaS-Plattform für MSPs, die Microsoft 365 und Azure für ihre Kunden betreiben. License Optimization ist eines ihrer Module: Es findet ungenutzte, überdimensionierte und nicht zugewiesene Lizenzen über alle Kunden-Tenants und unterstützt Bereinigung und Umverteilung. Es ist ohne Aufpreis enthalten, wenn Baseline, Workspace oder User and Device Management gekauft werden.",
  },
  strengths: [
    {
      en: "Built for MSPs: dashboards across every client tenant, partner and reseller management, and distributor marketplace integration for purchasing and billing.",
      de: "Für MSPs gebaut: Dashboards über alle Kunden-Tenants, Partner- und Reseller-Verwaltung und Marktplatz-Anbindung an Distributoren für Einkauf und Abrechnung.",
    },
    {
      en: "Acts on findings: unassigns and downgrades licenses, with automated cleanup and reallocation.",
      de: "Handelt bei Funden: entzieht und verkleinert Lizenzen, mit automatischer Bereinigung und Umverteilung.",
    },
    {
      en: "Sits inside a wider managed-service platform for security baselines, devices and workspace governance.",
      de: "Teil einer breiteren Plattform für Managed Services mit Sicherheits-Baselines, Geräten und Workspace-Governance.",
    },
    {
      en: "A wide choice of EU data centers, including Germany West Central.",
      de: "Große Auswahl an Rechenzentren in der EU, darunter Germany West Central.",
    },
  ],
  pickThemIf: [
    {
      en: "You are an MSP standardizing service delivery across many client tenants and want license optimization as one billable service inside that platform.",
      de: "Sie sind ein MSP, der seine Leistungen über viele Kunden-Tenants standardisiert, und wollen Lizenzoptimierung als abrechenbaren Dienst in dieser Plattform.",
    },
    {
      en: "You already buy other Elements modules, so License Optimization costs nothing extra.",
      de: "Sie nutzen bereits andere Elements-Module, damit kostet License Optimization nichts extra.",
    },
  ],
  pickUsIf: [
    {
      en: "You manage your own tenant rather than a client portfolio, or want to start without a partner contract.",
      de: "Sie verwalten Ihren eigenen Tenant statt eines Kundenportfolios, oder wollen ohne Partnervertrag starten.",
    },
    {
      en: "You want unused Copilot seats priced in the same report.",
      de: "Sie wollen ungenutzte Copilot-Lizenzen im selben Bericht beziffert sehen.",
    },
    {
      en: `You also need ${listJoin(NON_MICROSOFT_CONNECTORS)} checked against Entra ID.`,
      de: `Sie wollen auch ${listJoin(NON_MICROSOFT_CONNECTORS, "und")} mit Entra ID abgleichen.`,
    },
  ],
  pricing: {
    en: "Quote-based for partners (Request Pricing). License Optimization is included at no extra cost with Baseline, Workspace or User and Device Management.",
    de: "Auf Anfrage für Partner (Request Pricing). License Optimization ist ohne Aufpreis enthalten bei Baseline, Workspace oder User and Device Management.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Detects inactive or blocked users across client tenants.",
        de: "Erkennt inaktive oder gesperrte Konten über alle Kunden-Tenants.",
      },
      source:
        "https://www.avepoint.com/news/avepoint-launches-new-advanced-security-and-optimization-features-to-elements-platform-250617",
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Identifies unused, oversized or unassigned licenses.",
        de: "Findet ungenutzte, überdimensionierte oder nicht zugewiesene Lizenzen.",
      },
      source: BROCHURE,
    },
    copilotUsage: {
      value: "unknown",
      note: {
        en: "The Elements license pages do not mention Copilot.",
        de: "Die Lizenzseiten von Elements erwähnen Copilot nicht.",
      },
      source: PAGE,
    },
    costPerFinding: {
      value: "unknown",
      note: {
        en: "Public pages describe recovering wasted license cost but do not show a figure per finding.",
        de: "Öffentliche Seiten sprechen von zurückgewonnenen Lizenzkosten, zeigen aber keine Zahl je Fund.",
      },
      source: BROCHURE,
    },
    customPrices: {
      value: "unknown",
      note: {
        en: "The guide lists a License Unit Cost Profile page whose content needs a partner login.",
        de: "Das Handbuch nennt eine Seite License Unit Cost Profile, deren Inhalt einen Partner-Login erfordert.",
      },
      source: GUIDE,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Modules cover Microsoft 365 and Azure.",
        de: "Die Module decken Microsoft 365 und Azure ab.",
      },
      source: ELEMENTS,
    },
    shadowItDiscovery: {
      value: "unknown",
      note: {
        en: "An app management module is listed as a preview without detail.",
        de: "Ein Modul zur Anwendungsverwaltung ist als Vorschau ohne Details aufgeführt.",
      },
      source: GUIDE,
    },
    aiApiSpend: {
      value: "unknown",
      note: {
        en: "Not described on its pages.",
        de: "Auf den Seiten nicht beschrieben.",
      },
      source: ELEMENTS,
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "Device management covers lifecycle and security; software usage metering is not described.",
        de: "Die Geräteverwaltung deckt Lebenszyklus und Sicherheit ab; eine Messung der Software-Nutzung ist nicht beschrieben.",
      },
      source: ELEMENTS,
    },
    renewals: {
      value: "partial",
      note: {
        en: "Renewal recommendations and expired-subscription notices for Microsoft licenses; no general contract tracking.",
        de: "Verlängerungsempfehlungen und Hinweise auf abgelaufene Microsoft-Abonnements; keine allgemeine Vertragsverwaltung.",
      },
      source: PAGE,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Unassigns and downgrades licenses, which needs write access to client tenants.",
        de: "Entzieht und verkleinert Lizenzen, was Schreibzugriff auf Kunden-Tenants erfordert.",
      },
      source: PAGE,
    },
    selfHost: {
      value: "no",
      note: {
        en: "Hosted; partners are placed in a data center by region.",
        de: "Gehostet; Partner werden je Region einem Rechenzentrum zugeordnet.",
      },
      source: GUIDE,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: ELEMENTS,
    },
    freeTier: {
      value: "no",
      note: {
        en: "Free only as part of other Elements purchases.",
        de: "Kostenlos nur im Rahmen anderer Elements-Käufe.",
      },
      source: PAGE,
    },
    publicPricing: {
      value: "no",
      note: { en: "Request Pricing only.", de: "Nur Request Pricing." },
      source: "https://www.avepoint.com/pricing",
    },
    mspMultiTenant: {
      value: "yes",
      note: {
        en: "Built for MSPs across all client tenants.",
        de: "Für MSPs über alle Kunden-Tenants gebaut.",
      },
      source: ELEMENTS,
    },
    euHosting: {
      value: "yes",
      note: {
        en: "France Central, Germany West Central, North Europe and West Europe.",
        de: "France Central, Germany West Central, North Europe und West Europe.",
      },
      source: GUIDE,
    },
  },
};
