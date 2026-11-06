import type { Roundup } from "../types";
import { CURRENT, LICENSEMETER_GAPS, SOURCED } from "./shared";

export const bestM365Tools: Roundup = {
  slug: "best-microsoft-365-license-management-tools",
  title: {
    en: "The best Microsoft 365 license management tools",
    de: "Die besten Tools für Microsoft-365-Lizenzmanagement",
  },
  description: {
    en: "An honest comparison of tools that find unused Microsoft 365 licenses: LicenseMeter, the admin center, CIPP, CoreView, AdminDroid, AvePoint Elements and ENow, with sourced features, prices and who each one suits.",
    de: "Ein ehrlicher Vergleich von Tools, die ungenutzte Microsoft-365-Lizenzen finden: LicenseMeter, Admin Center, CIPP, CoreView, AdminDroid, AvePoint Elements und ENow, mit belegten Funktionen, Preisen und für wen sich welches eignet.",
  },
  intro: [
    {
      en: "Every tool on this list reads the same Microsoft Graph data. What separates them is what they do with it: whether they join activity per person, put a cost on each wasted seat, remove the seat themselves, and what they cost to run.",
      de: "Jedes Tool in dieser Liste liest dieselben Daten aus Microsoft Graph. Der Unterschied liegt darin, was es daraus macht: ob es die Aktivität je Person zusammenführt, jede verschwendete Lizenz beziffert, die Lizenz selbst entzieht, und was der Betrieb kostet.",
    },
  ],
  criteria: [
    {
      en: "It finds Microsoft 365 license waste itself (inactive, disabled or unassigned seats), not just license counts.",
      de: "Es findet Microsoft-365-Lizenzverschwendung selbst (inaktive, deaktivierte oder nicht zugewiesene Lizenzen), nicht nur Lizenzzahlen.",
    },
    CURRENT,
    SOURCED,
  ],
  entries: [
    {
      product: "licensemeter",
      bestFor: {
        en: "Admins and MSPs who want the waste priced and watched every night, for free, with read-only access.",
        de: "Admins und MSPs, die die Verschwendung jede Nacht beziffert und überwacht sehen wollen, kostenlos und nur lesend.",
      },
      verdict: LICENSEMETER_GAPS,
    },
    {
      product: "m365-admin-center",
      bestFor: {
        en: "Small tenants and spot checks.",
        de: "Kleine Tenants und Stichproben.",
      },
      verdict: {
        en: "The baseline every other tool reads from, and free. Joining activity per person and attaching costs is manual work.",
        de: "Die Grundlage, aus der alle anderen Tools lesen, und kostenlos. Aktivität je Person zusammenführen und Kosten zuordnen ist Handarbeit.",
      },
    },
    {
      product: "cipp",
      bestFor: {
        en: "MSPs who want a free, open-source portal that also acts on its findings.",
        de: "MSPs, die ein kostenloses quelloffenes Portal wollen, das auch selbst handelt.",
      },
      verdict: {
        en: "The strongest free option for MSPs. Its optimization tab suggests removals, downgrades and term changes with savings and can remove licenses itself. Microsoft 365 only, and self-hosting needs an Azure subscription.",
        de: "Die stärkste kostenlose Option für MSPs. Der Optimierungsreiter schlägt Entzug, Verkleinerung und Laufzeitwechsel mit Einsparungen vor und kann Lizenzen selbst entziehen. Nur Microsoft 365, und der Eigenbetrieb braucht ein Azure-Abonnement.",
      },
    },
    {
      product: "coreview",
      bestFor: {
        en: "Enterprises that want administration, automation and configuration resilience in one platform.",
        de: "Konzerne, die Administration, Automatisierung und Konfigurationssicherheit in einer Plattform wollen.",
      },
      verdict: {
        en: "License optimization with license pools and chargeback is one part of a much broader Microsoft 365 platform. Quote-based.",
        de: "Lizenzoptimierung mit Lizenzpools und Kostenverrechnung ist ein Teil einer viel breiteren Microsoft-365-Plattform. Preise auf Anfrage.",
      },
    },
    {
      product: "admindroid",
      bestFor: {
        en: "Admins who want broad Microsoft 365 reporting on their own Windows server.",
        de: "Admins, die breite Microsoft-365-Berichte auf dem eigenen Windows-Server wollen.",
      },
      verdict: {
        en: "A generous free edition and 1,500+ reports. Cost estimates come from a separate free PowerShell script rather than the product.",
        de: "Eine großzügige kostenlose Edition und über 1.500 Berichte. Kostenschätzungen kommen aus einem separaten kostenlosen PowerShell-Skript statt aus dem Produkt.",
      },
    },
    {
      product: "avepoint-elements",
      bestFor: {
        en: "MSPs standardizing client tenants on the Elements platform.",
        de: "MSPs, die Kunden-Tenants auf der Elements-Plattform standardisieren.",
      },
      verdict: {
        en: "License optimization across client tenants, at no extra cost with other Elements modules, and EU data centers including Germany.",
        de: "Lizenzoptimierung über alle Kunden-Tenants, ohne Aufpreis zu anderen Elements-Modulen, und Rechenzentren in der EU einschließlich Deutschland.",
      },
    },
    {
      product: "enow",
      bestFor: {
        en: "Enterprises preparing a Microsoft Enterprise Agreement renewal.",
        de: "Konzerne, die die Verlängerung eines Microsoft Enterprise Agreements vorbereiten.",
      },
      verdict: {
        en: "Looks for overlapping and duplicate licenses and downgrade candidates, priced with your agreement, with optional negotiation consulting.",
        de: "Sucht überlappende und doppelte Lizenzen sowie Kandidaten zum Verkleinern, beziffert mit Ihrem Vertrag, mit optionaler Verhandlungsberatung.",
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
    "automatedRemediation",
    "selfHost",
    "freeTier",
    "publicPricing",
    "mspMultiTenant",
    "euHosting",
  ],
  updated: "2026-11-06",
};
