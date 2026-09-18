import type { DpaLang } from "~/lib/dpa";

/**
 * Bilingual content for the security overview, following the single-source
 * pattern of /trust-center: one typed structure per language, each language
 * server-rendered at its own URL (/security and /de/security). The scope table
 * and the delegate-consent PowerShell script stay sourced from
 * ~/lib/scopes (CONNECTOR_SCOPES) in SecurityView; only the human-language
 * strings live here. The script's comments remain English in both editions,
 * as is customary for code.
 */

/** A paragraph that embeds a single internal link. */
type LinkedText = { pre: string; linkText: string; href: string; post: string };

export type SecurityContent = {
  eyebrow: string;
  h1: string;
  intro: string;
  toggleLabel: string;
  access: {
    title: string;
    /** Paragraph with a bold run in the middle. */
    body: { pre: string; strong: string; post: string };
    /**
     * Localized "why" per Graph scope, keyed by scope name. Missing keys fall
     * back to the English text in CONNECTOR_SCOPES, so a newly added scope can
     * never render blank.
     */
    scopeWhy: Partial<Record<string, string>>;
    consentNote: string;
  };
  delegate: {
    title: string;
    /** Paragraph with the scope count interpolated between pre and post. */
    body: { pre: string; post: string };
    connectorIdNote: string;
    csv: LinkedText;
  };
  never: { title: string; items: string[]; note: string };
  stored: { title: string; items: string[]; note: string };
  residency: { title: string; body: string };
  subprocessors: { title: string; note: LinkedText };
  dpa: { title: string; body: LinkedText };
  publisher: { title: string; body: string };
  who: {
    title: string;
    pre: string;
    kocLabel: string;
    mid: string;
    impressumLabel: string;
    post: string;
  };
  questions: {
    title: string;
    body: string;
    seeAlso: {
      pre: string;
      faqLabel: string;
      mid: string;
      privacyLabel: string;
      post: string;
    };
  };
};

const EN: SecurityContent = {
  eyebrow: "Security overview",
  h1: "Written for the person who has to say yes.",
  intro:
    "LicenseMeter asks for tenant-wide read access, so this page spells out exactly what is granted, what is stored where, and how you leave. Share it with your security team before anyone clicks consent.",
  toggleLabel: "Choose language",
  access: {
    title: "How access works",
    body: {
      pre: "A Global Administrator of your tenant grants consent once, through Microsoft’s standard admin-consent dialog. That authorizes the “LicenseMeter Connector” application for ",
      strong: "application permissions that are read-only without exception",
      post: ". LicenseMeter then syncs nightly using its own credential: no service account in your tenant, no agent, no mailbox plugin. You can revoke the application in Entra ID at any time, independently of us.",
    },
    scopeWhy: {},
    consentNote:
      "The consent is recorded in your tenant’s audit log. Sign-in to the dashboard itself uses a separate app registration with only openid, profile and email.",
  },
  delegate: {
    title:
      "Delegating the consent without standing Global Administrator rights",
    body: {
      pre: "Tenant-wide admin consent for Microsoft Graph application permissions (the kind listed above) can be granted by a Global Administrator or a Privileged Role Administrator; an Application Administrator is not sufficient for Graph application permissions, a boundary Microsoft sets, not us. Entra ID does let an organization delegate this consent narrowly: an app consent policy pinned to exactly these ",
      post: " read-only permissions and to the LicenseMeter connector app, attached to a custom directory role. The one-time setup itself requires a Privileged Role Administrator or Global Administrator and Microsoft Graph PowerShell (the role permission cannot be added in the Entra portal yet) and belongs in your identity team’s review.",
    },
    connectorIdNote:
      "The connector application ID is shown on the connect page and in Microsoft’s consent dialog.",
    csv: {
      pre: "No role with consent rights at hand today? The ",
      linkText: "CSV import",
      href: "/app/connect/csv",
      post: " computes your waste number from two Microsoft 365 admin center exports, with no consent at all. The link asks you to sign in first.",
    },
  },
  never: {
    title: "What LicenseMeter never accesses",
    items: [
      "Mailbox content, attachments or calendars",
      "Files in OneDrive, SharePoint or Teams",
      "Teams messages or meeting content",
      "Passwords, credentials or security tokens of your users",
      "Any write access: LicenseMeter cannot change anything in your tenant",
    ],
    note: "Usage reports are consumed as counts and last-activity dates only: metadata, never content.",
  },
  stored: {
    title: "What is stored",
    items: [
      "License SKUs with purchased and assigned seat counts",
      "Directory users: display name, UPN, enabled state, user type, creation date, assigned licenses",
      "Last sign-in timestamps (when your tenant has Entra ID P1) and per-workload last-activity dates",
      "The prices you enter in the price book and the findings derived from the above",
      "If you connect Adobe, Zoom, Atlassian, Salesforce, OpenAI or Anthropic (all optional): seat or console-member emails, status, product assignments and last-login dates where the provider exposes them, plus daily API cost totals for OpenAI and Anthropic; the credentials themselves are stored encrypted (AES-256-GCM) and used read-only",
      "If you import ChatGPT or Claude member lists (optional CSV paste): the member emails, names, seat types and last-active dates contained in the data you paste",
      "A per-workspace activity log of exports and administrative actions, deleted with the workspace",
    ],
    note: "Access to a workspace is invite-based. Signing in with an account from your tenant grants nothing by itself; the admin who completed consent decides who sees the data and in which role.",
  },
  residency: {
    title: "Data residency, retention and deletion",
    body: "Customer application data is stored in the EU in a Supabase Postgres database hosted on AWS eu-central-1 (Frankfurt). Data is retained only while your tenant is connected. Disconnecting the workspace (Settings → Danger zone) deletes all synced data immediately and irreversibly: users, findings, prices, history. Revoking the enterprise application in your Entra ID additionally cuts our access at the source.",
  },
  subprocessors: {
    title: "Subprocessors",
    note: {
      pre: "The definitive subprocessor list is part of the ",
      linkText: "DPA",
      href: "/dpa#annex-3",
      post: ".",
    },
  },
  dpa: {
    title: "DPA / Auftragsverarbeitung",
    body: {
      pre: "LicenseMeter processes directory data on your behalf, so a data processing agreement under Art. 28 GDPR (AVV) is included for every workspace. The full text is published on our ",
      linkText: "Data Processing Agreement",
      href: "/dpa",
      post: " page, where you can download the pre-signed PDF in English or German, add your details and counter-sign it. No need to email and wait.",
    },
  },
  publisher: {
    title: "Publisher verification",
    // TODO: update this wording the day verification completes.
    body: "Microsoft publisher verification for the LicenseMeter app registrations is in progress. Until it completes, the consent dialog shows the apps as unverified, and tenants with strict consent policies may block them. Microsoft displays the verification status directly in the consent dialog, so your admin can always confirm the current state independently of this page.",
  },
  who: {
    title: "Who builds LicenseMeter",
    pre: "LicenseMeter is built and maintained by ",
    kocLabel: "Ugur Koc",
    mid: ", Microsoft MVP for Intune and Security Copilot. The operating company is UgurLabs UG (haftungsbeschränkt) in Düsseldorf, Germany, the same legal entity named in the ",
    impressumLabel: "Imprint",
    post: " and in every DPA, and the read-only design principles documented on this page apply to the entire product.",
  },
  questions: {
    title: "Questions",
    body: "Security review, pentest coordination or vendor questionnaires: ",
    seeAlso: {
      pre: ". See also the ",
      faqLabel: "FAQ",
      mid: " and ",
      privacyLabel: "Privacy Policy",
      post: ".",
    },
  },
};

const DE: SecurityContent = {
  eyebrow: "Sicherheitsübersicht",
  h1: "Geschrieben für die Person, die Ja sagen muss.",
  intro:
    "LicenseMeter bittet um mandantenweiten Lesezugriff. Diese Seite legt deshalb offen, was genau gewährt wird, was wo gespeichert wird und wie Sie wieder gehen. Teilen Sie sie mit Ihrem Sicherheitsteam, bevor jemand auf Einwilligen klickt.",
  toggleLabel: "Sprache wählen",
  access: {
    title: "So funktioniert der Zugriff",
    body: {
      pre: "Ein globaler Administrator Ihres Tenants erteilt die Einwilligung einmalig über den standardmäßigen Administrator-Einwilligungsdialog von Microsoft. Damit wird die Anwendung „LicenseMeter Connector“ für ",
      strong:
        "Anwendungsberechtigungen autorisiert, die ausnahmslos nur lesend sind",
      post: ". LicenseMeter synchronisiert anschließend nächtlich mit eigenen Zugangsdaten: kein Dienstkonto in Ihrem Tenant, kein Agent, kein Postfach-Plugin. Sie können die Anwendung in Entra ID jederzeit unabhängig von uns widerrufen.",
    },
    scopeWhy: {
      "User.Read.All": "Verzeichnisnutzer, Kontostatus, zugewiesene Lizenzen",
      "AuditLog.Read.All":
        "Zeitstempel der letzten Anmeldung (erfordert Entra ID P1)",
      "Reports.Read.All": "Nutzungs- und Copilot-Aktivitätsberichte",
      "LicenseAssignment.Read.All": "gekaufte vs. zugewiesene Lizenzplätze",
      "ReportSettings.Read.All": "ob Namen in Berichten verborgen sind",
    },
    consentNote:
      "Die Einwilligung wird im Audit-Log Ihres Tenants protokolliert. Die Anmeldung am Dashboard selbst nutzt eine separate App-Registrierung mit lediglich openid, profile und email.",
  },
  delegate: {
    title:
      "Einwilligung delegieren ohne dauerhafte Rechte als globaler Administrator",
    body: {
      pre: "Die mandantenweite Administrator-Einwilligung für Microsoft-Graph-Anwendungsberechtigungen (wie oben aufgeführt) kann ein globaler Administrator oder ein Administrator für privilegierte Rollen erteilen; ein Anwendungsadministrator reicht für Graph-Anwendungsberechtigungen nicht aus - eine Grenze, die Microsoft setzt, nicht wir. Entra ID erlaubt es aber, diese Einwilligung eng begrenzt zu delegieren: eine App-Einwilligungsrichtlinie, festgelegt auf exakt diese ",
      post: " Nur-Lese-Berechtigungen und auf die LicenseMeter-Connector-App, verknüpft mit einer benutzerdefinierten Verzeichnisrolle. Die einmalige Einrichtung selbst erfordert einen Administrator für privilegierte Rollen oder globalen Administrator sowie Microsoft Graph PowerShell (die Rollenberechtigung lässt sich im Entra-Portal noch nicht hinzufügen) und gehört in die Prüfung Ihres Identity-Teams.",
    },
    connectorIdNote:
      "Die Connector-Anwendungs-ID wird auf der Verbindungsseite und im Einwilligungsdialog von Microsoft angezeigt.",
    csv: {
      pre: "Gerade keine Rolle mit Einwilligungsrechten zur Hand? Der ",
      linkText: "CSV-Import",
      href: "/app/connect/csv",
      post: " berechnet Ihre Verschwendungssumme aus zwei Exporten des Microsoft 365 Admin Centers, ganz ohne Einwilligung. Der Link fordert Sie zunächst zur Anmeldung auf.",
    },
  },
  never: {
    title: "Worauf LicenseMeter niemals zugreift",
    items: [
      "Postfachinhalte, Anhänge oder Kalender",
      "Dateien in OneDrive, SharePoint oder Teams",
      "Teams-Nachrichten oder Besprechungsinhalte",
      "Passwörter, Zugangsdaten oder Sicherheitstoken Ihrer Nutzer",
      "Jeglicher Schreibzugriff: LicenseMeter kann in Ihrem Tenant nichts verändern",
    ],
    note: "Nutzungsberichte werden nur als Zählwerte und Datum der letzten Aktivität verarbeitet: Metadaten, niemals Inhalte.",
  },
  stored: {
    title: "Was gespeichert wird",
    items: [
      "Lizenz-SKUs mit gekauften und zugewiesenen Platzanzahlen",
      "Verzeichnisnutzer: Anzeigename, UPN, Kontostatus, Nutzertyp, Erstellungsdatum, zugewiesene Lizenzen",
      "Zeitstempel der letzten Anmeldung (wenn Ihr Tenant Entra ID P1 hat) und Datum der letzten Aktivität je Dienst",
      "Die von Ihnen im Preisbuch gepflegten Preise und die daraus abgeleiteten Ergebnisse",
      "Wenn Sie Adobe, Zoom, Atlassian, Salesforce, OpenAI oder Anthropic verbinden (alle optional): E-Mails der Lizenzplätze bzw. Konsolenmitglieder, Status, Produktzuweisungen und, soweit der Anbieter sie bereitstellt, Datum der letzten Anmeldung, dazu tägliche API-Kostensummen für OpenAI und Anthropic; die Zugangsdaten selbst werden verschlüsselt gespeichert (AES-256-GCM) und nur lesend verwendet",
      "Wenn Sie ChatGPT- oder Claude-Mitgliederlisten importieren (optionales CSV-Einfügen): die in den eingefügten Daten enthaltenen E-Mails, Namen, Platztypen und Daten der letzten Aktivität",
      "Ein Aktivitätsprotokoll je Workspace über Exporte und administrative Aktionen, das mit dem Workspace gelöscht wird",
    ],
    note: "Der Zugang zu einem Workspace erfolgt auf Einladung. Die Anmeldung mit einem Konto aus Ihrem Tenant gewährt für sich genommen nichts; der Administrator, der die Einwilligung erteilt hat, entscheidet, wer die Daten in welcher Rolle sieht.",
  },
  residency: {
    title: "Datenhaltung, Aufbewahrung und Löschung",
    body: "Kundendaten der Anwendung werden in der EU gespeichert, in einer Supabase-Postgres-Datenbank auf AWS eu-central-1 (Frankfurt). Daten werden nur gespeichert, solange Ihr Tenant verbunden ist. Das Trennen des Workspace (Einstellungen → Gefahrenzone) löscht alle synchronisierten Daten sofort und unwiderruflich: Benutzer, Ergebnisse, Preise, Verlauf. Das Widerrufen der Unternehmensanwendung in Ihrem Entra ID unterbindet unseren Zugriff zusätzlich an der Quelle.",
  },
  subprocessors: {
    title: "Unterauftragsverarbeiter",
    note: {
      pre: "Die maßgebliche Liste der Unterauftragsverarbeiter ist Teil des ",
      linkText: "AVV",
      href: "/de/dpa#annex-3",
      post: ".",
    },
  },
  dpa: {
    title: "AVV / Auftragsverarbeitung",
    body: {
      pre: "LicenseMeter verarbeitet Verzeichnisdaten in Ihrem Auftrag, daher ist ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO (AVV) Bestandteil jedes Arbeitsbereichs. Der vollständige Text ist auf unserer Seite ",
      linkText: "Auftragsverarbeitungsvertrag",
      href: "/de/dpa",
      post: " veröffentlicht; dort laden Sie das vorunterzeichnete PDF auf Deutsch oder Englisch herunter, ergänzen Ihre Angaben und gegenzeichnen es. Kein E-Mail-Verkehr, kein Warten.",
    },
  },
  publisher: {
    title: "Herausgeberverifizierung",
    body: "Die Microsoft-Herausgeberverifizierung für die App-Registrierungen von LicenseMeter ist in Arbeit. Bis sie abgeschlossen ist, zeigt der Einwilligungsdialog die Apps als nicht verifiziert an, und Tenants mit strengen Einwilligungsrichtlinien blockieren sie möglicherweise. Microsoft zeigt den Verifizierungsstatus direkt im Einwilligungsdialog an, sodass Ihr Administrator den aktuellen Stand jederzeit unabhängig von dieser Seite überprüfen kann.",
  },
  who: {
    title: "Wer LicenseMeter entwickelt",
    pre: "LicenseMeter wird entwickelt und betrieben von ",
    kocLabel: "Ugur Koc",
    mid: ", Microsoft MVP für Intune und Security Copilot. Betreibergesellschaft ist die UgurLabs UG (haftungsbeschränkt) in Düsseldorf - dieselbe juristische Person, die im ",
    impressumLabel: "Impressum",
    post: " und in jedem AVV genannt ist. Die auf dieser Seite dokumentierten Nur-Lese-Designprinzipien gelten für das gesamte Produkt.",
  },
  questions: {
    title: "Fragen",
    body: "Sicherheitsprüfung, Pentest-Koordination oder Lieferantenfragebögen: ",
    seeAlso: {
      pre: ". Siehe auch ",
      faqLabel: "FAQ",
      mid: " und ",
      privacyLabel: "Datenschutzerklärung",
      post: ".",
    },
  },
};

export const SECURITY_CONTENT: Record<DpaLang, SecurityContent> = {
  en: EN,
  de: DE,
};
