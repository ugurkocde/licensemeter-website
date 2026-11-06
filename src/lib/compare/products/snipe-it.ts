import { notReviewed } from "../entry";
import type { Product } from "../types";

const REPO = "https://github.com/grokability/snipe-it";
const LICENSES = "https://snipe-it.readme.io/docs/licenses";
const PRODUCT = "https://snipeitapp.com/product";
const PRICING = "https://snipeitapp.com/pricing";
const ADAPTER = `${REPO}/blob/master/app/SyncAdapters/HostInventoryRecord.php`;

const noM365 = {
  en: "No Microsoft 365 license or sign-in sync is documented.",
  de: "Keine Synchronisierung von Microsoft-365-Lizenzen oder -Anmeldungen dokumentiert.",
};

export const snipeIt: Product = {
  slug: "snipe-it",
  name: "Snipe-IT",
  url: "https://snipeitapp.com",
  category: "oss",
  checkedOn: "2026-11-06",
  headToHead: false,
  repo: {
    url: REPO,
    license: "AGPL-3.0",
    lastActivity: "v8.8.3, 22 October 2026",
  },
  summary: {
    en: "A web-based IT asset management system from Grokability. It tracks hardware, software licenses, accessories and consumables, checked out to people, with a REST API, LDAP and SCIM user sync, SSO, and sync adapters for MDM and RMM tools such as Intune and Jamf. Software licenses are entered by hand or CSV, with seat counts, cost and expiry.",
    de: "Ein webbasiertes IT-Asset-Management von Grokability. Es verwaltet Hardware, Software-Lizenzen, Zubehör und Verbrauchsmaterial, ausgegeben an Personen, mit REST-API, LDAP- und SCIM-Synchronisierung, SSO und Adaptern für MDM- und RMM-Werkzeuge wie Intune und Jamf. Software-Lizenzen werden von Hand oder per CSV erfasst, mit Anzahl, Kosten und Ablaufdatum.",
  },
  strengths: [
    {
      en: "The full hardware asset lifecycle (tags, checkout, depreciation, signed acceptance), which LicenseMeter does not cover.",
      de: "Der vollständige Lebenszyklus von Hardware (Inventarnummern, Ausgabe, Abschreibung, unterschriebene Übergabe), den LicenseMeter nicht abdeckt.",
    },
    {
      en: "A large, long-running community: about 15,000 GitHub stars and translations into more than 55 languages.",
      de: "Eine große, langjährige Community: rund 15.000 GitHub-Sterne und Übersetzungen in mehr als 55 Sprachen.",
    },
    {
      en: "License records hold any vendor's software, including perpetual and on-premises licenses with no API.",
      de: "Lizenzeinträge fassen Software jedes Anbieters, auch Dauer- und lokale Lizenzen ohne API.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "Free to self-host. Official hosting from USD 39.99 per month.",
    de: "Kostenlos im Eigenbetrieb. Offizielles Hosting ab 39,99 USD pro Monat.",
  },
  features: {
    m365InactiveUsers: {
      value: "no",
      note: {
        en: "The Intune adapter reads managed devices only.",
        de: "Der Intune-Adapter liest nur verwaltete Geräte.",
      },
      source: `${REPO}/blob/master/app/SyncAdapters/Intune/IntuneClient.php`,
    },
    m365UnassignedSeats: {
      value: "no",
      note: {
        en: "Free seats exist only for counts entered by hand.",
        de: "Freie Plätze gibt es nur für von Hand erfasste Anzahlen.",
      },
      source: LICENSES,
    },
    copilotUsage: { value: "unknown", note: noM365, source: PRODUCT },
    costPerFinding: {
      value: "no",
      note: {
        en: "Cost is stored per license, but there are no waste findings.",
        de: "Kosten werden je Lizenz gespeichert, aber es gibt keine Funde zu Verschwendung.",
      },
      source: LICENSES,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "A purchase cost field on every license.",
        de: "Ein Feld für Einkaufskosten an jeder Lizenz.",
      },
      source: LICENSES,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Licenses are entered manually or by CSV; adapters import devices, not seats.",
        de: "Lizenzen werden von Hand oder per CSV erfasst; Adapter importieren Geräte, keine Lizenzen.",
      },
      source: ADAPTER,
    },
    shadowItDiscovery: notReviewed,
    aiApiSpend: notReviewed,
    endpointMetering: notReviewed,
    renewals: {
      value: "yes",
      note: {
        en: "Expiry dates with email alerts and an expiring license report.",
        de: "Ablaufdaten mit E-Mail-Alarm und einem Bericht zu ablaufenden Lizenzen.",
      },
      source: PRODUCT,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "Does not change licenses in Microsoft 365 or SaaS apps.",
        de: "Ändert keine Lizenzen in Microsoft 365 oder SaaS-Anwendungen.",
      },
      source: PRODUCT,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "Runs on Linux, Windows or macOS web servers, with a Docker image.",
        de: "Läuft auf Webservern unter Linux, Windows oder macOS, mit Docker-Image.",
      },
      source: REPO,
    },
    openSource: {
      value: "yes",
      note: { en: "AGPL-3.0.", de: "AGPL-3.0." },
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
        en: "Hosting prices are published.",
        de: "Hosting-Preise sind veröffentlicht.",
      },
      source: PRICING,
    },
    mspMultiTenant: notReviewed,
    euHosting: notReviewed,
    softwareInventory: {
      value: "no",
      note: {
        en: "No agent; adapters import hardware fields, not installed software.",
        de: "Kein Agent; Adapter importieren Hardware-Daten, keine installierte Software.",
      },
      source: ADAPTER,
    },
    hardwareAssets: {
      value: "yes",
      note: {
        en: "The core of the product.",
        de: "Der Kern des Produkts.",
      },
      source: REPO,
    },
    hostedOption: {
      value: "yes",
      note: {
        en: "From USD 39.99 per month or USD 399.99 per year.",
        de: "Ab 39,99 USD pro Monat oder 399,99 USD pro Jahr.",
      },
      source: PRICING,
    },
  },
};
