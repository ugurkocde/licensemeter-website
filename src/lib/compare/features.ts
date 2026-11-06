import type { Localized } from "./types";

/**
 * The shared feature dictionary. Every product file answers every core key,
 * under the same name, so one table component can line any two products up
 * and a feature means the same thing on every page. Rows are binary on
 * purpose: "partial" exists for genuine edge cases and always carries a note.
 */
export const FEATURE_GROUPS = {
  waste: {
    en: "Finding Microsoft 365 waste",
    de: "Microsoft-365-Verschwendung finden",
  },
  coverage: {
    en: "Coverage beyond Microsoft 365",
    de: "Abdeckung über Microsoft 365 hinaus",
  },
  action: { en: "Acting on findings", de: "Umsetzung" },
  deployment: { en: "Deployment and price", de: "Betrieb und Preis" },
  assets: { en: "IT asset management", de: "IT-Asset-Management" },
} as const satisfies Record<string, Localized>;

export type FeatureGroup = keyof typeof FEATURE_GROUPS;

type FeatureDef = { group: FeatureGroup; label: Localized };

export const CORE_FEATURES = {
  m365InactiveUsers: {
    group: "waste",
    label: {
      en: "Flags inactive or disabled licensed users",
      de: "Erkennt inaktive oder deaktivierte lizenzierte Konten",
    },
  },
  m365UnassignedSeats: {
    group: "waste",
    label: {
      en: "Flags purchased but unassigned seats",
      de: "Erkennt gekaufte, aber nicht zugewiesene Lizenzen",
    },
  },
  copilotUsage: {
    group: "waste",
    label: {
      en: "Reports unused Microsoft 365 Copilot licenses",
      de: "Zeigt ungenutzte Microsoft-365-Copilot-Lizenzen",
    },
  },
  costPerFinding: {
    group: "waste",
    label: {
      en: "Puts a cost on each finding",
      de: "Beziffert jeden Fund in Geld",
    },
  },
  customPrices: {
    group: "waste",
    label: {
      en: "Uses your own contract prices",
      de: "Rechnet mit Ihren Vertragspreisen",
    },
  },
  nonMicrosoftSaas: {
    group: "coverage",
    label: {
      en: "Reads license data from non-Microsoft SaaS",
      de: "Liest Lizenzdaten aus SaaS-Anwendungen anderer Anbieter",
    },
  },
  shadowItDiscovery: {
    group: "coverage",
    label: {
      en: "Discovers unsanctioned apps (shadow IT)",
      de: "Findet nicht freigegebene Anwendungen (Schatten-IT)",
    },
  },
  aiApiSpend: {
    group: "coverage",
    label: {
      en: "Tracks OpenAI and Anthropic API spend",
      de: "Verfolgt API-Kosten bei OpenAI und Anthropic",
    },
  },
  endpointMetering: {
    group: "coverage",
    label: {
      en: "Measures desktop software usage",
      de: "Misst die Nutzung von Desktop-Software",
    },
  },
  renewals: {
    group: "coverage",
    label: {
      en: "Tracks contracts and renewals",
      de: "Verfolgt Verträge und Verlängerungen",
    },
  },
  automatedRemediation: {
    group: "action",
    label: {
      en: "Removes or reassigns licenses itself",
      de: "Entzieht oder verschiebt Lizenzen selbst",
    },
  },
  selfHost: {
    group: "deployment",
    label: { en: "Can be self-hosted", de: "Selbst betreibbar" },
  },
  openSource: {
    group: "deployment",
    label: { en: "Open source", de: "Open Source" },
  },
  freeTier: {
    group: "deployment",
    label: {
      en: "Free plan (not just a trial)",
      de: "Kostenloser Tarif (nicht nur eine Testphase)",
    },
  },
  publicPricing: {
    group: "deployment",
    label: { en: "Prices published", de: "Preise veröffentlicht" },
  },
  mspMultiTenant: {
    group: "deployment",
    label: {
      en: "Multi-tenant for MSPs",
      de: "Mandantenfähig für MSPs",
    },
  },
  euHosting: {
    group: "deployment",
    label: {
      en: "EU hosting available",
      de: "Hosting in der EU verfügbar",
    },
  },
} as const satisfies Record<string, FeatureDef>;

/** Keys only some pages show, so products may leave them out. */
export const EXTRA_FEATURES = {
  softwareInventory: {
    group: "assets",
    label: {
      en: "Inventories installed software on devices",
      de: "Inventarisiert installierte Software auf Geräten",
    },
  },
  hardwareAssets: {
    group: "assets",
    label: { en: "Tracks hardware assets", de: "Verwaltet Hardware-Assets" },
  },
  hostedOption: {
    group: "deployment",
    label: {
      en: "Official hosted version",
      de: "Offizielle gehostete Version",
    },
  },
} as const satisfies Record<string, FeatureDef>;

export type CoreFeatureKey = keyof typeof CORE_FEATURES;
export type ExtraFeatureKey = keyof typeof EXTRA_FEATURES;
export type FeatureKey = CoreFeatureKey | ExtraFeatureKey;

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  ...CORE_FEATURES,
  ...EXTRA_FEATURES,
};

export const CORE_FEATURE_KEYS = Object.keys(CORE_FEATURES) as CoreFeatureKey[];
