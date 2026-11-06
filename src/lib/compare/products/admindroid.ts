import { listJoin, NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Product } from "../types";

const LICENSES =
  "https://admindroid.com/microsoft-365-license-usage-and-reporting";
const PRICING = "https://admindroid.com/pricing";
const GENERAL_FAQ =
  "https://admindroid.com/resources/pdf/product/microsoft365-management/general-faq.pdf";
const LICENSING_FAQ =
  "https://admindroid.com/resources/pdf/product/microsoft365-management/licensing-faq.pdf";
const SCRIPT =
  "https://blog.admindroid.com/free-microsoft-365-license-cost-optimization-tool-using-powershell/";

export const admindroid: Product = {
  slug: "admindroid",
  name: "AdminDroid",
  url: "https://admindroid.com",
  category: "m365",
  checkedOn: "2026-11-06",
  headToHead: true,
  summary: {
    en: "A Microsoft 365 and Active Directory reporting, auditing and management application that you install on your own Windows server. It has a free edition and paid editions with 1,500+ reports, alerts, delegation and automation, including license and subscription reports.",
    de: "Eine Anwendung für Berichte, Auditing und Verwaltung von Microsoft 365 und Active Directory, die Sie auf Ihrem eigenen Windows-Server installieren. Es gibt eine kostenlose Edition und Bezahl-Editionen mit über 1.500 Berichten, Alarmen, Delegation und Automatisierung, darunter Lizenz- und Abonnementberichte.",
  },
  strengths: [
    {
      en: "A free edition with no expiry and no tenant size limit, including 140+ Entra ID reports on users, licenses and groups.",
      de: "Eine kostenlose Edition ohne Ablauf und ohne Größenlimit, mit über 140 Entra-ID-Berichten zu Konten, Lizenzen und Gruppen.",
    },
    {
      en: "Reporting and auditing far beyond licensing: 1,500+ reports across the major Microsoft 365 workloads, compliance packages and alerting.",
      de: "Berichte und Auditing weit über Lizenzen hinaus: über 1.500 Berichte zu den wichtigen Microsoft-365-Diensten, Compliance-Pakete und Alarme.",
    },
    {
      en: "Can make changes from the same portal, with automation templates and approval workflows in paid editions.",
      de: "Kann Änderungen aus demselben Portal vornehmen, mit Automatisierungsvorlagen und Freigabe-Workflows in den Bezahl-Editionen.",
    },
    {
      en: "Runs entirely in your environment; collected data stays on the machine it is installed on.",
      de: "Läuft vollständig in Ihrer Umgebung; gesammelte Daten bleiben auf dem Rechner der Installation.",
    },
  ],
  pickThemIf: [
    {
      en: "You want broad Microsoft 365 and Active Directory reporting and auditing, with license reports as one part of it.",
      de: "Sie wollen breite Berichte und Auditing für Microsoft 365 und Active Directory, mit Lizenzberichten als einem Teil davon.",
    },
    {
      en: "You need everything to run on a Windows server you control.",
      de: "Alles soll auf einem Windows-Server laufen, den Sie selbst kontrollieren.",
    },
  ],
  pickUsIf: [
    {
      en: "You want each waste finding priced in the product, including unused Copilot seats, without running a separate script.",
      de: "Sie wollen jeden Fund im Produkt beziffert, einschließlich ungenutzter Copilot-Lizenzen, ohne ein separates Skript.",
    },
    {
      en: "You want read-only access: AdminDroid's data collection already asks for Directory.ReadWrite.All.",
      de: "Sie wollen nur lesenden Zugriff: Die Datensammlung von AdminDroid fordert bereits Directory.ReadWrite.All an.",
    },
    {
      en: `You also need ${listJoin(NON_MICROSOFT_CONNECTORS)} checked against Entra ID.`,
      de: `Sie wollen auch ${listJoin(NON_MICROSOFT_CONNECTORS, "und")} mit Entra ID abgleichen.`,
    },
  ],
  pricing: {
    en: "Free edition with no expiry. Paid editions are yearly and priced by licensed users: for 150 users, Standard $198, Pro $298 and Pro Plus $347 per year. Multi-tenant support is an add-on.",
    de: "Kostenlose Edition ohne Ablauf. Bezahl-Editionen laufen jährlich und richten sich nach lizenzierten Konten: für 150 Konten Standard 198 $, Pro 298 $ und Pro Plus 347 $ pro Jahr. Mandantenfähigkeit ist ein Zusatzmodul.",
  },
  features: {
    m365InactiveUsers: {
      value: "yes",
      note: {
        en: "License reports for users with disabled sign-in, and an inactive users report suite.",
        de: "Lizenzberichte zu Konten mit deaktivierter Anmeldung und eine Berichtsgruppe zu inaktiven Konten.",
      },
      source: LICENSES,
    },
    m365UnassignedSeats: {
      value: "yes",
      note: {
        en: "The Unused Subscriptions report shows purchased units assigned to nobody.",
        de: "Der Bericht Unused Subscriptions zeigt gekaufte Einheiten, die niemandem zugewiesen sind.",
      },
      source: LICENSES,
    },
    copilotUsage: {
      value: "unknown",
      note: {
        en: "No report of unused Copilot licenses found on its pages.",
        de: "Kein Bericht zu ungenutzten Copilot-Lizenzen auf den Seiten gefunden.",
      },
      source: SCRIPT,
    },
    costPerFinding: {
      value: "partial",
      note: {
        en: "A separate free PowerShell script estimates monthly savings; the main product's reports were not shown with cost figures.",
        de: "Ein separates kostenloses PowerShell-Skript schätzt monatliche Einsparungen; für die Berichte des Hauptprodukts haben wir keine Darstellung mit Kostenangaben gefunden.",
      },
      source: SCRIPT,
    },
    customPrices: {
      value: "partial",
      note: {
        en: "The free script reads your prices from a CSV file.",
        de: "Das kostenlose Skript liest Ihre Preise aus einer CSV-Datei.",
      },
      source: SCRIPT,
    },
    nonMicrosoftSaas: {
      value: "no",
      note: {
        en: "Microsoft 365 and on-premises Active Directory only.",
        de: "Nur Microsoft 365 und lokales Active Directory.",
      },
      source: PRICING,
    },
    shadowItDiscovery: {
      value: "unknown",
      note: {
        en: "Entra application reports exist; discovery of unsanctioned apps is not described.",
        de: "Es gibt Berichte zu Entra-Anwendungen; das Aufspüren nicht freigegebener Anwendungen ist nicht beschrieben.",
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
        en: "A workstation add-on audits security events; software usage metering is not described.",
        de: "Ein Zusatzmodul prüft Sicherheitsereignisse auf Arbeitsplätzen; eine Messung der Software-Nutzung ist nicht beschrieben.",
      },
      source: LICENSING_FAQ,
    },
    renewals: {
      value: "partial",
      note: {
        en: "Reports on expiring Microsoft 365 subscriptions and a renewal reminder in Pro Plus; no contracts for other vendors.",
        de: "Berichte zu ablaufenden Microsoft-365-Abonnements und eine Verlängerungserinnerung in Pro Plus; keine Verträge anderer Anbieter.",
      },
      source: LICENSES,
    },
    automatedRemediation: {
      value: "yes",
      note: {
        en: "License management, automation templates and approval workflows in paid editions. AdminDroid says it does not write without your approval.",
        de: "Lizenzverwaltung, Automatisierungsvorlagen und Freigabe-Workflows in den Bezahl-Editionen. AdminDroid sagt, ohne Ihre Freigabe wird nichts geschrieben.",
      },
      source: GENERAL_FAQ,
    },
    selfHost: {
      value: "yes",
      note: {
        en: "On-premises only, on Windows or Windows Server with a bundled PostgreSQL database.",
        de: "Nur lokal, auf Windows oder Windows Server mit mitgelieferter PostgreSQL-Datenbank.",
      },
      source: GENERAL_FAQ,
    },
    openSource: {
      value: "no",
      note: { en: "Proprietary.", de: "Proprietär." },
      source: GENERAL_FAQ,
    },
    freeTier: {
      value: "yes",
      note: {
        en: "Free edition with lifetime access and no tenant size limit.",
        de: "Kostenlose Edition mit unbegrenzter Laufzeit und ohne Größenlimit.",
      },
      source: LICENSING_FAQ,
    },
    publicPricing: {
      value: "yes",
      note: {
        en: "A price calculator on the website.",
        de: "Ein Preisrechner auf der Website.",
      },
      source: PRICING,
    },
    mspMultiTenant: {
      value: "yes",
      note: {
        en: "Through the M365 Tenants add-on; Pro Plus adds GDAP and rebranding.",
        de: "Über das Zusatzmodul M365 Tenants; Pro Plus ergänzt GDAP und eigenes Branding.",
      },
      source: LICENSING_FAQ,
    },
    euHosting: {
      value: "yes",
      note: {
        en: "Data stays wherever you install it; there is no vendor-hosted version.",
        de: "Die Daten bleiben dort, wo Sie installieren; eine vom Anbieter gehostete Version gibt es nicht.",
      },
      source: GENERAL_FAQ,
    },
  },
};
