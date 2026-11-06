import { notReviewed } from "../entry";
import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Product } from "../types";

const DOCS = "https://docs.cipp.app/user-documentation";
const LICENSES = `${DOCS}/tenant/reports/list-licenses`;
const OPTIMIZATION = `${LICENSES}/optimization`;
const REPO = "https://github.com/CyberDrain/CIPP";

/*
 * The closest open-source tool to LicenseMeter's Microsoft 365 core. Since
 * version 11 its License Optimization tab covers most of the same findings,
 * and the page has to say so plainly.
 */
export const cipp: Product = {
  slug: "cipp",
  name: "CIPP",
  url: "https://cyberdrain.com/products/cipp/",
  category: "oss",
  checkedOn: "2026-11-06",
  headToHead: true,
  repo: {
    url: REPO,
    license: "AGPL-3.0",
    lastActivity: "v11.3.0, 2 November 2026",
  },
  summary: {
    en: "The CyberDrain Improved Partner Portal: a free, AGPL-licensed, multi-tenant Microsoft 365 management portal built for MSPs and Microsoft partners, with a single-tenant mode. Next to user, mailbox, device, standards and security administration, it has a license report, an inactive users report, Copilot usage reports and a License Optimization tab that suggests removals, downgrades, bundles and term changes with estimated monthly savings from an editable price list.",
    de: "Das CyberDrain Improved Partner Portal: ein kostenloses, mandantenfähiges Portal zur Verwaltung von Microsoft 365 unter AGPL-Lizenz, gebaut für MSPs und Microsoft-Partner, mit einem Modus für einzelne Tenants. Neben Konten, Postfächern, Geräten, Standards und Sicherheit bietet es einen Lizenzbericht, einen Bericht zu inaktiven Konten, Copilot-Nutzungsberichte und einen Reiter License Optimization, der Entzug, Verkleinerung, Bündelung und Laufzeitwechsel mit geschätzten Monatseinsparungen aus einer bearbeitbaren Preisliste vorschlägt.",
  },
  strengths: [
    {
      en: "Deeper Microsoft 365 license analysis: downgrade, bundle and monthly-to-yearly term suggestions based on what each person actually used, not only idle seats.",
      de: "Tiefere Analyse von Microsoft-365-Lizenzen: Vorschläge zu Verkleinerung, Bündelung und Wechsel von monatlicher zu jährlicher Laufzeit anhand der tatsächlichen Nutzung, nicht nur ungenutzte Lizenzen.",
    },
    {
      en: "Removes licenses from the same screen, in bulk, while LicenseMeter only generates a script for your admin to run.",
      de: "Entzieht Lizenzen direkt aus derselben Ansicht, auch gesammelt, während LicenseMeter nur ein Skript für Ihre Admins erzeugt.",
    },
    {
      en: "Multi-tenant by design through GDAP, with broad Microsoft 365 administration (standards and drift, security, Intune, Exchange) in the same tool.",
      de: "Von Grund auf mandantenfähig über GDAP, mit breiter Microsoft-365-Verwaltung (Standards und Abweichungen, Sicherheit, Intune, Exchange) im selben Werkzeug.",
    },
    {
      en: "An active project with frequent releases and an established MSP community.",
      de: "Ein aktives Projekt mit häufigen Releases und einer etablierten MSP-Community.",
    },
  ],
  pickThemIf: [
    {
      en: "You are an MSP already running CIPP for tenant administration: its optimization tab covers most Microsoft 365 license waste in a tool you use anyway.",
      de: "Sie sind ein MSP und nutzen CIPP bereits zur Tenant-Verwaltung: Der Optimierungsreiter deckt den Großteil der Microsoft-365-Lizenzverschwendung in einem Werkzeug ab, das Sie ohnehin verwenden.",
    },
    {
      en: "You want downgrade and term-change suggestions, or want to remove licenses from the same screen.",
      de: "Sie wollen Vorschläge zu Verkleinerung und Laufzeitwechsel, oder Lizenzen direkt in derselben Ansicht entziehen.",
    },
  ],
  pickUsIf: [
    {
      en: `You also need ${listJoin(NON_MICROSOFT_CONNECTORS)} checked against Entra ID, or OpenAI and Anthropic API spend tracked.`,
      de: `Sie wollen auch ${listJoin(NON_MICROSOFT_CONNECTORS, "und")} mit Entra ID abgleichen oder API-Kosten bei OpenAI und Anthropic verfolgen.`,
    },
    {
      en: "You want a tool whose access is read-only and cannot change the tenant.",
      de: "Sie wollen ein Werkzeug mit nur lesendem Zugriff, das den Tenant nicht ändern kann.",
    },
    {
      en: "You do not want to run an Azure subscription to self-host: LicenseMeter runs with Docker Compose anywhere, or free on licensemeter.com.",
      de: "Sie wollen für den Eigenbetrieb kein Azure-Abonnement unterhalten: LicenseMeter läuft mit Docker Compose überall, oder kostenlos auf licensemeter.com.",
    },
  ],
  pricing: {
    en: "Free to self-host in your own Azure subscription. Hosted CIPP from CyberDrain costs EUR 99 per month.",
    de: "Kostenlos im Eigenbetrieb in Ihrem eigenen Azure-Abonnement. Gehostetes CIPP von CyberDrain kostet 99 EUR pro Monat.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "Inactive Users report, and optimization flags disabled and inactive users over a 30 to 180 day window.",
        de: "Bericht zu inaktiven Konten; die Optimierung markiert deaktivierte und inaktive Konten über 30 bis 180 Tage.",
      },
      source: OPTIMIZATION,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "License report shows owned, used and available seats; optimization suggests reducing unassigned ones.",
        de: "Der Lizenzbericht zeigt gekaufte, genutzte und freie Lizenzen; die Optimierung schlägt vor, nicht zugewiesene zu reduzieren.",
      },
      source: LICENSES,
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "Copilot activity and adoption reports; optimization suggests removing never-used Copilot.",
        de: "Berichte zu Copilot-Aktivität und Einführung; die Optimierung schlägt vor, nie genutztes Copilot zu entziehen.",
      },
      source: `${DOCS}/copilot/reports/copilot-usage`,
    },
    costPerFinding: {
      value: "yes",
      note: {
        en: "Each suggestion carries an estimated monthly saving.",
        de: "Jeder Vorschlag trägt eine geschätzte Monatseinsparung.",
      },
      source: OPTIMIZATION,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Editable monthly per-seat prices per currency, with CSV import and export.",
        de: "Bearbeitbare Monatspreise je Lizenz und Währung, mit CSV-Import und -Export.",
      },
      source: `${LICENSES}/pricing`,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "License data comes from Microsoft 365; its integrations are PSA, documentation and RMM tools.",
        de: "Lizenzdaten kommen aus Microsoft 365; die Integrationen sind PSA-, Dokumentations- und RMM-Werkzeuge.",
      },
      source: `${DOCS}/cipp/integrations`,
    },
    shadowItDiscovery: notReviewed,
    aiApiSpend: notReviewed,
    endpointMetering: {
      value: "unknown",
      note: {
        en: "Shows apps Intune detected on devices, not whether they are used.",
        de: "Zeigt Anwendungen, die Intune auf Geräten erkannt hat, nicht ob sie genutzt werden.",
      },
      source: `${DOCS}/endpoint/reports/detected-apps`,
    },
    renewals: {
      value: "partial",
      note: {
        en: "Days until renewal per Microsoft subscription, marked as an estimate; no other vendors.",
        de: "Tage bis zur Verlängerung je Microsoft-Abonnement, als Schätzung markiert; keine anderen Anbieter.",
      },
      source: LICENSES,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Remove license from user, in bulk, straight from the optimization view.",
        de: "Lizenz entziehen, auch gesammelt, direkt aus der Optimierungsansicht.",
      },
      source: OPTIMIZATION,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "Deploys to your own Azure subscription (Web App, Storage, Key Vault).",
        de: "Installation in Ihrem eigenen Azure-Abonnement (Web App, Storage, Key Vault).",
      },
      source: "https://docs.cipp.app/setup/setting-up-cipp/install",
    },
    openSource: {
      value: "yes",
      note: { en: "AGPL-3.0.", de: "AGPL-3.0." },
      source: REPO,
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Self-hosting is free.",
        de: "Der Eigenbetrieb ist kostenlos.",
      },
      source: "https://cyberdrain.com/pricing/",
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "Hosted CIPP at EUR 99 per month.",
        de: "Gehostetes CIPP für 99 EUR pro Monat.",
      },
      source: "https://cyberdrain.com/pricing/",
    },
    mspMultiTenant: {
      value: "yes",
      note: {
        en: "Built for MSPs managing many client tenants through GDAP.",
        de: "Gebaut für MSPs mit vielen Kunden-Tenants über GDAP.",
      },
      source: REPO,
    },
    euHosting: notReviewed,
    softwareInventory: {
      value: "partial",
      note: {
        en: "Apps Intune detected on enrolled devices; no agent of its own.",
        de: "Von Intune erkannte Anwendungen auf verwalteten Geräten; kein eigener Agent.",
      },
      source: `${DOCS}/endpoint/reports/detected-apps`,
    },
    hardwareAssets: {
      value: "partial",
      note: {
        en: "Lists and manages Intune devices; no purchase or warranty records.",
        de: "Listet und verwaltet Intune-Geräte; keine Kauf- oder Garantiedaten.",
      },
      source: `${DOCS}/endpoint/mem/devices`,
    },
    hostedOption: {
      value: "yes",
      note: {
        en: "Hosted by CyberDrain at EUR 99 per month.",
        de: "Gehostet von CyberDrain für 99 EUR pro Monat.",
      },
      source: "https://cyberdrain.com/pricing/",
    },
  },
};
