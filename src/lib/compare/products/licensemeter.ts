import { MSP_INCLUDED_TENANTS, planPriceLabel } from "~/lib/pricing";

import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Product } from "../types";

const DOCS = "https://docs.licensemeter.com";
const REPO = "https://github.com/ugurkocde/licensemeter-website";

const connectors = NON_MICROSOFT_CONNECTORS.length;

/*
 * LicenseMeter's own column in every feature table. Sources are our public
 * docs, so a reader can check each cell; prices and connector counts come
 * from the code that defines them.
 */
export const licensemeter: Product = {
  slug: "licensemeter",
  name: "LicenseMeter",
  url: "https://www.licensemeter.com",
  category: "licensemeter",
  checkedOn: "2026-11-06",
  headToHead: false,
  summary: {
    en: "A free, MIT-licensed tool that connects read-only to Microsoft 365, finds disabled, inactive and unassigned paid seats and unused Copilot licenses, prices each finding, and cross-checks a handful of other SaaS tools against Entra ID. Built for Microsoft 365 admins and MSPs who want the waste number without buying a platform.",
    de: "Ein kostenloses Werkzeug unter MIT-Lizenz, das sich nur lesend mit Microsoft 365 verbindet, deaktivierte, inaktive und nicht zugewiesene Lizenzen sowie ungenutzte Copilot-Lizenzen findet, jeden Fund beziffert und einige weitere SaaS-Anwendungen mit Entra ID abgleicht. Gebaut für Microsoft-365-Admins und MSPs, die die Verschwendung beziffern wollen, ohne eine Plattform zu kaufen.",
  },
  strengths: [],
  pickThemIf: [],
  pickUsIf: [],
  pricing: {
    en: `Free, including continuous monitoring, with no time limit. Optional hosted plans: Pro at ${planPriceLabel("pro", "month")} and MSP at ${planPriceLabel("msp", "month")} for ${MSP_INCLUDED_TENANTS} client tenants. Self-hosted installs include every feature.`,
    de: `Kostenlos, einschließlich laufender Überwachung, ohne Zeitlimit. Optionale gehostete Tarife: Pro für ${planPriceLabel("pro", "month").replace("per month", "pro Monat")} und MSP für ${planPriceLabel("msp", "month").replace("per month", "pro Monat")} für ${MSP_INCLUDED_TENANTS} Kunden-Tenants. Selbst betriebene Installationen enthalten alle Funktionen.`,
  },
  repo: { url: REPO, license: "MIT" },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Disabled accounts that keep licenses, licensed accounts that were never active, and seats idle past your threshold, from sign-in activity and per-workload usage.",
        de: "Deaktivierte Konten mit Lizenz, nie aktive lizenzierte Konten und Lizenzen, die länger als Ihr Schwellenwert ungenutzt sind, aus Anmeldeaktivität und Nutzungsberichten je Dienst.",
      },
      source: `${DOCS}/findings/rules/`,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Paid seats bought but assigned to nobody become priced shelfware findings.",
        de: "Bezahlte, aber niemandem zugewiesene Lizenzen werden als bezifferte Funde ausgewiesen.",
      },
      source: `${DOCS}/findings/rules/`,
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "Copilot seats with no Copilot activity in the threshold window are their own finding.",
        de: "Copilot-Lizenzen ohne Copilot-Aktivität im Zeitfenster sind ein eigener Fund.",
      },
      source: `${DOCS}/findings/rules/`,
    },
    costPerFinding: {
      value: "yes",
      note: {
        en: "Every finding carries a monthly cost in the workspace currency.",
        de: "Jeder Fund trägt monatliche Kosten in der Währung des Workspace.",
      },
      source: `${DOCS}/licenses-and-prices/`,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "An editable price book per workspace, prefilled with list-price estimates.",
        de: "Eine bearbeitbare Preisliste je Workspace, vorbelegt mit Listenpreis-Schätzungen.",
      },
      source: `${DOCS}/licenses-and-prices/`,
    },
    nonMicrosoftSaas: {
      value: "yes",
      note: {
        en: `${connectors} connectors: ${listJoin(NON_MICROSOFT_CONNECTORS)}. Far fewer than a SaaS management platform.`,
        de: `${connectors} Konnektoren: ${listJoin(NON_MICROSOFT_CONNECTORS, "und")}. Deutlich weniger als eine SaaS-Management-Plattform.`,
      },
      source: `${DOCS}/connectors/`,
    },
    shadowItDiscovery: {
      value: "no",
      note: {
        en: "Only the apps you connect are read. There is no discovery of unknown apps.",
        de: "Gelesen werden nur verbundene Anwendungen. Unbekannte Anwendungen werden nicht aufgespürt.",
      },
      source: `${DOCS}/connectors/`,
    },
    aiApiSpend: {
      value: "yes",
      note: {
        en: "Daily OpenAI and Anthropic API spend, kept separate from per-seat costs.",
        de: "Tägliche API-Kosten bei OpenAI und Anthropic, getrennt von den Lizenzkosten.",
      },
      source: `${DOCS}/ai-costs/`,
    },
    endpointMetering: {
      value: "partial",
      note: {
        en: "Windows apps deployed through Intune only, read from an Intune Remediation. Hosted Pro and MSP plans, or self-hosted.",
        de: "Nur Windows-Anwendungen, die über Intune verteilt werden, gelesen über eine Intune-Remediation. Gehostet in Pro und MSP, oder selbst betrieben.",
      },
      source: `${DOCS}/connectors/windows-metering/`,
    },
    renewals: {
      value: "yes",
      note: {
        en: "Contract dates and notice deadlines per vendor, shown next to the open findings they affect.",
        de: "Vertragsdaten und Kündigungsfristen je Anbieter, neben den offenen Funden, die sie betreffen.",
      },
      source: `${DOCS}/renewals/`,
    },
    automatedRemediation: {
      value: "no",
      note: {
        en: "By design: access is read-only. It generates a PowerShell script for the seats you pick, and your IT reviews and runs it.",
        de: "Bewusst: Der Zugriff ist nur lesend. Für die gewählten Lizenzen entsteht ein PowerShell-Skript, das Ihre IT prüft und ausführt.",
      },
      source: `${DOCS}/exports/`,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "Docker Compose, with every feature included.",
        de: "Docker Compose, mit allen Funktionen.",
      },
      source: `${DOCS}/self-hosting/`,
    },
    openSource: {
      value: "yes",
      note: { en: "MIT license.", de: "MIT-Lizenz." },
      source: REPO,
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Free with no time limit, including monitoring and exports.",
        de: "Kostenlos ohne Zeitlimit, einschließlich Überwachung und Exporten.",
      },
      source: "https://www.licensemeter.com/pricing",
    },
    publicPricing: {
      value: "yes",
      note: {
        en: `Pro ${planPriceLabel("pro", "month")}, MSP ${planPriceLabel("msp", "month")}.`,
        de: `Pro ${planPriceLabel("pro", "month").replace("per month", "pro Monat")}, MSP ${planPriceLabel("msp", "month").replace("per month", "pro Monat")}.`,
      },
      source: "https://www.licensemeter.com/pricing",
    },
    mspMultiTenant: {
      value: "yes",
      note: {
        en: "Multiple workspaces on every plan; the MSP plan adds portfolio alerts, one team across clients and white-label reports.",
        de: "Mehrere Workspaces in jedem Tarif; der MSP-Tarif ergänzt übergreifende Alarme, ein Team für alle Kunden und Berichte im eigenen Design.",
      },
      source: "https://www.licensemeter.com/msp",
    },
    euHosting: {
      value: "yes",
      note: {
        en: "Hosted data lives in Frankfurt (AWS eu-central-1).",
        de: "Gehostete Daten liegen in Frankfurt (AWS eu-central-1).",
      },
      source: "https://www.licensemeter.com/security",
    },
    softwareInventory: {
      value: "partial",
      note: {
        en: "Intune-deployed Windows apps only, as part of software metering.",
        de: "Nur über Intune verteilte Windows-Anwendungen, im Rahmen der Software-Messung.",
      },
      source: `${DOCS}/connectors/windows-metering/`,
    },
    hardwareAssets: {
      value: "no",
      note: {
        en: "Not an asset register.",
        de: "Keine Asset-Verwaltung.",
      },
    },
    hostedOption: {
      value: "yes",
      note: {
        en: "licensemeter.com, free, with optional paid plans.",
        de: "licensemeter.com, kostenlos, mit optionalen Bezahltarifen.",
      },
      source: "https://www.licensemeter.com/pricing",
    },
  },
};
