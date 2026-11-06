import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Roundup } from "../types";
import { SOURCED } from "./shared";

export const bestOpenSourceTools: Roundup = {
  slug: "best-open-source-license-management-tools",
  title: {
    en: "The best open-source license management tools",
    de: "Die besten Open-Source-Tools für Lizenzmanagement",
  },
  description: {
    en: "Open-source tools for software license management compared: LicenseMeter, CIPP, Snipe-IT, GLPI, iTop and Ralph. Which ones find unused Microsoft 365 seats, which keep an asset register, licenses, hosting and sourced features.",
    de: "Open-Source-Tools für Software-Lizenzmanagement im Vergleich: LicenseMeter, CIPP, Snipe-IT, GLPI, iTop und Ralph. Welche ungenutzte Microsoft-365-Lizenzen finden, welche ein Asset-Verzeichnis führen, Lizenzen, Hosting und belegte Funktionen.",
  },
  intro: [
    {
      en: "Open-source license tools fall into two groups. Asset management suites (Snipe-IT, GLPI, iTop and Ralph) keep a register of what you bought: you enter licenses, and they track who has what and when it expires. Two tools read Microsoft 365 directly and find waste on their own: CIPP and LicenseMeter.",
      de: "Open-Source-Tools für Lizenzen teilen sich in zwei Gruppen. Asset-Management-Suiten (Snipe-IT, GLPI, iTop und Ralph) führen ein Verzeichnis dessen, was Sie gekauft haben: Sie erfassen Lizenzen, und die Tools verfolgen, wer was hat und wann es abläuft. Zwei Tools lesen Microsoft 365 direkt und finden Verschwendung selbst: CIPP und LicenseMeter.",
    },
    {
      en: "When we searched in November 2026 we did not find another maintained open-source project that reads seat data from SaaS vendors' APIs.",
      de: "Bei unserer Suche im November 2026 haben wir kein weiteres gepflegtes Open-Source-Projekt gefunden, das Lizenzdaten über die APIs von SaaS-Anbietern liest.",
    },
  ],
  criteria: [
    {
      en: "Released under an open-source license, with a release or commit in the last 12 months.",
      de: "Unter einer Open-Source-Lizenz veröffentlicht, mit einem Release oder Commit in den letzten 12 Monaten.",
    },
    {
      en: "It tracks software licenses, either as records you maintain or by reading them from the source.",
      de: "Es verwaltet Software-Lizenzen, entweder als gepflegte Einträge oder direkt aus der Quelle gelesen.",
    },
    SOURCED,
  ],
  entries: [
    {
      product: "licensemeter",
      bestFor: {
        en: "Finding and pricing unused Microsoft 365 and SaaS seats without keeping a register by hand.",
        de: "Ungenutzte Microsoft-365- und SaaS-Lizenzen finden und beziffern, ohne ein Verzeichnis von Hand zu pflegen.",
      },
      verdict: {
        en: `MIT-licensed. Reads Microsoft 365 plus ${listJoin(NON_MICROSOFT_CONNECTORS)}, and prices each finding. It is not an asset register: no hardware, no helpdesk, and it never changes a license itself.`,
        de: `MIT-lizenziert. Liest Microsoft 365 sowie ${listJoin(NON_MICROSOFT_CONNECTORS, "und")} und beziffert jeden Fund. Es ist kein Asset-Verzeichnis: keine Hardware, kein Helpdesk, und es ändert nie selbst eine Lizenz.`,
      },
    },
    {
      product: "cipp",
      bestFor: {
        en: "MSPs managing many Microsoft 365 tenants.",
        de: "MSPs, die viele Microsoft-365-Tenants verwalten.",
      },
      verdict: {
        en: "The other open-source tool that reads Microsoft 365 licenses directly, with priced optimization suggestions and the ability to remove licenses. Microsoft 365 only.",
        de: "Das andere Open-Source-Tool, das Microsoft-365-Lizenzen direkt liest, mit bezifferten Optimierungsvorschlägen und der Möglichkeit, Lizenzen zu entziehen. Nur Microsoft 365.",
      },
    },
    {
      product: "snipe-it",
      bestFor: {
        en: "A register of hardware and licenses, checked out to people.",
        de: "Ein Verzeichnis von Hardware und Lizenzen, ausgegeben an Personen.",
      },
      verdict: {
        en: "The most popular open-source asset register. Licenses are entered by hand, so nothing finds idle seats for you.",
        de: "Das bekannteste quelloffene Asset-Verzeichnis. Lizenzen werden von Hand erfasst, ungenutzte Lizenzen findet niemand für Sie.",
      },
    },
    {
      product: "glpi",
      bestFor: {
        en: "A full service desk with hardware and software inventory.",
        de: "Ein vollständiger Service Desk mit Hardware- und Software-Inventar.",
      },
      verdict: {
        en: "Its agent sees installed software on every device; Microsoft 365 and SaaS seats are entered by hand.",
        de: "Sein Agent sieht installierte Software auf jedem Gerät; Microsoft-365- und SaaS-Lizenzen werden von Hand erfasst.",
      },
    },
    {
      product: "itop",
      bestFor: {
        en: "An ITIL service desk with a configurable CMDB.",
        de: "Ein ITIL-Service-Desk mit konfigurierbarer CMDB.",
      },
      verdict: {
        en: "Licenses and contracts live in the CMDB next to everything that uses them. Microsoft Graph and Intune collectors import people and devices, not licenses.",
        de: "Lizenzen und Verträge liegen in der CMDB neben allem, was sie nutzt. Kollektoren für Microsoft Graph und Intune importieren Personen und Geräte, keine Lizenzen.",
      },
    },
    {
      product: "ralph",
      bestFor: {
        en: "Data center hardware and its licenses.",
        de: "Rechenzentrums-Hardware und ihre Lizenzen.",
      },
      verdict: {
        en: "Strong on hardware life cycle and data center layouts. Published by Allegro as sources only since 2025.",
        de: "Stark bei Hardware-Lebenszyklus und Rechenzentrumslayouts. Seit 2025 von Allegro nur als Quellcode veröffentlicht.",
      },
    },
  ],
  featureKeys: [
    "m365InactiveUsers",
    "m365UnassignedSeats",
    "copilotUsage",
    "costPerFinding",
    "customPrices",
    "nonMicrosoftSaas",
    "renewals",
    "softwareInventory",
    "hardwareAssets",
    "automatedRemediation",
    "hostedOption",
  ],
  updated: "2026-11-06",
};
