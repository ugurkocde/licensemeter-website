import { notReviewed } from "../entry";
import type { Product } from "../types";

const REPO = "https://github.com/glpi-project/glpi";
const SOFTWARE =
  "https://help.glpi-project.org/documentation/modules/assets/softwares";
const ENTRA = "https://www.glpi-project.org/en/integration/azure-entra-id/";
const PRICING = "https://www.glpi-project.org/en/pricing/";

export const glpi: Product = {
  slug: "glpi",
  name: "GLPI",
  url: "https://glpi-project.org",
  category: "oss",
  checkedOn: "2026-11-06",
  headToHead: false,
  repo: {
    url: REPO,
    license: "GPL-3.0",
    lastActivity: "12.0.1, 28 October 2026",
  },
  summary: {
    en: "An open-source IT service management suite developed with Teclib': helpdesk, asset management and CMDB, finance and software management in one tool. Licenses record quantity, assignment to computers or users, expiry and cost, and the GLPI Agent fills in installed software automatically.",
    de: "Eine quelloffene IT-Service-Management-Suite, entwickelt mit Teclib': Helpdesk, Asset-Management und CMDB, Finanzen und Software-Verwaltung in einem Werkzeug. Lizenzen erfassen Anzahl, Zuordnung zu Rechnern oder Personen, Ablauf und Kosten, und der GLPI Agent ergänzt installierte Software automatisch.",
  },
  strengths: [
    {
      en: "Full ITSM: helpdesk, SLAs, service catalog, change and problem management next to assets.",
      de: "Vollständiges ITSM: Helpdesk, SLAs, Servicekatalog, Change- und Problem-Management neben den Assets.",
    },
    {
      en: "Agent-based inventory of hardware and installed software on Windows, macOS and Linux.",
      de: "Agentenbasiertes Inventar von Hardware und installierter Software unter Windows, macOS und Linux.",
    },
    {
      en: "License compliance at install level: licenses tie to the computers and people that use them.",
      de: "Lizenz-Compliance auf Installationsebene: Lizenzen hängen an den Rechnern und Personen, die sie nutzen.",
    },
  ],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: "Free to self-host. GLPI Network Cloud from EUR 19 per IT agent per month.",
    de: "Kostenlos im Eigenbetrieb. GLPI Network Cloud ab 19 EUR je IT-Agent und Monat.",
  },
  features: {
    m365InactiveUsers: {
      value: "no",
      note: {
        en: "The Entra ID integration covers user sync and SSO, not licenses or sign-in activity.",
        de: "Die Entra-ID-Integration umfasst Kontensynchronisierung und SSO, keine Lizenzen oder Anmeldeaktivität.",
      },
      source: ENTRA,
    },
    m365UnassignedSeats: {
      value: "no",
      note: {
        en: "License quantities are entered in GLPI.",
        de: "Lizenzanzahlen werden in GLPI erfasst.",
      },
      source: ENTRA,
    },
    copilotUsage: {
      value: "unknown",
      note: { en: "Not documented.", de: "Nicht dokumentiert." },
      source: ENTRA,
    },
    costPerFinding: {
      value: "no",
      note: {
        en: "Costs attach to licenses, but there are no priced waste findings.",
        de: "Kosten hängen an Lizenzen, aber es gibt keine bezifferten Funde.",
      },
      source: SOFTWARE,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Financial management at license level.",
        de: "Finanzverwaltung auf Lizenzebene.",
      },
      source: SOFTWARE,
    },
    nonMicrosoftSaas: {
      value: "unknown",
      note: {
        en: "No SaaS seat connectors documented.",
        de: "Keine Konnektoren für SaaS-Lizenzen dokumentiert.",
      },
      source: SOFTWARE,
    },
    shadowItDiscovery: notReviewed,
    aiApiSpend: notReviewed,
    endpointMetering: notReviewed,
    renewals: {
      value: "yes",
      note: {
        en: "Expiry fields with alerts.",
        de: "Ablauffelder mit Alarmen.",
      },
      source: SOFTWARE,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "Does not change licenses in Microsoft 365 or SaaS apps.",
        de: "Ändert keine Lizenzen in Microsoft 365 oder SaaS-Anwendungen.",
      },
      source: ENTRA,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "Free self-hosted install, with optional paid support.",
        de: "Kostenlose Installation im Eigenbetrieb, mit optionalem Support gegen Bezahlung.",
      },
      source: PRICING,
    },
    openSource: {
      value: "yes",
      note: {
        en: "GPL-3.0; the GLPI Agent is GPL-2.0.",
        de: "GPL-3.0; der GLPI Agent steht unter GPL-2.0.",
      },
      source: REPO,
    },
    freeTier: {
      value: "yes",
      note: { en: "Free to self-host.", de: "Kostenlos im Eigenbetrieb." },
      source: PRICING,
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "Cloud and support prices are published.",
        de: "Preise für Cloud und Support sind veröffentlicht.",
      },
      source: PRICING,
    },
    mspMultiTenant: notReviewed,
    euHosting: notReviewed,
    softwareInventory: {
      value: "yes",
      note: {
        en: "The GLPI Agent inventories installed software on Windows, macOS and Linux.",
        de: "Der GLPI Agent inventarisiert installierte Software unter Windows, macOS und Linux.",
      },
      source: "https://glpi-agent.readthedocs.io/en/latest/",
    },
    hardwareAssets: {
      value: "yes",
      note: {
        en: "Asset management and CMDB for computers, network gear, printers, phones and more.",
        de: "Asset-Management und CMDB für Rechner, Netzwerkgeräte, Drucker, Telefone und mehr.",
      },
      source: SOFTWARE,
    },
    hostedOption: {
      value: "yes",
      note: {
        en: "GLPI Network Cloud, EUR 19 or 21 per IT agent per month.",
        de: "GLPI Network Cloud, 19 oder 21 EUR je IT-Agent und Monat.",
      },
      source: PRICING,
    },
  },
};
