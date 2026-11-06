import { notReviewed } from "../entry";
import type { Product } from "../types";

const REPO = "https://github.com/allegro/ralph";
const DOCS = `${REPO}/blob/ng/docs/index.md`;
const MODEL = `${REPO}/blob/ng/src/ralph/licences/models.py`;

export const ralph: Product = {
  slug: "ralph",
  name: "Ralph",
  url: REPO,
  category: "oss",
  checkedOn: "2026-11-06",
  headToHead: false,
  repo: {
    url: REPO,
    license: "Apache-2.0",
    lastActivity: "20261019.1, 19 October 2026",
  },
  summary: {
    en: "An asset management, DCIM and CMDB system for data centers and back offices, published by Allegro. It tracks asset purchases and life cycle, data center layouts, support contracts and software licenses with price, expiry and depreciation. Since February 2025 Allegro publishes it on a sources-only basis, without guaranteed answers to issues or pull requests.",
    de: "Ein System für Asset-Management, DCIM und CMDB in Rechenzentren und Büros, veröffentlicht von Allegro. Es verfolgt Anschaffung und Lebenszyklus von Assets, Rechenzentrumslayouts, Supportverträge und Software-Lizenzen mit Preis, Ablauf und Abschreibung. Seit Februar 2025 veröffentlicht Allegro es nur noch als Quellcode, ohne zugesicherte Antworten auf Issues oder Pull Requests.",
  },
  strengths: [
    {
      en: "Data center management with rack visualization.",
      de: "Rechenzentrumsverwaltung mit Rack-Visualisierung.",
    },
    {
      en: "Purchase and life-cycle tracking with invoice and depreciation fields for assets and licenses.",
      de: "Verfolgung von Anschaffung und Lebenszyklus mit Rechnungs- und Abschreibungsfeldern für Assets und Lizenzen.",
    },
    {
      en: "A permissive Apache-2.0 license.",
      de: "Eine freizügige Apache-2.0-Lizenz.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "Free to self-host. No official hosted version.",
    de: "Kostenlos im Eigenbetrieb. Keine offizielle gehostete Version.",
  },
  features: {
    m365InactiveUsers: {
      value: "no",
      note: {
        en: "No Microsoft 365 integration documented.",
        de: "Keine Microsoft-365-Integration dokumentiert.",
      },
      source: DOCS,
    },
    m365UnassignedSeats: {
      value: "no",
      note: {
        en: "Purchased counts against assignments, entered by hand.",
        de: "Gekaufte Anzahl gegen Zuweisungen, von Hand erfasst.",
      },
      source: MODEL,
    },
    copilotUsage: {
      value: "no",
      note: { en: "Not documented.", de: "Nicht dokumentiert." },
      source: DOCS,
    },
    costPerFinding: {
      value: "no",
      note: {
        en: "Price is stored per license, but there are no waste findings.",
        de: "Der Preis steht an der Lizenz, aber es gibt keine Funde zu Verschwendung.",
      },
      source: MODEL,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Price, invoice number and depreciation rate per license.",
        de: "Preis, Rechnungsnummer und Abschreibungssatz je Lizenz.",
      },
      source: MODEL,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Cloud sync covers cloud hosts, not SaaS seats.",
        de: "Die Cloud-Synchronisierung umfasst Cloud-Hosts, keine SaaS-Lizenzen.",
      },
      source: `${REPO}/blob/ng/docs/user/cloudsync.md`,
    },
    shadowItDiscovery: notReviewed,
    aiApiSpend: notReviewed,
    endpointMetering: notReviewed,
    renewals: {
      value: "partial",
      note: {
        en: "Licenses carry an expiry date; expiry notifications were not found.",
        de: "Lizenzen tragen ein Ablaufdatum; Benachrichtigungen dazu wurden nicht gefunden.",
      },
      source: MODEL,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "Does not change licenses in external systems.",
        de: "Ändert keine Lizenzen in externen Systemen.",
      },
      source: DOCS,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "Self-hosted install documented in the repository.",
        de: "Installation im Eigenbetrieb im Repository dokumentiert.",
      },
      source: `${REPO}/blob/ng/docs/installation/installation.md`,
    },
    openSource: {
      value: "yes",
      note: { en: "Apache-2.0.", de: "Apache-2.0." },
      source: REPO,
    },
    freeTier: {
      value: "yes",
      note: { en: "Free to self-host.", de: "Kostenlos im Eigenbetrieb." },
      source: REPO,
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "Free; no paid offering.",
        de: "Kostenlos; kein Bezahlangebot.",
      },
      source: REPO,
    },
    mspMultiTenant: notReviewed,
    euHosting: notReviewed,
    softwareInventory: {
      value: "no",
      note: {
        en: "No discovery agent documented; software is a catalog for licenses.",
        de: "Kein Erkennungs-Agent dokumentiert; Software ist ein Katalog für Lizenzen.",
      },
      source: DOCS,
    },
    hardwareAssets: {
      value: "yes",
      note: {
        en: "Data center and back-office hardware is the core of the product.",
        de: "Hardware in Rechenzentrum und Büro ist der Kern des Produkts.",
      },
      source: REPO,
    },
    hostedOption: {
      value: "no",
      note: {
        en: "No official hosted offering; the README points to a community forum.",
        de: "Kein offizielles Hosting; die README verweist auf ein Community-Forum.",
      },
      source: REPO,
    },
  },
};
