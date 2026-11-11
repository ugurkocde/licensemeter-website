import { DPA_VERSION, type DpaLang } from "~/lib/dpa";
import { RETENTION_DAYS } from "~/lib/retention";
import { SLA_PATH, SLA_TERMS, formatPct } from "~/lib/sla";
import { SUPPORT_EMAIL } from "~/lib/support";

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

/** Running text with any number of links: strings and link parts in order. */
export type Part = string | { text: string; href: string };

/**
 * A section with an optional lead paragraph, labelled items (rendered as a
 * list, numbered when `ordered`) and closing paragraphs. `id` is the public
 * anchor, so it must stay stable once published.
 */
export type RichSection = {
  id: string;
  title: string;
  intro?: Part[];
  items?: { label: string; detail: Part[] }[];
  ordered?: boolean;
  paragraphs?: Part[][];
};

const mail: Part = { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` };
const SECURITY_TXT = "/.well-known/security.txt";
const R = RETENTION_DAYS;
const S = SLA_TERMS;

export type TrustContent = {
  eyebrow: string;
  h1: string;
  intro: string;
  toggleLabel: string;
  tocLabel: string;
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
  retention: RichSection;
  program: RichSection;
  vulnerability: RichSection;
  incident: RichSection;
  continuity: RichSection;
  sla: RichSection;
  compliance: RichSection;
  documents: { title: string; items: DocItem[] };
  contact: RichSection;
};

const EN: TrustContent = {
  eyebrow: "Trust Center",
  h1: "Everything your security team needs, in one place.",
  intro:
    "LicenseMeter reads license and directory metadata from your Microsoft 365 tenant, so trust is the whole product. This page brings together how we access data, where it lives, who processes it, and the documents that back it up. Everything here is sourced from the same agreements we sign with you.",
  toggleLabel: "Choose language",
  tocLabel: "On this page",
  atAGlance: {
    title: "At a glance",
    items: [
      {
        label: "Read-only access",
        detail:
          "The core application uses read-only Microsoft Graph permissions only. The optional Software Metering module uses a separate app registration with one write permission, DeviceManagementScripts.ReadWrite.All, for its own Intune Remediation script. It needs separate admin consent and is inactive unless you enable it.",
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
    body: "A Global Administrator grants consent once, through Microsoft's standard admin-consent dialog, for the core connector's application permissions, which are read-only without exception: User.Read.All, AuditLog.Read.All, Reports.Read.All, LicenseAssignment.Read.All and ReportSettings.Read.All. The optional Software Metering module needs its own separate consent. There is no service account, agent or mailbox plugin in your tenant, and you can revoke the application in Entra ID at any time, independently of us. Usage reports are consumed as counts and last-activity dates only: metadata, never content.",
    linked: {
      pre: "The ",
      linkText: "Security overview",
      href: "/security",
      post: " lists every requested scope, what is stored, and how to delegate the consent without standing Global Administrator rights.",
    },
  },
  security: {
    title: "Security measures",
    body: "Access to a workspace is invite-based and role-based (owner, admin, viewer); sign-in is Microsoft Entra ID over OpenID Connect with PKCE, with a signed, httpOnly session cookie that expires after 30 days. Data is encrypted in transit (TLS, HSTS) and at rest (AES-256), with bring-your-own connector credentials additionally encrypted at the application layer (AES-256-GCM). Customer data is logically separated per workspace in a shared database. Isolation is enforced in the application layer: every request is authenticated (Microsoft Entra ID sign-in, or a workspace-bound token for the MCP API) and authorised against the user's workspace. Row-level security is enabled on all tables and enforces per-tenant row policies on the MCP API and data export endpoints. The Supabase public Data API has no access to any table. State-changing requests are CSRF-protected and rate-limited, and a per-workspace audit log records exports and administrative actions.",
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
  retention: {
    id: "data-retention",
    title: "Data retention",
    intro: [
      "Retention periods are defined in one place in the code and enforced automatically:",
    ],
    items: [
      {
        label: "Workspace data",
        detail: [
          "Kept for as long as the workspace exists. Deleting the workspace removes all synchronised data, the activity log and the stored connection credentials immediately and irreversibly.",
        ],
      },
      {
        label: "Resolved findings",
        detail: [
          `${R.resolvedFindingPersonData} days after a finding is resolved, names and user principal names are removed from it, an email address in its matching key is replaced by a one-way hash, and its workflow notes and ticket links are deleted. What remains is a pseudonymised record.`,
        ],
      },
      {
        label: "Sign-in records",
        detail: [
          `Records of sign-ins to LicenseMeter are deleted ${R.seenSignins} days after the last sign-in.`,
        ],
      },
      {
        label: "Rate-limit records",
        detail: [
          `Some contain an IP address. A rate-limit window lasts at most ${R.rateLimitMaxAge} days, and a record whose window has ended is deleted by the next daily clean-up.`,
        ],
      },
      {
        label: "Email delivery records",
        detail: [
          `The log of digest, report and alert emails sent to your team (recipient address and delivery status) is kept for ${R.emailDeliveries} days and then deleted by the next monthly clean-up.`,
        ],
      },
      {
        label: "Software Metering results",
        detail: [
          "Not stored. They are read live from Intune and held in server memory for at most five minutes.",
        ],
      },
    ],
    paragraphs: [
      [
        "A daily job applies the finding, sign-in and rate-limit periods. Operational alerts contain no personal data: only workspace IDs, counts and error codes.",
      ],
    ],
  },
  program: {
    id: "security-program",
    title: "Security program",
    intro: [
      "Ugurlabs keeps a written information security policy that binds everyone who works on the company's behalf. In summary:",
    ],
    items: [
      {
        label: "Least privilege",
        detail: [
          "Access to production systems and customer data is limited to the Managing Director. Anyone else receives access only when their role requires it; access is reviewed at least every six months and removed on a person's last day.",
        ],
      },
      {
        label: "Customer sign-in",
        detail: [
          "Customers sign in with Microsoft Entra ID only, so multi-factor authentication and other sign-in controls follow your own tenant's policies.",
        ],
      },
      {
        label: "Secrets management",
        detail: [
          "Production secrets such as API keys, tokens and certificates are held in the hosting provider's encrypted environment variables and never committed to source code; GitHub secret scanning with push protection blocks credentials from being committed. Connector credentials that you provide are stored in the database, additionally encrypted at the application layer (AES-256-GCM), under a dedicated key separate from the sign-in secret.",
        ],
      },
      {
        label: "Suppliers",
        detail: [
          "Sub-processors are chosen for an independent SOC 2 Type II or ISO 27001 attestation, listed under Compliance below. The supplier list is reviewed at least once a year.",
        ],
      },
    ],
  },
  vulnerability: {
    id: "vulnerability-management",
    title: "Vulnerability management",
    paragraphs: [
      [
        "Dependabot alerts and weekly Dependabot dependency updates run on the LicenseMeter repository. Every pull request and every change to the main branch also runs a blocking audit: the build fails on a high or critical advisory in a production dependency.",
      ],
      [
        "High and critical vulnerabilities are fixed within 14 days, medium ones within 90 days. If a vulnerability in LicenseMeter affects your data or security, we notify you without undue delay, together with the remediation.",
      ],
      ["No external penetration test has been performed yet."],
      [
        "Report a suspected vulnerability privately to ",
        mail,
        ", with steps to reproduce and the expected impact, and please do not publish details before we have investigated. The same contact is listed in our ",
        { text: "security.txt", href: SECURITY_TXT },
        ".",
      ],
    ],
  },
  incident: {
    id: "incident-response",
    title: "Incident response",
    intro: [
      "Every security event is logged, contained and assessed. Our written procedure has seven steps:",
    ],
    ordered: true,
    items: [
      {
        label: "Detect and log",
        detail: [
          "A possible incident is reported to the Managing Director at once and recorded with the time of detection, its source and the first observations.",
        ],
      },
      {
        label: "Contain",
        detail: [
          "Compromised credentials and tokens are revoked, affected devices isolated, affected accounts or features disabled, and logs preserved as evidence.",
        ],
      },
      {
        label: "Assess",
        detail: [
          "We establish what happened, which systems and data are affected, whether personal data is involved and the likely risk to individuals.",
        ],
      },
      {
        label: "Notify customers",
        detail: [
          `If your data is affected, the owners and admins of your workspace are notified by email without undue delay and at the latest within ${S.incidentNoticeHours} hours of confirmation, with the known facts, the impact and the actions taken. We support you in your own notification duties as controller.`,
        ],
      },
      {
        label: "Notify the authority",
        detail: [
          "Where Ugurlabs is itself the controller and a breach poses a risk to individuals, we notify the competent supervisory authority (LDI NRW) within 72 hours of becoming aware of it (Art. 33 GDPR), and the individuals concerned where the risk is high (Art. 34 GDPR).",
        ],
      },
      {
        label: "Recover",
        detail: [
          "Systems are restored from clean backups, secrets are rotated and normal operation is confirmed.",
        ],
      },
      {
        label: "Review",
        detail: [
          "Within 14 days we record the root cause, lessons learned and preventive actions. Every incident is documented, including those that did not need to be notified.",
        ],
      },
    ],
  },
  continuity: {
    id: "business-continuity",
    title: "Business continuity",
    items: [
      {
        label: "Backups",
        detail: [
          "The production database is backed up daily by the database provider, and backups are kept for at least 7 days.",
        ],
      },
      {
        label: "Recovery objectives",
        detail: [
          `Restoration within ${S.rtoHours} hours (RTO) with at most ${S.rpoHours} hours of data loss (RPO).`,
        ],
      },
      {
        label: "Restore testing",
        detail: [
          "A restore from backup to a non-production environment is tested at least once a year, and the result is documented.",
        ],
      },
      {
        label: "Outage communication",
        detail: [
          "If an outage lasts longer than 4 hours, affected customers are informed by email, with status updates until it is resolved. Current status is on the ",
          { text: "status page", href: "/status" },
          ".",
        ],
      },
    ],
    paragraphs: [
      [
        "LicenseMeter does not sit in the path of your Microsoft 365 operations, so an outage of LicenseMeter never affects your tenant.",
      ],
    ],
  },
  sla: {
    id: "sla",
    title: "Service level",
    paragraphs: [
      [
        `Paid plans are covered by our Service Level Agreement: a ${formatPct(S.availabilityTargetPct, "en")} monthly availability target with service credits, support on business days with response times by severity, notification of security incidents within ${S.incidentNoticeHours} hours, and recovery objectives of ${S.rtoHours} hours. Read the `,
        { text: "Service Level Agreement", href: SLA_PATH.en },
        ".",
      ],
    ],
  },
  compliance: {
    id: "compliance",
    title: "Compliance and certifications",
    intro: [
      "Ugurlabs UG (haftungsbeschränkt), the company behind LicenseMeter, holds no ISO 27001 or SOC 2 certification of its own. The services LicenseMeter runs on are independently audited. These are the attestations each sub-processor states on its own trust page; the reports themselves are available from the providers, some only to their customers or under NDA:",
    ],
    items: [
      {
        label: "Vercel (hosting)",
        detail: [
          "SOC 2 Type II and ISO/IEC 27001:2022. Source: ",
          { text: "vercel.com/security", href: "https://vercel.com/security" },
          ".",
        ],
      },
      {
        label: "Supabase (database)",
        detail: [
          "SOC 2 Type II and ISO/IEC 27001. Source: ",
          {
            text: "supabase.com/security",
            href: "https://supabase.com/security",
          },
          ".",
        ],
      },
      {
        label: "Cloudflare (Turnstile)",
        detail: [
          "SOC 2 Type II, with Turnstile in scope, and ISO/IEC 27001:2022. Sources: ",
          {
            text: "SOC 2",
            href: "https://www.cloudflare.com/trust-hub/compliance-resources/soc-2/",
          },
          " and ",
          {
            text: "ISO certifications",
            href: "https://www.cloudflare.com/trust-hub/compliance-resources/iso-certifications/",
          },
          ".",
        ],
      },
      {
        label: "Resend (email)",
        detail: [
          "SOC 2 Type II; Resend states that it holds no ISO 27001 certificate. Source: ",
          {
            text: "resend.com/security/soc-2",
            href: "https://resend.com/security/soc-2",
          },
          ".",
        ],
      },
      {
        label: "Microsoft (Entra ID, Microsoft Graph)",
        detail: [
          "ISO/IEC 27001 with Microsoft Entra ID and Microsoft Graph in scope; Microsoft cloud services are also audited under SOC 2 Type II. Sources: ",
          {
            text: "ISO 27001",
            href: "https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-27001",
          },
          " and ",
          {
            text: "SOC 2",
            href: "https://learn.microsoft.com/en-us/compliance/regulatory/offering-soc-2",
          },
          ".",
        ],
      },
    ],
    paragraphs: [
      [
        "LicenseMeter processes customer tenant data as a processor under Art. 28 GDPR, only on the customer's documented instructions. Every workspace is covered by our ",
        {
          text: `Data Processing Agreement (version ${DPA_VERSION})`,
          href: "/dpa",
        },
        ", which lists every sub-processor and the technical and organisational measures. Transfers outside the EU rely on the EU-US Data Privacy Framework or Standard Contractual Clauses, as listed for each sub-processor above.",
      ],
      [
        "The LicenseMeter app registrations for sign-in, the Microsoft 365 connector and Software Metering are publisher verified by Microsoft for Ugurlabs UG (haftungsbeschränkt), so the consent dialog shows the verified publisher.",
      ],
    ],
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
        href: SLA_PATH.en,
        label: "Service Level Agreement",
        detail:
          "Availability target, service credits, support hours and response times for paid plans.",
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
  contact: {
    id: "contact",
    title: "Security and privacy contact",
    paragraphs: [
      [
        "Security reviews, pentest coordination, vendor questionnaires, vulnerability reports and privacy requests: ",
        mail,
        ". The provider is Ugurlabs UG (haftungsbeschränkt), Düsseldorf, Germany; company details are in the ",
        { text: "Imprint", href: "/impressum" },
        ", and machine-readable contact details are in our ",
        { text: "security.txt", href: SECURITY_TXT },
        ".",
      ],
    ],
  },
};

const DE: TrustContent = {
  eyebrow: "Trust Center",
  h1: "Alles, was Ihr Sicherheitsteam braucht, an einem Ort.",
  intro:
    "LicenseMeter liest Lizenz- und Verzeichnis-Metadaten aus Ihrem Microsoft-365-Tenant. Vertrauen ist deshalb das eigentliche Produkt. Diese Seite fasst zusammen, wie wir auf Daten zugreifen, wo sie liegen, wer sie verarbeitet und welche Dokumente das belegen. Alle Angaben stammen aus denselben Vereinbarungen, die wir mit Ihnen schließen.",
  toggleLabel: "Sprache wählen",
  tocLabel: "Auf dieser Seite",
  atAGlance: {
    title: "Auf einen Blick",
    items: [
      {
        label: "Nur-Lese-Zugriff",
        detail:
          "Die Kernanwendung nutzt ausschließlich lesende Microsoft-Graph-Berechtigungen. Das optionale Software-Metering-Modul nutzt eine separate App-Registrierung mit einer Schreibberechtigung, DeviceManagementScripts.ReadWrite.All, für sein eigenes Intune-Remediation-Skript. Es erfordert eine separate Administrator-Einwilligung und ist inaktiv, solange Sie es nicht aktivieren.",
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
          "Ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO gehört zu jedem Arbeitsbereich, herunterladbar und vorunterzeichnet.",
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
    body: "Ein globaler Administrator erteilt die Einwilligung einmalig über den standardmäßigen Administrator-Einwilligungsdialog von Microsoft, und zwar für die Anwendungsberechtigungen des Kern-Connectors, die ausnahmslos nur lesend sind: User.Read.All, AuditLog.Read.All, Reports.Read.All, LicenseAssignment.Read.All und ReportSettings.Read.All. Das optionale Software-Metering-Modul erfordert eine eigene, separate Einwilligung. Es gibt kein Dienstkonto, keinen Agenten und kein Postfach-Plugin in Ihrem Tenant, und Sie können die Anwendung in Entra ID jederzeit unabhängig von uns widerrufen. Nutzungsberichte werden nur als Zählwerte und Datum der letzten Aktivität verarbeitet: Metadaten, niemals Inhalte.",
    linked: {
      pre: "Die ",
      linkText: "Sicherheitsübersicht",
      href: "/de/security",
      post: " listet jede angeforderte Berechtigung auf, was gespeichert wird und wie sich die Einwilligung ohne dauerhafte Rechte als globaler Administrator delegieren lässt.",
    },
  },
  security: {
    title: "Sicherheitsmaßnahmen",
    body: "Der Zugang zu einem Workspace erfolgt einladungs- und rollenbasiert (Inhaber, Administrator, Betrachter); die Anmeldung erfolgt über Microsoft Entra ID per OpenID Connect mit PKCE, mit einem signierten httpOnly-Sitzungscookie, das nach 30 Tagen abläuft. Daten werden bei der Übertragung (TLS, HSTS) und im Ruhezustand (AES-256) verschlüsselt; selbst bereitgestellte Connector-Anmeldedaten werden zusätzlich auf Anwendungsebene verschlüsselt (AES-256-GCM). Kundendaten werden in einer gemeinsamen Datenbank logisch je Arbeitsbereich getrennt. Die Isolation wird in der Anwendungsschicht durchgesetzt: Jede Anfrage wird authentifiziert (Anmeldung über Microsoft Entra ID oder, für die MCP-API, ein an den Arbeitsbereich gebundenes Token) und gegen den Arbeitsbereich des Nutzers autorisiert. Row-Level-Security ist auf allen Tabellen aktiviert und setzt auf der MCP-API und den Datenexport-Endpunkten Zeilenrichtlinien je Mandant durch. Die öffentliche Data API von Supabase hat auf keine Tabelle Zugriff. Zustandsändernde Anfragen sind CSRF-geschützt und ratenbegrenzt, und ein Audit-Log je Workspace protokolliert Exporte und administrative Aktionen.",
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
  retention: {
    id: "data-retention",
    title: "Aufbewahrung von Daten",
    intro: [
      "Die Aufbewahrungsfristen sind an einer Stelle im Code festgelegt und werden automatisch durchgesetzt:",
    ],
    items: [
      {
        label: "Daten des Arbeitsbereichs",
        detail: [
          "Solange der Arbeitsbereich besteht. Das Löschen des Arbeitsbereichs entfernt alle synchronisierten Daten, das Aktivitätsprotokoll und die gespeicherten Verbindungszugangsdaten sofort und unwiderruflich.",
        ],
      },
      {
        label: "Erledigte Befunde",
        detail: [
          `${R.resolvedFindingPersonData} Tage nach der Erledigung eines Befunds werden Namen und User Principal Names daraus entfernt, eine E-Mail-Adresse in seinem Abgleichschlüssel wird durch einen Einweg-Hash ersetzt, und seine Workflow-Notizen und Ticket-Links werden gelöscht. Übrig bleibt ein pseudonymisierter Datensatz.`,
        ],
      },
      {
        label: "Anmeldeaufzeichnungen",
        detail: [
          `Aufzeichnungen über Anmeldungen bei LicenseMeter werden ${R.seenSignins} Tage nach der letzten Anmeldung gelöscht.`,
        ],
      },
      {
        label: "Ratenbegrenzungs-Einträge",
        detail: [
          `Einige enthalten eine IP-Adresse. Ein Zeitfenster dauert höchstens ${R.rateLimitMaxAge} Tage, und ein Eintrag, dessen Zeitfenster abgelaufen ist, wird bei der nächsten täglichen Bereinigung gelöscht.`,
        ],
      },
      {
        label: "E-Mail-Zustellprotokoll",
        detail: [
          `Das Protokoll der Digest-, Bericht- und Warn-E-Mails an Ihr Team (Empfängeradresse und Zustellstatus) wird ${R.emailDeliveries} Tage aufbewahrt und danach bei der nächsten monatlichen Bereinigung gelöscht.`,
        ],
      },
      {
        label: "Ergebnisse des Software Metering",
        detail: [
          "Werden nicht gespeichert. Sie werden live aus Intune gelesen und höchstens fünf Minuten im Arbeitsspeicher des Servers gehalten.",
        ],
      },
    ],
    paragraphs: [
      [
        "Ein täglicher Job setzt die Fristen für Befunde, Anmeldungen und Ratenbegrenzungen durch. Betriebsmeldungen enthalten keine personenbezogenen Daten, nur Arbeitsbereichs-IDs, Anzahlen und Fehlercodes.",
      ],
    ],
  },
  program: {
    id: "security-program",
    title: "Sicherheitsprogramm",
    intro: [
      "Ugurlabs hat eine schriftliche Richtlinie zur Informationssicherheit, die alle bindet, die für das Unternehmen tätig sind. Zusammengefasst:",
    ],
    items: [
      {
        label: "Minimale Berechtigungen",
        detail: [
          "Zugriff auf Produktionssysteme und Kundendaten hat nur der Geschäftsführer. Andere erhalten Zugriff nur, wenn ihre Aufgabe es erfordert; Zugriffe werden mindestens alle sechs Monate überprüft und am letzten Arbeitstag einer Person entzogen.",
        ],
      },
      {
        label: "Anmeldung der Kunden",
        detail: [
          "Kunden melden sich ausschließlich über Microsoft Entra ID an. Multi-Faktor-Authentifizierung und weitere Anmelderegeln richten sich daher nach den Richtlinien Ihres eigenen Tenants.",
        ],
      },
      {
        label: "Verwaltung von Geheimnissen",
        detail: [
          "Produktionsgeheimnisse wie API-Schlüssel, Tokens und Zertifikate liegen in den verschlüsselten Umgebungsvariablen des Hosting-Anbieters und werden nie in den Quellcode eingecheckt; GitHub Secret Scanning mit Push-Schutz verhindert, dass Zugangsdaten eingecheckt werden. Connector-Zugangsdaten, die Sie bereitstellen, werden in der Datenbank gespeichert und zusätzlich auf Anwendungsebene verschlüsselt (AES-256-GCM), mit einem eigenen Schlüssel, der vom Anmelde-Geheimnis getrennt ist.",
        ],
      },
      {
        label: "Lieferanten",
        detail: [
          "Unterauftragsverarbeiter werden danach ausgewählt, dass sie eine unabhängige SOC-2-Type-II- oder ISO-27001-Prüfung vorweisen, siehe Compliance unten. Die Lieferantenliste wird mindestens einmal im Jahr überprüft.",
        ],
      },
    ],
  },
  vulnerability: {
    id: "vulnerability-management",
    title: "Umgang mit Schwachstellen",
    paragraphs: [
      [
        "Dependabot-Warnungen und wöchentliche Dependabot-Abhängigkeitsupdates laufen auf dem LicenseMeter-Repository. Jeder Pull Request und jede Änderung am Hauptzweig durchläuft zudem eine blockierende Prüfung: Der Build schlägt fehl, wenn eine Produktionsabhängigkeit eine Schwachstelle der Stufe hoch oder kritisch hat.",
      ],
      [
        "Hohe und kritische Schwachstellen werden innerhalb von 14 Tagen behoben, mittlere innerhalb von 90 Tagen. Betrifft eine Schwachstelle in LicenseMeter Ihre Daten oder Ihre Sicherheit, benachrichtigen wir Sie unverzüglich, zusammen mit der Abhilfe.",
      ],
      ["Ein externer Penetrationstest wurde bisher nicht durchgeführt."],
      [
        "Melden Sie eine vermutete Schwachstelle vertraulich an ",
        mail,
        ", mit Schritten zur Reproduktion und der erwarteten Auswirkung, und veröffentlichen Sie bitte keine Details, bevor wir sie untersucht haben. Dieselbe Kontaktadresse steht in unserer ",
        { text: "security.txt", href: SECURITY_TXT },
        ".",
      ],
    ],
  },
  incident: {
    id: "incident-response",
    title: "Reaktion auf Sicherheitsvorfälle",
    intro: [
      "Jedes Sicherheitsereignis wird protokolliert, eingedämmt und bewertet. Unser schriftliches Verfahren hat sieben Schritte:",
    ],
    ordered: true,
    items: [
      {
        label: "Erkennen und protokollieren",
        detail: [
          "Ein möglicher Vorfall wird sofort dem Geschäftsführer gemeldet und mit dem Zeitpunkt der Erkennung, der Quelle und den ersten Beobachtungen erfasst.",
        ],
      },
      {
        label: "Eindämmen",
        detail: [
          "Kompromittierte Zugangsdaten und Tokens werden widerrufen, betroffene Geräte isoliert, betroffene Konten oder Funktionen deaktiviert und Protokolle als Beweismittel gesichert.",
        ],
      },
      {
        label: "Bewerten",
        detail: [
          "Wir klären, was passiert ist, welche Systeme und Daten betroffen sind, ob personenbezogene Daten beteiligt sind und welches Risiko für die betroffenen Personen besteht.",
        ],
      },
      {
        label: "Kunden benachrichtigen",
        detail: [
          `Sind Ihre Daten betroffen, werden die Owner und Admins Ihres Arbeitsbereichs unverzüglich per E-Mail benachrichtigt, spätestens ${S.incidentNoticeHours} Stunden nach der Bestätigung, mit den bekannten Fakten, den Auswirkungen und den ergriffenen Maßnahmen. Wir unterstützen Sie bei Ihren eigenen Meldepflichten als Verantwortlicher.`,
        ],
      },
      {
        label: "Behörde benachrichtigen",
        detail: [
          "Ist Ugurlabs selbst Verantwortlicher und birgt eine Verletzung ein Risiko für Personen, melden wir sie innerhalb von 72 Stunden, nachdem sie uns bekannt wurde, der zuständigen Aufsichtsbehörde (LDI NRW) (Art. 33 DSGVO) und bei hohem Risiko auch den betroffenen Personen (Art. 34 DSGVO).",
        ],
      },
      {
        label: "Wiederherstellen",
        detail: [
          "Systeme werden aus sauberen Sicherungen wiederhergestellt, Geheimnisse rotiert und der normale Betrieb bestätigt.",
        ],
      },
      {
        label: "Nachbereiten",
        detail: [
          "Innerhalb von 14 Tagen halten wir Ursache, Erkenntnisse und Vorbeugemaßnahmen fest. Jeder Vorfall wird dokumentiert, auch wenn er nicht gemeldet werden musste.",
        ],
      },
    ],
  },
  continuity: {
    id: "business-continuity",
    title: "Geschäftskontinuität",
    items: [
      {
        label: "Sicherungen",
        detail: [
          "Die Produktionsdatenbank wird vom Datenbankanbieter täglich gesichert, und die Sicherungen werden mindestens 7 Tage aufbewahrt.",
        ],
      },
      {
        label: "Wiederherstellungsziele",
        detail: [
          `Wiederherstellung innerhalb von ${S.rtoHours} Stunden (RTO) bei höchstens ${S.rpoHours} Stunden Datenverlust (RPO).`,
        ],
      },
      {
        label: "Wiederherstellungstests",
        detail: [
          "Eine Wiederherstellung aus der Sicherung in eine Nicht-Produktionsumgebung wird mindestens einmal im Jahr getestet und das Ergebnis dokumentiert.",
        ],
      },
      {
        label: "Kommunikation bei Ausfällen",
        detail: [
          "Dauert ein Ausfall länger als 4 Stunden, informieren wir betroffene Kunden per E-Mail und halten sie bis zur Behebung auf dem Laufenden. Den aktuellen Status zeigt die ",
          { text: "Statusseite (EN)", href: "/status" },
          ".",
        ],
      },
    ],
    paragraphs: [
      [
        "LicenseMeter liegt nicht im Pfad Ihres Microsoft-365-Betriebs. Ein Ausfall von LicenseMeter wirkt sich daher nie auf Ihren Tenant aus.",
      ],
    ],
  },
  sla: {
    id: "sla",
    title: "Service Level",
    paragraphs: [
      [
        `Die kostenpflichtigen Tarife sind durch unser Service Level Agreement abgedeckt: ein monatliches Verfügbarkeitsziel von ${formatPct(S.availabilityTargetPct, "de")} mit Servicegutschriften, Support an Geschäftstagen (Montag bis Freitag) mit Reaktionszeiten nach Schweregrad, Benachrichtigung bei Sicherheitsvorfällen binnen ${S.incidentNoticeHours} Stunden und Wiederherstellungsziele von ${S.rtoHours} Stunden. Lesen Sie das `,
        { text: "Service Level Agreement", href: SLA_PATH.de },
        ".",
      ],
    ],
  },
  compliance: {
    id: "compliance",
    title: "Compliance und Zertifizierungen",
    intro: [
      "Ugurlabs UG (haftungsbeschränkt), das Unternehmen hinter LicenseMeter, verfügt über keine eigene ISO-27001- oder SOC-2-Zertifizierung. Die Dienste, auf denen LicenseMeter läuft, werden unabhängig geprüft. Dies sind die Nachweise, die jeder Unterauftragsverarbeiter auf seiner eigenen Trust-Seite angibt; die Berichte selbst stellen die Anbieter bereit, teils nur für ihre Kunden oder unter NDA:",
    ],
    items: [
      {
        label: "Vercel (Hosting)",
        detail: [
          "SOC 2 Type II und ISO/IEC 27001:2022. Quelle: ",
          { text: "vercel.com/security", href: "https://vercel.com/security" },
          ".",
        ],
      },
      {
        label: "Supabase (Datenbank)",
        detail: [
          "SOC 2 Type II und ISO/IEC 27001. Quelle: ",
          {
            text: "supabase.com/security",
            href: "https://supabase.com/security",
          },
          ".",
        ],
      },
      {
        label: "Cloudflare (Turnstile)",
        detail: [
          "SOC 2 Type II, mit Turnstile im Prüfumfang, und ISO/IEC 27001:2022. Quellen: ",
          {
            text: "SOC 2",
            href: "https://www.cloudflare.com/trust-hub/compliance-resources/soc-2/",
          },
          " und ",
          {
            text: "ISO-Zertifizierungen",
            href: "https://www.cloudflare.com/trust-hub/compliance-resources/iso-certifications/",
          },
          ".",
        ],
      },
      {
        label: "Resend (E-Mail)",
        detail: [
          "SOC 2 Type II; nach eigener Angabe hat Resend kein ISO-27001-Zertifikat. Quelle: ",
          {
            text: "resend.com/security/soc-2",
            href: "https://resend.com/security/soc-2",
          },
          ".",
        ],
      },
      {
        label: "Microsoft (Entra ID, Microsoft Graph)",
        detail: [
          "ISO/IEC 27001 mit Microsoft Entra ID und Microsoft Graph im Prüfumfang; die Microsoft-Clouddienste werden zudem nach SOC 2 Type II geprüft. Quellen: ",
          {
            text: "ISO 27001",
            href: "https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-27001",
          },
          " und ",
          {
            text: "SOC 2",
            href: "https://learn.microsoft.com/en-us/compliance/regulatory/offering-soc-2",
          },
          ".",
        ],
      },
    ],
    paragraphs: [
      [
        "LicenseMeter verarbeitet die Daten aus Kunden-Tenants als Auftragsverarbeiter nach Art. 28 DSGVO, ausschließlich auf dokumentierte Weisung des Kunden. Jeder Arbeitsbereich ist durch unseren ",
        {
          text: `Auftragsverarbeitungsvertrag (Version ${DPA_VERSION})`,
          href: "/de/dpa",
        },
        " abgedeckt, der alle Unterauftragsverarbeiter und die technischen und organisatorischen Maßnahmen aufführt. Übermittlungen außerhalb der EU stützen sich auf das EU-US Data Privacy Framework oder auf Standardvertragsklauseln, wie oben je Unterauftragsverarbeiter angegeben.",
      ],
      [
        "Die App-Registrierungen von LicenseMeter für die Anmeldung, den Microsoft-365-Connector und das Software Metering sind von Microsoft als Herausgeber Ugurlabs UG (haftungsbeschränkt) verifiziert. Der Einwilligungsdialog zeigt daher den verifizierten Herausgeber an.",
      ],
    ],
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
        href: SLA_PATH.de,
        label: "Service Level Agreement",
        detail:
          "Verfügbarkeitsziel, Servicegutschriften, Supportzeiten und Reaktionszeiten der kostenpflichtigen Tarife.",
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
  contact: {
    id: "contact",
    title: "Kontakt für Sicherheit und Datenschutz",
    paragraphs: [
      [
        "Sicherheitsprüfungen, Pentest-Koordination, Lieferantenfragebögen, Meldungen von Schwachstellen und Datenschutzanfragen: ",
        mail,
        ". Anbieter ist die Ugurlabs UG (haftungsbeschränkt), Düsseldorf; die Unternehmensangaben stehen im ",
        { text: "Impressum", href: "/impressum" },
        ", und maschinenlesbare Kontaktdaten in unserer ",
        { text: "security.txt", href: SECURITY_TXT },
        ".",
      ],
    ],
  },
};

export const TRUST_CONTENT: Record<DpaLang, TrustContent> = { en: EN, de: DE };
