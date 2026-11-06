import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Product } from "../types";

const HELP = "https://help.coreview.com";
const PRICING = "https://www.coreview.com/pricing";

export const coreview: Product = {
  slug: "coreview",
  name: "CoreView",
  url: "https://www.coreview.com",
  category: "m365",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A hosted platform for administering, securing and governing Microsoft 365 at scale: configuration backup and drift detection, delegated administration, workflows and bulk actions, and license optimization with chargeback. Built for enterprise and public-sector IT teams and sold through MSP and reseller partners.",
    de: "Eine gehostete Plattform, um Microsoft 365 im großen Maßstab zu verwalten, abzusichern und zu steuern: Konfigurationssicherung und Drift-Erkennung, delegierte Administration, Workflows und Massenaktionen sowie Lizenzoptimierung mit Kostenverrechnung. Gebaut für IT-Teams in Konzernen und im öffentlichen Sektor, vertrieben auch über MSP- und Reseller-Partner.",
  },
  strengths: [
    {
      en: "Acts on the tenant: onboarding and offboarding workflows assign and remove licenses, and bulk actions fix what the reports find.",
      de: "Handelt im Tenant: Workflows für Ein- und Austritte weisen Lizenzen zu und entziehen sie, Massenaktionen beheben, was die Berichte finden.",
    },
    {
      en: "License pools and virtual tenants delegate license administration to regions or business units, with cost reporting per department for chargeback.",
      de: "Lizenzpools und virtuelle Tenants delegieren die Lizenzverwaltung an Regionen oder Bereiche, mit Kostenberichten je Abteilung zur Verrechnung.",
    },
    {
      en: "Copilot policies for licensed users without Copilot activity or with low use over 30, 60 or 90 days.",
      de: "Copilot-Richtlinien für lizenzierte Personen ohne oder mit geringer Copilot-Aktivität über 30, 60 oder 90 Tage.",
    },
    {
      en: "Covers far more than licensing: backup and restore of thousands of tenant settings, CIS and Essential 8 baselines, access reviews and SIEM export.",
      de: "Deckt weit mehr als Lizenzen ab: Sicherung und Wiederherstellung tausender Tenant-Einstellungen, CIS- und Essential-8-Baselines, Zugriffsprüfungen und SIEM-Export.",
    },
  ],
  pickThemIf: [
    {
      en: "You run Microsoft 365 at enterprise scale and want administration, automation and configuration resilience in one platform, with licensing as one part of it.",
      de: "Sie betreiben Microsoft 365 im Konzernmaßstab und wollen Administration, Automatisierung und Konfigurationssicherheit in einer Plattform, mit Lizenzen als einem Teil davon.",
    },
    {
      en: "You need license administration delegated to business units and costs charged back by department.",
      de: "Sie müssen die Lizenzverwaltung an Bereiche delegieren und Kosten je Abteilung verrechnen.",
    },
  ],
  pickUsIf: [
    {
      en: "You want the license waste number for free, without a sales process, and nothing else from the platform.",
      de: "Sie wollen die Zahl zur Lizenzverschwendung kostenlos und ohne Vertriebsprozess, und sonst nichts von einer Plattform.",
    },
    {
      en: `You also need ${listJoin(NON_MICROSOFT_CONNECTORS)} checked against Entra ID.`,
      de: `Sie wollen auch ${listJoin(NON_MICROSOFT_CONNECTORS, "und")} mit Entra ID abgleichen.`,
    },
    {
      en: "You prefer a tool that can only read, or one you can self-host.",
      de: "Sie bevorzugen ein Werkzeug, das nur lesen kann, oder eines, das Sie selbst betreiben.",
    },
  ],
  pricing: {
    en: "Quote-based, by number of Microsoft 365 licensed identities. Every plan says Request pricing; there is no free plan.",
    de: "Auf Anfrage, nach Anzahl lizenzierter Microsoft-365-Identitäten. Jeder Tarif nennt nur Preis anfragen; einen kostenlosen Tarif gibt es nicht.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "The Optimization Center flags disabled licensed users and users whose primary licenses were inactive for at least 90 days.",
        de: "Das Optimization Center zeigt deaktivierte lizenzierte Konten und Konten, deren Hauptlizenzen mindestens 90 Tage inaktiv waren.",
      },
      source: `${HELP}/understanding-the-optimization-center`,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "Reports on unused, unassigned and over-assigned licenses; the License Pools Center shows available licenses per pool.",
        de: "Berichte zu ungenutzten, nicht zugewiesenen und überzähligen Lizenzen; das License Pools Center zeigt freie Lizenzen je Pool.",
      },
      source: "https://www.coreview.com/license-management",
    },
    copilotUsage: {
      value: "yes",
      note: {
        en: "Copilot usage report and policies for users without or with low Copilot activity over 30, 60 or 90 days.",
        de: "Copilot-Nutzungsbericht und Richtlinien für Konten ohne oder mit geringer Copilot-Aktivität über 30, 60 oder 90 Tage.",
      },
      source: `${HELP}/copilot/copilot-capabilities-in-coreview`,
    },
    costPerFinding: {
      value: "partial",
      note: {
        en: "Shows licenses with their cost and splits costs by department; the docs do not show a figure on each individual finding.",
        de: "Zeigt Lizenzen mit Kosten und teilt Kosten nach Abteilung auf; eine Zahl je einzelnem Fund zeigt die Dokumentation nicht.",
      },
      source: `${HELP}/understanding-the-optimization-center`,
    },
    customPrices: {
      value: "yes",
      note: {
        en: "Manage Price per Unit sets your own price per SKU.",
        de: "Mit Manage Price per Unit setzen Sie einen eigenen Preis je SKU.",
      },
      source: `${HELP}/subscription-center-understanding-warning-units-and-updating-price-per-unit`,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Microsoft 365 and on-premises Active Directory and Exchange; no other SaaS license sources are listed.",
        de: "Microsoft 365 sowie lokales Active Directory und Exchange; andere SaaS-Lizenzquellen sind nicht aufgeführt.",
      },
      source: PRICING,
    },
    shadowItDiscovery: {
      value: "partial",
      note: {
        en: "Reports on apps registered in Entra ID and app consent; nothing outside Entra is described.",
        de: "Berichte zu in Entra ID registrierten Anwendungen und Zustimmungen; außerhalb von Entra ist nichts beschrieben.",
      },
      source: PRICING,
    },
    aiApiSpend: {
      value: "unknown",
      note: {
        en: "Not described on its pages.",
        de: "Auf den Seiten nicht beschrieben.",
      },
      source: PRICING,
    },
    endpointMetering: {
      value: "unknown",
      note: {
        en: "Intune reporting and management; software usage metering is not described.",
        de: "Intune-Berichte und -Verwaltung; eine Messung der Software-Nutzung ist nicht beschrieben.",
      },
      source: PRICING,
    },
    renewals: {
      value: "partial",
      note: {
        en: "Flags licenses in the grace period after a subscription expires; no general contract tracking described.",
        de: "Markiert Lizenzen in der Kulanzzeit nach Ablauf eines Abonnements; allgemeine Vertragsverwaltung ist nicht beschrieben.",
      },
      source: `${HELP}/subscription-center-understanding-warning-units-and-updating-price-per-unit`,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "Workflows, bulk actions and lifecycle templates assign or remove licenses. Reporting is read-only; management actions need an extra Graph consent.",
        de: "Workflows, Massenaktionen und Vorlagen weisen Lizenzen zu oder entziehen sie. Berichte laufen nur lesend; Verwaltungsaktionen brauchen eine zusätzliche Graph-Zustimmung.",
      },
      source: `${HELP}/onboarding-credentials-and-permissions-list`,
    },
    selfHost: {
      value: "no",
      note: {
        en: "Hosted service; you pick a CoreView data center at registration.",
        de: "Gehosteter Dienst; das CoreView-Rechenzentrum wählen Sie bei der Registrierung.",
      },
      source: `${HELP}/onboarding-process/onboarding-registration`,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: PRICING,
    },
    freeTier: {
      value: "no",
      note: {
        en: "No free plan for the platform; there are separate free tools and a trial.",
        de: "Kein kostenloser Tarif für die Plattform; es gibt separate kostenlose Werkzeuge und eine Testphase.",
      },
      source: PRICING,
    },
    publicPricing: {
      value: "no",
      note: {
        en: "Every plan shows Request pricing.",
        de: "Jeder Tarif zeigt nur Preis anfragen.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "yes",
      note: {
        en: "Multi-tenant dashboard and a partner app for MSPs and distributors.",
        de: "Mandantenübergreifendes Dashboard und eine Partner-App für MSPs und Distributoren.",
      },
      source: `${HELP}/en_US/multi-tenant-dashboard`,
    },
    euHosting: {
      value: "yes",
      note: {
        en: "A Europe data center (North Europe, Ireland) can be chosen at registration and not changed later.",
        de: "Ein europäisches Rechenzentrum (North Europe, Irland) ist bei der Registrierung wählbar und später nicht änderbar.",
      },
      source: `${HELP}/onboarding-process/onboarding-registration`,
    },
  },
};
