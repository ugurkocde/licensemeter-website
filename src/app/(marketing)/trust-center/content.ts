import type { DpaLang } from "~/lib/dpa";

/**
 * Bilingual content for the Trust Center, mirroring the single-source-of-truth
 * pattern in ~/lib/dpa: one typed structure per language so the EN x DE
 * surfaces can never drift. Each language is server-rendered at its own URL
 * (/trust-center and /de/trust-center). The subprocessor rows are NOT
 * duplicated here, they are read from ~/lib/dpa (subprocessorRows) so the table
 * stays sourced from the binding agreement.
 */

type GlanceItem = { label: string; detail: string };
type DocItem = { href: string; label: string; detail: string };

/** A paragraph that embeds a single internal link. */
type LinkedText = { pre: string; linkText: string; href: string; post: string };

export type TrustContent = {
  eyebrow: string;
  h1: string;
  intro: string;
  toggleLabel: string;
  atAGlance: { title: string; items: GlanceItem[] };
  where: {
    title: string;
    intro: string;
    locationLabel: string;
    transferLabel: string;
    euLabel: string;
    usLabel: string;
    note: {
      pre: string;
      bold: string;
      mid: string;
      linkText: string;
      href: string;
      post: string;
    };
  };
  access: { title: string; body: string; linked: LinkedText };
  security: { title: string; body: string; linked: LinkedText };
  lifecycle: { title: string; linked: LinkedText };
  certs: { title: string; body1: string; body2: string };
  documents: { title: string; items: DocItem[] };
  questions: { title: string; body: string };
};

const EN: TrustContent = {
  eyebrow: "Trust Center",
  h1: "Everything your security team needs, in one place.",
  intro:
    "LicenseMeter reads license and directory metadata from your Microsoft 365 tenant, so trust is the whole product. This page brings together how we access data, where it lives, who processes it, and the documents that back it up. Everything here is sourced from the same agreements we sign with you.",
  toggleLabel: "Choose language",
  atAGlance: {
    title: "At a glance",
    items: [
      {
        label: "Read-only access",
        detail:
          "Application permissions are read-only without exception. We can never change anything in your tenant.",
      },
      {
        label: "EU data residency",
        detail:
          "Customer data is stored in the EU, in a Supabase Postgres database on AWS eu-central-1 (Frankfurt).",
      },
      {
        label: "Delete on disconnect",
        detail:
          "Disconnecting a workspace deletes all synced data immediately and irreversibly.",
      },
      {
        label: "GDPR DPA, pre-signed",
        detail:
          "An Art. 28 GDPR data processing agreement is included for every workspace, downloadable and pre-signed.",
      },
      {
        label: "Encrypted throughout",
        detail:
          "TLS in transit, AES-256 at rest, and AES-256-GCM at the app layer for any third-party credentials.",
      },
      {
        label: "Cookieless analytics",
        detail:
          "No tracking or marketing cookies, no consent banner. Aggregated, IP-free Vercel Web Analytics.",
      },
    ],
  },
  where: {
    title: "Where your data lives",
    intro:
      "These are the sub-processors LicenseMeter engages, with their processing location and the transfer mechanism that covers it. The list is rendered from the binding Data Processing Agreement, so it is always the same list you sign.",
    locationLabel: "Location",
    transferLabel: "Transfer",
    euLabel: "EU",
    usLabel: "EU + US",
    note: {
      pre: "Optional source systems you connect (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic) and any CSV member lists you import (ChatGPT, Claude) are ",
      bold: "data sources, not sub-processors",
      mid: ": we read from them on your behalf and disclose no personal data to them beyond the authenticated read request. The definitive list is ",
      linkText: "Annex 3 of the DPA",
      href: "/dpa#annex-3",
      post: ".",
    },
  },
  access: {
    title: "How access works",
    body: "A Global Administrator grants consent once, through Microsoft's standard admin-consent dialog, for application permissions that are read-only without exception. There is no service account, agent or mailbox plugin in your tenant, and you can revoke the application in Entra ID at any time, independently of us. Usage reports are consumed as counts and last-activity dates only: metadata, never content.",
    linked: {
      pre: "The ",
      linkText: "Security overview",
      href: "/security",
      post: " lists every requested scope, what is stored, and how to delegate the consent without standing Global Administrator rights.",
    },
  },
  security: {
    title: "Security measures",
    body: "Access to a workspace is invite-based and role-based (owner, admin, viewer); sign-in is Microsoft Entra ID over OpenID Connect with PKCE, with a signed, httpOnly session cookie that expires after 30 days. Data is encrypted in transit (TLS, HSTS) and at rest (AES-256), with bring-your-own connector credentials additionally encrypted at the application layer (AES-256-GCM). Tenants are logically separated in the application layer on every query. PostgreSQL row-level security additionally blocks every database role other than the application role. State-changing requests are CSRF-protected and rate-limited, and a per-workspace audit log records exports and administrative actions.",
    linked: {
      pre: "The full technical and organizational measures are ",
      linkText: "Annex 2 of the DPA",
      href: "/dpa#annex-2",
      post: ".",
    },
  },
  lifecycle: {
    title: "Data lifecycle",
    linked: {
      pre: "Data is collected only by the read-only sync, retained only while your tenant is connected, and deleted on disconnect. Disconnecting a workspace (Settings → Danger zone) deletes all synced data immediately and irreversibly: users, findings, prices, history and the audit log. Revoking the enterprise application in your Entra ID additionally cuts our access at the source. See the ",
      linkText: "Privacy Policy",
      href: "/privacy",
      post: " for retention detail and your data subject rights.",
    },
  },
  certs: {
    title: "Certifications and status",
    body1:
      "Our sub-processors are selected for documented security postures and are bound by data processing agreements; the major infrastructure providers above maintain SOC 2 and/or ISO 27001 certifications, whose reports we can reference in a security review. LicenseMeter itself does not yet hold its own SOC 2 / ISO 27001 attestation.",
    body2:
      "Microsoft publisher verification for the LicenseMeter app registrations is in progress. Until it completes, the consent dialog shows the apps as unverified; Microsoft displays the current verification status directly in the dialog, so your admin can always confirm it independently.",
  },
  documents: {
    title: "Documents",
    items: [
      {
        href: "/security",
        label: "Security overview",
        detail:
          "Exactly what is granted, stored and how to leave. Read-only scopes, delegated consent, deletion.",
      },
      {
        href: "/dpa",
        label: "Data Processing Agreement",
        detail:
          "Art. 28 GDPR DPA / AVV, pre-signed. Download in English or German with the full subprocessor annex and TOMs.",
      },
      {
        href: "/privacy",
        label: "Privacy Policy",
        detail:
          "What we process, on what legal basis, for how long, and the data subject rights that apply.",
      },
      {
        href: "/terms",
        label: "Terms",
        detail:
          "The B2B service agreement. The DPA prevails over the Terms on anything to do with data processing.",
      },
      {
        href: "/cookies",
        label: "Cookie policy",
        detail:
          "The functional cookies we set, why, and how long they live. No tracking cookies.",
      },
      {
        href: "/faq",
        label: "FAQ",
        detail:
          "Plain-language answers to the questions security and identity teams ask most often.",
      },
    ],
  },
  questions: {
    title: "Questions",
    body: "Security reviews, pentest coordination and vendor questionnaires: ",
  },
};

const DE: TrustContent = {
  eyebrow: "Trust Center",
  h1: "Alles, was Ihr Sicherheitsteam braucht - an einem Ort.",
  intro:
    "LicenseMeter liest Lizenz- und Verzeichnis-Metadaten aus Ihrem Microsoft-365-Tenant - Vertrauen ist deshalb das eigentliche Produkt. Diese Seite fasst zusammen, wie wir auf Daten zugreifen, wo sie liegen, wer sie verarbeitet und welche Dokumente das belegen. Alle Angaben stammen aus denselben Vereinbarungen, die wir mit Ihnen schließen.",
  toggleLabel: "Sprache wählen",
  atAGlance: {
    title: "Auf einen Blick",
    items: [
      {
        label: "Nur-Lese-Zugriff",
        detail:
          "Die Anwendungsberechtigungen sind ausnahmslos nur lesend. Wir können in Ihrem Tenant nichts verändern.",
      },
      {
        label: "Datenhaltung in der EU",
        detail:
          "Kundendaten werden in der EU gespeichert, in einer Supabase-Postgres-Datenbank auf AWS eu-central-1 (Frankfurt).",
      },
      {
        label: "Löschung bei Trennung",
        detail:
          "Das Trennen eines Workspace löscht alle synchronisierten Daten sofort und unwiderruflich.",
      },
      {
        label: "DSGVO-AVV, vorunterzeichnet",
        detail:
          "Ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO gehört zu jedem Arbeitsbereich - herunterladbar und vorunterzeichnet.",
      },
      {
        label: "Durchgängig verschlüsselt",
        detail:
          "TLS bei der Übertragung, AES-256 im Ruhezustand und AES-256-GCM auf Anwendungsebene für Anmeldedaten von Drittanbietern.",
      },
      {
        label: "Analyse ohne Cookies",
        detail:
          "Keine Tracking- oder Marketing-Cookies, kein Consent-Banner. Aggregierte Vercel Web Analytics ohne IP-Speicherung.",
      },
    ],
  },
  where: {
    title: "Wo Ihre Daten liegen",
    intro:
      "Dies sind die Unterauftragsverarbeiter, die LicenseMeter einsetzt, mit ihrem Verarbeitungsort und dem jeweils einschlägigen Übermittlungsmechanismus. Die Liste wird aus dem verbindlichen Auftragsverarbeitungsvertrag erzeugt und entspricht somit stets der Liste, die Sie unterzeichnen.",
    locationLabel: "Standort",
    transferLabel: "Übermittlung",
    euLabel: "EU",
    usLabel: "EU + USA",
    note: {
      pre: "Optionale Quellsysteme, die Sie anbinden (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic), und per CSV importierte Mitgliederlisten (ChatGPT, Claude) sind ",
      bold: "Datenquellen, keine Unterauftragsverarbeiter",
      mid: ": Wir lesen in Ihrem Auftrag aus ihnen und geben keine personenbezogenen Daten an sie weiter, die über die authentifizierte Leseanfrage hinausgehen. Die maßgebliche Liste ist ",
      linkText: "Anhang 3 des AVV",
      href: "/de/dpa#annex-3",
      post: ".",
    },
  },
  access: {
    title: "So funktioniert der Zugriff",
    body: "Ein globaler Administrator erteilt die Einwilligung einmalig über den standardmäßigen Administrator-Einwilligungsdialog von Microsoft - für Anwendungsberechtigungen, die ausnahmslos nur lesend sind. Es gibt kein Dienstkonto, keinen Agenten und kein Postfach-Plugin in Ihrem Tenant, und Sie können die Anwendung in Entra ID jederzeit unabhängig von uns widerrufen. Nutzungsberichte werden nur als Zählwerte und Datum der letzten Aktivität verarbeitet: Metadaten, niemals Inhalte.",
    linked: {
      pre: "Die ",
      linkText: "Sicherheitsübersicht",
      href: "/de/security",
      post: " listet jede angeforderte Berechtigung auf, was gespeichert wird und wie sich die Einwilligung ohne dauerhafte Rechte als globaler Administrator delegieren lässt.",
    },
  },
  security: {
    title: "Sicherheitsmaßnahmen",
    body: "Der Zugang zu einem Workspace erfolgt einladungs- und rollenbasiert (Inhaber, Administrator, Betrachter); die Anmeldung erfolgt über Microsoft Entra ID per OpenID Connect mit PKCE, mit einem signierten httpOnly-Sitzungscookie, das nach 30 Tagen abläuft. Daten werden bei der Übertragung (TLS, HSTS) und im Ruhezustand (AES-256) verschlüsselt; selbst bereitgestellte Connector-Anmeldedaten werden zusätzlich auf Anwendungsebene verschlüsselt (AES-256-GCM). Mandanten werden in der Anwendungsschicht bei jeder Abfrage logisch getrennt. PostgreSQL Row-Level Security blockiert zusätzlich jede Datenbankrolle außer der Anwendungsrolle. Zustandsändernde Anfragen sind CSRF-geschützt und ratenbegrenzt, und ein Audit-Log je Workspace protokolliert Exporte und administrative Aktionen.",
    linked: {
      pre: "Die vollständigen technischen und organisatorischen Maßnahmen finden Sie in ",
      linkText: "Anhang 2 des AVV",
      href: "/de/dpa#annex-2",
      post: ".",
    },
  },
  lifecycle: {
    title: "Datenlebenszyklus",
    linked: {
      pre: "Daten werden ausschließlich durch die nur lesende Synchronisierung erhoben, nur gespeichert, solange Ihr Tenant verbunden ist, und bei der Trennung gelöscht. Das Trennen eines Workspace (Einstellungen → Gefahrenzone) löscht alle synchronisierten Daten sofort und unwiderruflich: Benutzer, Ergebnisse, Preise, Verlauf und das Audit-Log. Das Widerrufen der Unternehmensanwendung in Ihrem Entra ID unterbindet unseren Zugriff zusätzlich an der Quelle. Einzelheiten zur Aufbewahrung und Ihre Betroffenenrechte finden Sie in der ",
      linkText: "Datenschutzerklärung",
      href: "/privacy",
      post: ".",
    },
  },
  certs: {
    title: "Zertifizierungen und Status",
    body1:
      "Unsere Unterauftragsverarbeiter werden nach dokumentierten Sicherheitsstandards ausgewählt und sind durch Auftragsverarbeitungsverträge gebunden; die oben genannten großen Infrastrukturanbieter verfügen über SOC-2- und/oder ISO-27001-Zertifizierungen, deren Berichte wir in einer Sicherheitsprüfung heranziehen können. LicenseMeter selbst verfügt noch nicht über eine eigene SOC-2-/ISO-27001-Zertifizierung.",
    body2:
      "Die Microsoft-Herausgeberverifizierung für die App-Registrierungen von LicenseMeter ist in Arbeit. Bis sie abgeschlossen ist, zeigt der Einwilligungsdialog die Apps als nicht verifiziert an; Microsoft zeigt den aktuellen Verifizierungsstatus direkt im Dialog an, sodass Ihr Administrator ihn jederzeit unabhängig überprüfen kann.",
  },
  documents: {
    title: "Dokumente",
    items: [
      {
        href: "/de/security",
        label: "Sicherheitsübersicht",
        detail:
          "Genau, was gewährt und gespeichert wird und wie Sie sich trennen. Nur-Lese-Berechtigungen, delegierte Einwilligung, Löschung.",
      },
      {
        href: "/de/dpa",
        label: "Auftragsverarbeitungsvertrag",
        detail:
          "AVV nach Art. 28 DSGVO, vorunterzeichnet. Download auf Deutsch oder Englisch mit vollständigem Unterauftragsverarbeiter-Anhang und TOM.",
      },
      {
        href: "/privacy",
        label: "Datenschutzerklärung (EN)",
        detail:
          "Was wir verarbeiten, auf welcher Rechtsgrundlage, wie lange und welche Betroffenenrechte gelten.",
      },
      {
        href: "/terms",
        label: "AGB (EN)",
        detail:
          "Der B2B-Servicevertrag. Bei allem, was die Datenverarbeitung betrifft, geht der AVV den AGB vor.",
      },
      {
        href: "/cookies",
        label: "Cookie-Richtlinie (EN)",
        detail:
          "Die funktionalen Cookies, die wir setzen, warum und wie lange sie gelten. Keine Tracking-Cookies.",
      },
      {
        href: "/faq",
        label: "FAQ (EN)",
        detail:
          "Verständliche Antworten auf die Fragen, die Sicherheits- und Identitätsteams am häufigsten stellen.",
      },
    ],
  },
  questions: {
    title: "Fragen",
    body: "Sicherheitsprüfungen, Pentest-Koordination und Lieferantenfragebögen: ",
  },
};

export const TRUST_CONTENT: Record<DpaLang, TrustContent> = { en: EN, de: DE };
