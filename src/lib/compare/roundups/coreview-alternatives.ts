import type { Roundup } from "../types";
import { CURRENT, LICENSEMETER_GAPS, SOURCED } from "./shared";

export const coreviewAlternatives: Roundup = {
  slug: "coreview-alternatives",
  subject: "coreview",
  title: {
    en: "CoreView alternatives for Microsoft 365 license optimization",
    de: "CoreView-Alternativen für die Optimierung von Microsoft-365-Lizenzen",
  },
  description: {
    en: "Alternatives to CoreView for finding and reclaiming unused Microsoft 365 licenses: LicenseMeter, CIPP, AvePoint Elements, AdminDroid, ENow and the admin center, with sourced features and prices.",
    de: "Alternativen zu CoreView, um ungenutzte Microsoft-365-Lizenzen zu finden und zurückzuholen: LicenseMeter, CIPP, AvePoint Elements, AdminDroid, ENow und das Admin Center, mit belegten Funktionen und Preisen.",
  },
  intro: [
    {
      en: "CoreView is a broad Microsoft 365 platform: administration, automation, configuration backup and license optimization. Which alternative fits depends on which part you need. If it is mainly the license number, a narrower tool may do; if it is multi-tenant management for clients, look at the MSP tools; if it is configuration resilience, most tools here do not replace it.",
      de: "CoreView ist eine breite Microsoft-365-Plattform: Administration, Automatisierung, Konfigurationssicherung und Lizenzoptimierung. Welche Alternative passt, hängt davon ab, welchen Teil Sie brauchen. Geht es vor allem um die Lizenzzahl, reicht oft ein schmaleres Tool; geht es um die Verwaltung vieler Kunden-Tenants, lohnen die MSP-Tools; geht es um Konfigurationssicherheit, ersetzen die meisten Tools hier CoreView nicht.",
    },
  ],
  criteria: [
    {
      en: "It covers CoreView's license optimization job: finding inactive, disabled or unassigned Microsoft 365 seats.",
      de: "Es deckt die Lizenzoptimierung von CoreView ab: inaktive, deaktivierte oder nicht zugewiesene Microsoft-365-Lizenzen finden.",
    },
    CURRENT,
    SOURCED,
  ],
  entries: [
    {
      product: "licensemeter",
      bestFor: {
        en: "Teams that bought a platform for the license number and want that number free.",
        de: "Teams, die eine Plattform für die Lizenzzahl gekauft haben und diese Zahl kostenlos wollen.",
      },
      verdict: {
        en: `Covers the license waste part, priced per finding, plus non-Microsoft SaaS and AI API spend. It does none of CoreView's administration, backup or automation. ${LICENSEMETER_GAPS.en}`,
        de: `Deckt den Teil zur Lizenzverschwendung ab, beziffert je Fund, dazu SaaS anderer Anbieter und KI-API-Kosten. Administration, Sicherung oder Automatisierung wie bei CoreView bietet es nicht. ${LICENSEMETER_GAPS.de}`,
      },
    },
    {
      product: "cipp",
      bestFor: {
        en: "MSPs who want a free multi-tenant portal for administration and licenses.",
        de: "MSPs, die ein kostenloses mandantenfähiges Portal für Administration und Lizenzen wollen.",
      },
      verdict: {
        en: "The closest free alternative for MSPs: tenant standards and drift, administration, and priced license optimization that can remove licenses.",
        de: "Die nächstliegende kostenlose Alternative für MSPs: Tenant-Standards und Abweichungen, Administration und bezifferte Lizenzoptimierung, die Lizenzen entziehen kann.",
      },
    },
    {
      product: "avepoint-elements",
      bestFor: {
        en: "MSPs who want a commercial multi-tenant platform with EU data centers.",
        de: "MSPs, die eine kommerzielle mandantenfähige Plattform mit Rechenzentren in der EU wollen.",
      },
      verdict: {
        en: "License optimization across client tenants inside a wider managed-service platform, at no extra cost with its other modules.",
        de: "Lizenzoptimierung über Kunden-Tenants in einer breiteren Managed-Service-Plattform, ohne Aufpreis zu den anderen Modulen.",
      },
    },
    {
      product: "admindroid",
      bestFor: {
        en: "Admins who want reporting, auditing and management on their own server.",
        de: "Admins, die Berichte, Auditing und Verwaltung auf dem eigenen Server wollen.",
      },
      verdict: {
        en: "Broad reporting with a free edition and published prices. It runs on-premises only.",
        de: "Breite Berichte mit kostenloser Edition und veröffentlichten Preisen. Es läuft nur lokal.",
      },
    },
    {
      product: "enow",
      bestFor: {
        en: "Enterprises focused on the next Enterprise Agreement renewal.",
        de: "Konzerne mit Fokus auf die nächste Verlängerung des Enterprise Agreements.",
      },
      verdict: {
        en: "Overlap, duplicate and downgrade analysis priced with your agreement, and negotiation consulting.",
        de: "Analyse von Überlappungen, Doppelungen und Verkleinerungen, beziffert mit Ihrem Vertrag, und Verhandlungsberatung.",
      },
    },
    {
      product: "m365-admin-center",
      bestFor: {
        en: "Small tenants that can review licenses by hand.",
        de: "Kleine Tenants, die Lizenzen von Hand prüfen können.",
      },
      verdict: {
        en: "Free and authoritative, without per-person joins, cost figures or automation.",
        de: "Kostenlos und maßgeblich, ohne Zusammenführung je Person, Kostenzahlen oder Automatisierung.",
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
