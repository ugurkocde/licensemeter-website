import { notReviewed } from "../entry";
import type { Product } from "../types";

const REPO = "https://github.com/Combodo/iTop";
const GRAPH = "https://github.com/Combodo/itop-data-collector-ms-graph";
const SERVICE_MODEL = `${REPO}/blob/develop/datamodels/2.x/itop-service-mgmt/datamodel.itop-service-mgmt.xml`;
const CONFIG_MODEL = `${REPO}/blob/develop/datamodels/2.x/itop-config-mgmt/datamodel.itop-config-mgmt.xml`;
const PAGE = "https://www.combodo.com/itop";
const SAAS =
  "https://combodo.com/itop/cloud-hosting-5-good-reasons-to-trust-the-saas-version-of-itop/";

export const itop: Product = {
  slug: "itop",
  name: "iTop",
  url: PAGE,
  category: "oss",
  checkedOn: "2026-11-06",
  headToHead: false,
  repo: {
    url: REPO,
    license: "AGPL-3.0",
    lastActivity: "3.3.0, 15 September 2026",
  },
  summary: {
    en: "An open-source ITSM and CMDB application from the French company Combodo. Its data model links software, licenses (usage limit, dates, key) and contracts (cost, currency, billing frequency) to the items that use them, fed by open-source collectors for OCS Inventory, LDAP, Microsoft Graph, Intune and more.",
    de: "Eine quelloffene ITSM- und CMDB-Anwendung des französischen Unternehmens Combodo. Ihr Datenmodell verknüpft Software, Lizenzen (Nutzungsgrenze, Daten, Schlüssel) und Verträge (Kosten, Währung, Abrechnungsintervall) mit den Elementen, die sie nutzen, gespeist von quelloffenen Kollektoren für OCS Inventory, LDAP, Microsoft Graph, Intune und weitere.",
  },
  strengths: [
    {
      en: "A configurable CMDB with relationships and impact analysis between applications, servers, devices, licenses and contracts.",
      de: "Eine konfigurierbare CMDB mit Beziehungen und Auswirkungsanalyse zwischen Anwendungen, Servern, Geräten, Lizenzen und Verträgen.",
    },
    {
      en: "ITIL service management (incidents, requests, changes, problems) in the same tool.",
      de: "ITIL-Service-Management (Störungen, Anfragen, Changes, Probleme) im selben Werkzeug.",
    },
    {
      en: "Commercial support and a hosted version from the vendor, hosted in France.",
      de: "Kommerzieller Support und eine gehostete Version vom Hersteller, gehostet in Frankreich.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "iTop Community is free to self-host. Combodo offers a hosted version including a free tier; paid prices are not published.",
    de: "iTop Community ist im Eigenbetrieb kostenlos. Combodo bietet eine gehostete Version mit kostenloser Stufe; Preise der Bezahlstufen sind nicht veröffentlicht.",
  },
  features: {
    m365InactiveUsers: {
      value: "no",
      note: {
        en: "The Microsoft Graph collector imports people and users, not licenses or sign-ins.",
        de: "Der Microsoft-Graph-Kollektor importiert Personen und Konten, keine Lizenzen oder Anmeldungen.",
      },
      source: GRAPH,
    },
    m365UnassignedSeats: {
      value: "no",
      note: {
        en: "License usage limits are entered in iTop.",
        de: "Nutzungsgrenzen von Lizenzen werden in iTop erfasst.",
      },
      source: GRAPH,
    },
    copilotUsage: {
      value: "no",
      note: { en: "Not found.", de: "Nicht gefunden." },
      source: GRAPH,
    },
    costPerFinding: {
      value: "no",
      note: {
        en: "No priced waste findings; cost lives on contracts.",
        de: "Keine bezifferten Funde; Kosten stehen an Verträgen.",
      },
      source: SERVICE_MODEL,
    },
    customPrices: {
      value: "partial",
      note: {
        en: "Contracts carry cost and currency; the license record itself has no cost field.",
        de: "Verträge tragen Kosten und Währung; der Lizenzeintrag selbst hat kein Kostenfeld.",
      },
      source: SERVICE_MODEL,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "No SaaS seat connectors among the collectors.",
        de: "Keine Konnektoren für SaaS-Lizenzen unter den Kollektoren.",
      },
      source: "https://github.com/Combodo/itop-data-collector-ms-intune",
    },
    shadowItDiscovery: notReviewed,
    aiApiSpend: notReviewed,
    endpointMetering: notReviewed,
    renewals: {
      value: "partial",
      note: {
        en: "Licenses and contracts store start and end dates; a built-in expiry alert was not verified.",
        de: "Lizenzen und Verträge speichern Beginn und Ende; ein eingebauter Ablaufalarm wurde nicht bestätigt.",
      },
      source: CONFIG_MODEL,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "Does not change licenses in Microsoft 365 or SaaS apps.",
        de: "Ändert keine Lizenzen in Microsoft 365 oder SaaS-Anwendungen.",
      },
      source: PAGE,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "iTop Community, source on GitHub.",
        de: "iTop Community, Quellcode auf GitHub.",
      },
      source: PAGE,
    },
    openSource: {
      value: "yes",
      note: { en: "AGPL-3.0.", de: "AGPL-3.0." },
      source: REPO,
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Community edition and a free hosted tier.",
        de: "Community-Edition und eine kostenlose gehostete Stufe.",
      },
      source: SAAS,
    },
    publicPricing: {
      value: "partial",
      note: {
        en: "Paid hosted prices are not published.",
        de: "Preise der bezahlten gehosteten Stufen sind nicht veröffentlicht.",
      },
      source: SAAS,
    },
    mspMultiTenant: notReviewed,
    euHosting: {
      value: "yes",
      note: {
        en: "The hosted version runs in France.",
        de: "Die gehostete Version läuft in Frankreich.",
      },
      source: SAAS,
    },
    softwareInventory: {
      value: "partial",
      note: {
        en: "No agent of its own; installed software can come from the OCS Inventory collector.",
        de: "Kein eigener Agent; installierte Software kann über den Kollektor für OCS Inventory kommen.",
      },
      source: "https://github.com/Combodo/itop-data-collector-ocsng",
    },
    hardwareAssets: {
      value: "yes",
      note: {
        en: "CMDB classes for PCs, servers, network devices, phones and more.",
        de: "CMDB-Klassen für PCs, Server, Netzwerkgeräte, Telefone und mehr.",
      },
      source: CONFIG_MODEL,
    },
    hostedOption: {
      value: "yes",
      note: {
        en: "iTop SaaS from Combodo, including a free version.",
        de: "iTop SaaS von Combodo, auch als kostenlose Version.",
      },
      source: SAAS,
    },
  },
};
