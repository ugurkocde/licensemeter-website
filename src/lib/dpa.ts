import {
  DPA_CHOICES,
  resolvedClauses,
  SCC,
  type SccClause,
  type SccSection,
} from "~/lib/dpaClauses";
import { SUPPORT_EMAIL } from "~/lib/support";

/**
 * Single source of truth for the Data Processing Agreement (DPA) /
 * Auftragsverarbeitungsvertrag (AVV). One typed, bilingual structure renders
 * into the web page (src/app/(marketing)/dpa), the downloadable PDF
 * (src/server/dpa) and the signed copy in the portal, so they cannot drift.
 *
 * The BODY is the European Commission's standard contractual clauses between
 * controllers and processors (Implementing Decision (EU) 2021/915), unchanged,
 * from ~/lib/dpaClauses with the choices in DPA_CHOICES applied. Only the four
 * annexes and the framing around the Clauses are ours, and they live here.
 *
 * Legal review: the annexes are grounded in the codebase's real facts (parties
 * from the Impressum, sub-processors, measures from the actual security
 * implementation), but they are not legal advice. Every TODO below marks a
 * statement that could not be verified in this repository and is therefore
 * left out until the owner confirms it.
 *
 * Consistency: SUBPROCESSOR_ROWS below is the DEFINITIVE sub-processor list.
 * Annex IV, the PDF, /security, /trust-center and /privacy all read it from
 * here. Adobe/Zoom/Atlassian/Salesforce/OpenAI/Anthropic and CSV imports are
 * deliberately framed as DATA SOURCES, not sub-processors. Preserve that
 * framing (see /privacy section 7).
 */

export type DpaLang = "en" | "de";

export type DpaBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "defs"; items: { term: string; def: string }[] };

export type DpaSubprocessor = {
  name: string;
  purpose: string;
  location: string;
  basis: string;
};

export type DpaTomGroup = { title: string; items: string[] };

/** One party of Annex I, under the field labels of the official template. */
export type DpaAnnexParty = {
  heading: string;
  fields: { term: string; def: string }[];
};

export type DpaAnnexId = "I" | "II" | "III" | "IV";

export type DpaAnnex = {
  id: DpaAnnexId;
  title: string;
  intro?: DpaBlock[];
  parties?: DpaAnnexParty[];
  body?: DpaBlock[];
  toms?: DpaTomGroup[];
  outro?: DpaBlock[];
  subprocessors?: {
    headers: { name: string; purpose: string; location: string; basis: string };
    rows: DpaSubprocessor[];
    note: DpaBlock[];
  };
};

export type DpaSignParty = { label: string; lines: string[] };

/** kind "subprocessor" is the MSP variant: the customer is itself a processor. */
export type DpaAgreementKind = "controller" | "subprocessor";

/** The customer company named in a signed agreement (Pro and MSP). */
export type DpaCounterparty = {
  kind: DpaAgreementKind;
  companyName: string;
  companyAddress: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  signedAt: Date;
};

export type DpaDoc = {
  docTitle: string;
  docSubtitle: string;
  version: string;
  effective: string;
  metaDescription: string;
  /** Our framing of the document. Not part of the Clauses. */
  preamble: { title: string; body: DpaBlock[] };
  /** The Clauses, as published, with DPA_CHOICES applied. */
  clausesTitle: string;
  sections: SccSection[];
  clauses: SccClause[];
  annexes: DpaAnnex[];
  signature: {
    title: string;
    intro: string;
    processor: DpaSignParty;
    controller: DpaSignParty;
  };
  /** Plain-language summary for the acceptance step in the portal. */
  summary: string[];
  /** UI strings for the web view (toggle, buttons, helper box). */
  ui: {
    eyebrow: string;
    pageTitle: string;
    pageIntro: string;
    metaLine: string;
    howToTitle: string;
    howToSteps: string[];
    download: string;
    languageOf: string;
    annexNav: string;
  };
};

// 1.1: added WorkOS as a sub-processor (AuthKit sign-in) and the BYO
// encrypted-credential custody statement to the sub-processor annex.
// 1.2: added the purpose-limitation commitment (no use of the data to evaluate
// individual employees' performance or behavior), for works-council (BetrVG)
// and Art. 5(1)(b) GDPR assessments.
// 2.0: the body became the Commission's standard contractual clauses under
// Art. 28(7) GDPR (Implementing Decision (EU) 2021/915), unchanged. Annexes
// renumbered I to IV to match the Clauses. The purpose limitation moved to
// Annex II. Accepted online per workspace; signed with a named company on Pro
// and MSP. Carries over 1.3: the Processor's registered company name and its
// commercial register entry in the party and signature blocks.
export const DPA_VERSION = "2.0";
const EFFECTIVE_EN = "19 September 2026";
const EFFECTIVE_DE = "19. September 2026";

const PROCESSOR_NAME = "Ugurlabs UG (haftungsbeschränkt)";
const PROCESSOR_REGISTER: Record<DpaLang, string> = {
  en: "Registered with the commercial register of the Local Court (Amtsgericht) of Düsseldorf under HRB 113979",
  de: "Eingetragen im Handelsregister des Amtsgerichts Düsseldorf unter HRB 113979",
};

/* ---------------------------------------------------------- Sub-processors */

/**
 * THE sub-processor list. Rows are parallel across languages (same order), so
 * callers can classify from the English row and display the localized one.
 *
 * TODO(owner, legal review): the official Annex IV template also asks for each
 * sub-processor's address and contact person. They are not recorded anywhere
 * in this repository, so they are not shown.
 */
const SUBPROCESSOR_ROWS: Record<DpaLang, DpaSubprocessor[]> = {
  en: [
    {
      name: "Vercel Inc.",
      purpose: "Application hosting and content delivery",
      location: "EU (Frankfurt function region)",
      basis: "EU processing; SCCs for any support access from outside the EU",
    },
    {
      name: "Supabase Inc.",
      purpose: "Managed PostgreSQL database (primary data store)",
      location: "EU (AWS eu-central-1, Frankfurt)",
      basis: "EU processing; SCCs for any support access from outside the EU",
    },
    {
      name: "Microsoft (Microsoft Ireland Operations Ltd. / Microsoft Corporation)",
      purpose:
        "Identity platform (sign-in, admin consent) and Microsoft Graph API",
      location: "EU Data Boundary; US fallback",
      basis:
        "EU Standard Contractual Clauses (Microsoft Products and Services DPA)",
    },
    {
      name: "WorkOS, Inc.",
      purpose:
        "Authentication and user identity management (AuthKit sign-in), where enabled",
      location: "US",
      basis: "EU Standard Contractual Clauses (WorkOS DPA)",
    },
    {
      name: "Resend Inc.",
      purpose: "Transactional and notification email delivery",
      location: "EU (Ireland region)",
      basis: "EU processing; SCCs where applicable",
    },
  ],
  de: [
    {
      name: "Vercel Inc.",
      purpose: "Anwendungs-Hosting und Content Delivery",
      location: "EU (Funktionsregion Frankfurt)",
      basis:
        "Verarbeitung in der EU; SCC für etwaige Support-Zugriffe von außerhalb der EU",
    },
    {
      name: "Supabase Inc.",
      purpose: "Verwaltete PostgreSQL-Datenbank (primärer Datenspeicher)",
      location: "EU (AWS eu-central-1, Frankfurt)",
      basis:
        "Verarbeitung in der EU; SCC für etwaige Support-Zugriffe von außerhalb der EU",
    },
    {
      name: "Microsoft (Microsoft Ireland Operations Ltd. / Microsoft Corporation)",
      purpose:
        "Identitätsplattform (Anmeldung, Admin-Consent) und Microsoft Graph API",
      location: "EU Data Boundary; US als Rückfallebene",
      basis:
        "EU-Standardvertragsklauseln (Microsoft Products and Services DPA)",
    },
    {
      name: "WorkOS, Inc.",
      purpose:
        "Authentifizierung und Identitätsverwaltung (AuthKit-Anmeldung), soweit aktiviert",
      location: "USA",
      basis: "EU-Standardvertragsklauseln (WorkOS DPA)",
    },
    {
      name: "Resend Inc.",
      purpose: "Versand transaktionaler und Benachrichtigungs-E-Mails",
      location: "EU (Region Irland)",
      basis: "Verarbeitung in der EU; SCC soweit einschlägig",
    },
  ],
};

/**
 * The canonical sub-processor list (Annex IV) for a given language. /security,
 * /trust-center and /privacy render these exact rows instead of keeping their
 * own copies, so the list can never drift.
 */
export const subprocessorRows = (lang: DpaLang): DpaSubprocessor[] =>
  SUBPROCESSOR_ROWS[lang];

/** English sub-processor rows; the canonical list for English-only surfaces. */
export const SUBPROCESSORS: DpaSubprocessor[] = subprocessorRows("en");

/* ------------------------------------------- Official annex template labels */

const PLACEHOLDER = /^…\.?$/;

/** A published heading without the brackets of the surrounding instruction. */
const bare = (s: string): string => s.replace(/[[\]]/g, "").trim();

const template = (lang: DpaLang, id: DpaAnnexId) => {
  const annex = SCC[lang].annexes.find((a) => a.id === id);
  if (!annex) throw new Error(`Annex ${id} is missing from the Clauses`);
  return annex;
};

/** "Name", "Address", contact person, signature: the four Annex I fields. */
const partyFieldLabels = (lang: DpaLang): string[] =>
  template(lang, "I")
    .paragraphs.slice(2, 6)
    .map((p) => p.replace(/:\s*…$/, ""));

/** "Controller(s)" and "Processor(s)", as the template heads the two lists. */
const partyHeadings = (lang: DpaLang): [string, string] => {
  const p = template(lang, "I").paragraphs;
  return [p[0]!.split(":")[0]!, p[8]!.split(":")[0]!];
};

/** The seven headings of the Annex II template, in published order. */
export const annexIIHeadings = (lang: DpaLang): string[] =>
  template(lang, "II").paragraphs.filter((p) => !PLACEHOLDER.test(p));

/** The seventeen example headings the Annex III template lists. */
export const annexIIIHeadings = (lang: DpaLang): string[] =>
  template(lang, "III").paragraphs.slice(3, 20).map(bare);

/* --------------------------------------------------------- Annex II answers */

/** Answers to annexIIHeadings, same order. */
const ANNEX_II: Record<DpaLang, string[]> = {
  en: [
    "The controller's employees and other directory users; holders of seats in connected source systems; the controller's own workspace members who sign in to the Service.",
    "Display name; user principal name (UPN) / email address; directory object and tenant identifiers; account status and user type; account creation date; assigned license SKUs; last sign-in and per-workload last-activity timestamps; for connected source systems, seat email, status and product assignments; for workspace members, name, email, role and sign-in activity.",
    "None. The Service is not intended for special categories of personal data (Art. 9 GDPR). Mailbox, file and message content is never accessed: the permissions the Service requests in the Microsoft 365 tenant are read-only and cover directory, license, sign-in activity and usage report data only.",
    "Read-only collection, storage, aggregation and analysis of license, directory and activity metadata, and the generation of reports and exports from it. Synchronization runs on a schedule (typically nightly) and on demand when a user of the controller starts it.",
    "Solely to identify unused, oversized and misaligned license assignments and their cost, and to report them to the controller. The processor does not use the personal data to monitor or evaluate the performance or behavior of individual employees of the controller, does not create profiles for such purposes, and does not provide the Service as a tool for performance or behavior monitoring. Activity metadata is processed solely to determine whether a paid license seat is used, unused or oversized.",
    "For as long as the workspace exists. The owner can delete the workspace at any time, which deletes all synchronized data, the activity log and the stored connection credentials immediately and irreversibly.",
    "The sub-processors in Annex IV host the application, store the data, provide sign-in and deliver email, each for the purpose named there and for the duration of this agreement.",
  ],
  de: [
    "Beschäftigte und sonstige Verzeichnisnutzer des Verantwortlichen; Inhaber von Lizenzplätzen in verbundenen Quellsystemen; die eigenen Arbeitsbereichs-Mitglieder des Verantwortlichen, die sich am Dienst anmelden.",
    "Anzeigename; User Principal Name (UPN) / E-Mail-Adresse; Verzeichnis-Objekt- und Tenant-Kennungen; Kontostatus und Nutzertyp; Erstellungsdatum des Kontos; zugewiesene Lizenz-SKUs; Zeitstempel der letzten Anmeldung und der letzten Aktivität je Dienst; bei verbundenen Quellsystemen E-Mail, Status und Produktzuweisungen der Lizenzplätze; bei Arbeitsbereichs-Mitgliedern Name, E-Mail, Rolle und Anmeldeaktivität.",
    "Keine. Der Dienst ist nicht für besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) bestimmt. Auf Postfach-, Datei- und Nachrichteninhalte wird zu keinem Zeitpunkt zugegriffen: Die Berechtigungen, die der Dienst im Microsoft-365-Tenant anfordert, sind ausschließlich lesend und umfassen nur Verzeichnis-, Lizenz-, Anmeldeaktivitäts- und Nutzungsberichtsdaten.",
    "Ausschließlich lesende Erhebung, Speicherung, Aggregation und Analyse von Lizenz-, Verzeichnis- und Aktivitätsmetadaten sowie die Erstellung von Berichten und Exporten daraus. Die Synchronisierung läuft nach Zeitplan (in der Regel nächtlich) und auf Anforderung, wenn ein Nutzer des Verantwortlichen sie startet.",
    "Ausschließlich zur Ermittlung ungenutzter, überdimensionierter und fehlerhaft zugewiesener Lizenzen und der damit verbundenen Kosten sowie zur Berichterstattung darüber an den Verantwortlichen. Der Auftragsverarbeiter verwendet die personenbezogenen Daten nicht zur Überwachung oder Bewertung der Leistung oder des Verhaltens einzelner Beschäftigter des Verantwortlichen, erstellt keine Profile zu solchen Zwecken und stellt den Dienst nicht als Instrument zur Leistungs- oder Verhaltenskontrolle bereit. Aktivitätsmetadaten werden allein verarbeitet, um festzustellen, ob ein bezahlter Lizenzplatz genutzt, ungenutzt oder überdimensioniert ist.",
    "Solange der Arbeitsbereich besteht. Der Owner kann den Arbeitsbereich jederzeit löschen; dadurch werden alle synchronisierten Daten, das Aktivitätsprotokoll und die gespeicherten Verbindungszugangsdaten unmittelbar und unwiderruflich gelöscht.",
    "Die Unterauftragsverarbeiter in Anhang IV hosten die Anwendung, speichern die Daten, stellen die Anmeldung bereit und versenden E-Mails, jeweils zu dem dort genannten Zweck und für die Dauer dieser Vereinbarung.",
  ],
};

/* -------------------------------------------------------- Annex III answers */

/**
 * Measures per official example heading (index into annexIIIHeadings). Every
 * item is verifiable in this repository; the file that proves it is named in
 * the comment above the group. Headings without verified measures are omitted.
 *
 * TODO(owner, legal review), NOT asserted because nothing in the repository
 * proves them:
 * - pseudonymisation: docs/privacy-mode.md is a spec, not implemented;
 * - storage encryption at rest, backups, point-in-time recovery and backup
 *   rotation of the database provider (heading 2 and 6);
 * - physical security certifications of the hosting providers (heading 7);
 * - internal IT governance: staff confidentiality commitments, access to
 *   production limited to named personnel, multi-factor sign-in for production
 *   access, a written breach-response procedure (heading 10);
 * - any certification held by LicenseMeter itself (heading 11);
 * - time-limited retention: snapshots, the activity log and sync runs are kept
 *   for as long as the workspace exists (src/server/history.ts), there is no
 *   pruning job. The plan only limits how far back history is SHOWN.
 */
const ANNEX_III: Record<DpaLang, Record<number, string[]>> = {
  en: {
    // src/server/crypto.ts
    0: [
      "Credentials for connected source systems (client secrets, API keys, certificate private keys) are encrypted at the application layer with AES-256-GCM before they are stored. The key is derived with HKDF-SHA256, and each ciphertext is bound to its workspace, provider and database column, so it cannot be decrypted in another context.",
      "A dedicated data encryption key can be configured separately from the session signing secret, so that one can be rotated without the other.",
    ],
    // src/server/access.ts, scripts/db-*.sql, src/lib/scopes.ts,
    // src/server/auth/origin.ts, src/server/rateLimit.ts, next.config.js
    1: [
      "Every request resolves the signed-in user's workspace membership on the server, and data is read and written scoped to that workspace. Identifiers sent by the browser are never trusted on their own.",
      "In the hosted database, row-level security is enabled on every table. The application connects with a dedicated role that holds data manipulation rights only and owns no tables. The database provider's public Data API roles have no policy and no grants, so they cannot read or write anything.",
      "Access to the Microsoft 365 tenant is read-only: User.Read.All, AuditLog.Read.All, Reports.Read.All, LicenseAssignment.Read.All and ReportSettings.Read.All. The Service holds no write permission and cannot change anything in the tenant. Remediation scripts are generated for the controller to review and run itself; the Service never executes them.",
      "State-changing routes check the request origin, and sensitive endpoints such as synchronization, invitations and the support form are rate limited with counters kept in the database.",
      "A content security policy, a ban on framing, MIME sniffing protection, a referrer policy and a permissions policy are sent with every response.",
      "Synchronization tolerates missing optional permissions, and only one synchronization can run per workspace at a time.",
    ],
    // .github/workflows/ci.yml
    3: [
      "Every change runs through a continuous integration pipeline with formatting, lint and type checks, unit tests, end-to-end tests in a browser, and a dependency audit that fails on high-severity advisories.",
      "Security reports are accepted under the policy published in SECURITY.md.",
    ],
    // src/server/auth/**, src/lib/roles.ts, src/server/access.ts
    4: [
      "Sign-in runs through WorkOS AuthKit or Microsoft Entra ID with OpenID Connect and PKCE. ID tokens are verified against the issuer's published keys with the algorithm, audience and issuer pinned.",
      "Sessions are signed tokens in cookies that are httpOnly, SameSite and, in production, Secure and bound to the exact host. A session lasts at most 30 days.",
      "Workspace access is invite-based: signing in with an account from the same tenant grants nothing by itself. Invitations that are not claimed expire after 14 days. The roles owner, admin and viewer enforce least privilege, and the server checks the role on every page, route and action.",
    ],
    // next.config.js
    5: [
      "The Service is reachable over HTTPS only, with HTTP Strict Transport Security set to one year including subdomains. Microsoft Graph and all connected source systems are called over HTTPS.",
    ],
    // src/server/crypto.ts, src/server/db/schema.ts
    6: [
      "Connection credentials are stored only in encrypted form (see the first heading). Customer data is kept in one PostgreSQL database, separated per workspace by a workspace identifier on every record and protected by foreign key and uniqueness constraints.",
    ],
    // vercel.json
    7: [
      "LicenseMeter operates no data centres or servers of its own. The application runs in the Frankfurt region of the hosting sub-processor, and the physical security of the locations is the responsibility of the sub-processors named in Annex IV.",
    ],
    // src/server/audit.ts, src/server/db/schema.ts (auditLog, syncRuns)
    8: [
      "A per-workspace activity log records exports, membership and role changes, connection changes and other administrative actions with the acting user and the time. Owners and admins can read and export it.",
      "Every synchronization run is recorded with its status, steps and any error.",
    ],
    // src/env.js, src/server/access.ts
    9: [
      "Configuration is validated when the application starts, so it does not run with missing or malformed security settings.",
      "Defaults are restrictive: a colleague who joins a workspace through its verified company domain starts as a viewer, and consumer email domains never join another user's workspace.",
    ],
    // src/lib/scopes.ts
    12: [
      "The Service requests only the permissions listed above and reads metadata only. Activity is stored as the date of the last sign-in and of the last use per workload, not as a record of what a person did.",
    ],
    // src/server/sync/runSync.ts
    13: [
      "Each synchronization reads the data again from the source system, so a correction made at the source reaches the Service with the next run.",
    ],
    // src/server/db/schema.ts (onDelete cascade), src/server/access.ts
    14: [
      "Data is kept only while the workspace exists. Deleting the workspace removes every record that belongs to it through cascading deletes, including the activity log.",
    ],
    // src/server/db/schema.ts (dpaAcceptances, dpaAgreements)
    15: [
      "The acceptance of this agreement is recorded per workspace with the accepting user, the time, the language and the document version. Agreements signed with a named company are recorded the same way.",
    ],
    // src/app/api/export/**, src/server/actions.ts
    16: [
      "Findings, licenses, the price book, remediation plans and the activity log can be exported as CSV, and the waste report as PDF.",
      "An owner can delete the workspace in the settings at any time. The deletion is immediate and cannot be undone.",
    ],
  },
  de: {
    0: [
      "Zugangsdaten für verbundene Quellsysteme (Client-Secrets, API-Schlüssel, private Schlüssel von Zertifikaten) werden vor dem Speichern auf Anwendungsebene mit AES-256-GCM verschlüsselt. Der Schlüssel wird mit HKDF-SHA256 abgeleitet, und jeder Chiffretext ist an Arbeitsbereich, Anbieter und Datenbankspalte gebunden, sodass er in keinem anderen Zusammenhang entschlüsselt werden kann.",
      "Ein eigener Datenverschlüsselungsschlüssel kann getrennt vom Signaturgeheimnis der Sitzungen konfiguriert werden, sodass sich das eine ohne das andere rotieren lässt.",
    ],
    1: [
      "Jede Anfrage ermittelt auf dem Server die Arbeitsbereichs-Mitgliedschaft des angemeldeten Nutzers; Daten werden nur im Rahmen dieses Arbeitsbereichs gelesen und geschrieben. Vom Browser gesendeten Kennungen wird für sich genommen nie vertraut.",
      "In der gehosteten Datenbank ist Row-Level-Security auf jeder Tabelle aktiviert. Die Anwendung verbindet sich mit einer eigenen Rolle, die nur Rechte zur Datenbearbeitung besitzt und keine Tabellen besitzt. Die öffentlichen Data-API-Rollen des Datenbankanbieters haben weder Policy noch Rechte und können daher nichts lesen oder schreiben.",
      "Der Zugriff auf den Microsoft-365-Tenant ist ausschließlich lesend: User.Read.All, AuditLog.Read.All, Reports.Read.All, LicenseAssignment.Read.All und ReportSettings.Read.All. Der Dienst besitzt keine Schreibberechtigung und kann im Tenant nichts verändern. Skripte zur Bereinigung werden erzeugt, damit der Verantwortliche sie prüft und selbst ausführt; der Dienst führt sie nie aus.",
      "Zustandsändernde Routen prüfen die Herkunft der Anfrage; sensible Endpunkte wie Synchronisierung, Einladungen und das Support-Formular sind ratenbegrenzt, die Zähler liegen in der Datenbank.",
      "Mit jeder Antwort werden eine Content Security Policy, ein Framing-Verbot, ein Schutz vor MIME-Sniffing, eine Referrer-Policy und eine Permissions-Policy gesendet.",
      "Die Synchronisierung kommt mit fehlenden optionalen Berechtigungen zurecht, und je Arbeitsbereich kann nur eine Synchronisierung gleichzeitig laufen.",
    ],
    3: [
      "Jede Änderung durchläuft eine Continuous-Integration-Pipeline mit Formatierungs-, Lint- und Typprüfung, Unit-Tests, End-to-End-Tests im Browser und einer Abhängigkeitsprüfung, die bei Sicherheitshinweisen mit hohem Schweregrad fehlschlägt.",
      "Sicherheitsmeldungen werden nach der in SECURITY.md veröffentlichten Richtlinie entgegengenommen.",
    ],
    4: [
      "Die Anmeldung erfolgt über WorkOS AuthKit oder Microsoft Entra ID mit OpenID Connect und PKCE. ID-Token werden gegen die veröffentlichten Schlüssel des Ausstellers geprüft; Algorithmus, Zielgruppe und Aussteller sind fest vorgegeben.",
      "Sitzungen sind signierte Token in Cookies, die httpOnly und SameSite sowie in der Produktion Secure und an den genauen Host gebunden sind. Eine Sitzung dauert höchstens 30 Tage.",
      "Der Zugang zum Arbeitsbereich erfolgt auf Einladung: Die Anmeldung mit einem Konto aus demselben Tenant gewährt für sich genommen nichts. Nicht angenommene Einladungen verfallen nach 14 Tagen. Die Rollen Owner, Admin und Viewer setzen das Prinzip der geringsten Rechte durch, und der Server prüft die Rolle auf jeder Seite, Route und Aktion.",
    ],
    5: [
      "Der Dienst ist nur über HTTPS erreichbar; HTTP Strict Transport Security ist auf ein Jahr einschließlich Subdomains gesetzt. Microsoft Graph und alle verbundenen Quellsysteme werden über HTTPS angesprochen.",
    ],
    6: [
      "Verbindungszugangsdaten werden nur verschlüsselt gespeichert (siehe erste Überschrift). Kundendaten liegen in einer PostgreSQL-Datenbank, je Arbeitsbereich getrennt durch eine Arbeitsbereichs-Kennung an jedem Datensatz und abgesichert durch Fremdschlüssel- und Eindeutigkeitsbeschränkungen.",
    ],
    7: [
      "LicenseMeter betreibt keine eigenen Rechenzentren oder Server. Die Anwendung läuft in der Region Frankfurt des Hosting-Unterauftragsverarbeiters; für die physische Sicherheit der Standorte sind die in Anhang IV genannten Unterauftragsverarbeiter verantwortlich.",
    ],
    8: [
      "Ein Aktivitätsprotokoll je Arbeitsbereich erfasst Exporte, Änderungen an Mitgliedschaften und Rollen, Änderungen an Verbindungen und weitere administrative Aktionen mit handelndem Nutzer und Zeitpunkt. Owner und Admins können es einsehen und exportieren.",
      "Jeder Synchronisierungslauf wird mit Status, Schritten und etwaigem Fehler aufgezeichnet.",
    ],
    9: [
      "Die Konfiguration wird beim Start der Anwendung geprüft, sodass sie nicht mit fehlenden oder fehlerhaften Sicherheitseinstellungen läuft.",
      "Die Voreinstellungen sind restriktiv: Wer einem Arbeitsbereich über dessen verifizierte Unternehmensdomain beitritt, beginnt als Viewer, und Verbraucher-E-Mail-Domains treten nie dem Arbeitsbereich eines anderen Nutzers bei.",
    ],
    12: [
      "Der Dienst fordert nur die oben genannten Berechtigungen an und liest ausschließlich Metadaten. Aktivität wird als Datum der letzten Anmeldung und der letzten Nutzung je Dienst gespeichert, nicht als Aufzeichnung dessen, was eine Person getan hat.",
    ],
    13: [
      "Jede Synchronisierung liest die Daten erneut aus dem Quellsystem, sodass eine Korrektur an der Quelle mit dem nächsten Lauf im Dienst ankommt.",
    ],
    14: [
      "Daten werden nur gespeichert, solange der Arbeitsbereich besteht. Das Löschen des Arbeitsbereichs entfernt über kaskadierende Löschungen jeden zugehörigen Datensatz, einschließlich des Aktivitätsprotokolls.",
    ],
    15: [
      "Die Annahme dieser Vereinbarung wird je Arbeitsbereich mit annehmendem Nutzer, Zeitpunkt, Sprache und Dokumentversion aufgezeichnet. Mit einem benannten Unternehmen unterzeichnete Vereinbarungen werden ebenso aufgezeichnet.",
    ],
    16: [
      "Funde, Lizenzen, das Preisbuch, Bereinigungspläne und das Aktivitätsprotokoll lassen sich als CSV exportieren, der Bericht als PDF.",
      "Ein Owner kann den Arbeitsbereich jederzeit in den Einstellungen löschen. Die Löschung erfolgt sofort und kann nicht rückgängig gemacht werden.",
    ],
  },
};

/**
 * Assistance to the controller (Clause 8(d)) and the further elements of a
 * breach notification (Clause 9, last paragraph).
 *
 * TODO(owner, legal review): the email notification below is the intended
 * process. The repository holds the recipient lookup (workspace owners and
 * admins) but no written breach-response procedure.
 */
const ANNEX_III_ASSISTANCE: Record<DpaLang, string[]> = {
  en: [
    "Requests from data subjects: owners and admins can look up every user record in the portal, export the findings about it as CSV, and remove the data by disconnecting the source system or deleting the workspace. Requests that reach LicenseMeter directly are forwarded to the controller under Clause 8(a).",
    `Personal data breaches: notifications under Clause 9.2 are sent by email to the owners and admins of the affected workspace. The contact point for more information is ${SUPPORT_EMAIL}.`,
  ],
  de: [
    "Anträge betroffener Personen: Owner und Admins können jeden Nutzerdatensatz im Portal nachschlagen, die zugehörigen Funde als CSV exportieren und die Daten entfernen, indem sie das Quellsystem trennen oder den Arbeitsbereich löschen. Anträge, die LicenseMeter unmittelbar erreichen, werden gemäß Klausel 8 Buchstabe a an den Verantwortlichen weitergeleitet.",
    `Verletzungen des Schutzes personenbezogener Daten: Meldungen gemäß Klausel 9.2 werden per E-Mail an die Owner und Admins des betroffenen Arbeitsbereichs gesendet. Anlaufstelle für weitere Informationen ist ${SUPPORT_EMAIL}.`,
  ],
};

/* ------------------------------------------------------------------ Strings */

type Strings = {
  docTitle: string;
  docSubtitle: string;
  effective: string;
  metaDescription: string;
  preambleTitle: string;
  preamble: string[];
  processorFields: [string, string];
  signedOnline: (version: string, effective: string) => string;
  standardController: [string, string, string, string];
  signedBy: (name: string, date: string, version: string) => string;
  subprocessorRole: string;
  annexIVIntro: string;
  subHeaders: {
    name: string;
    purpose: string;
    location: string;
    basis: string;
  };
  annexIVNote: string;
  annexIIIIntro: string;
  assistanceTitle: string;
  signatureTitle: string;
  signatureIntro: string;
  signatureIntroSigned: string;
  forProcessor: string;
  forController: string;
  name: string;
  title: string;
  blankLines: string[];
  typedSignature: string;
  date: string;
  summary: string[];
  ui: Omit<DpaDoc["ui"], "metaLine">;
  metaLine: (version: string, effective: string) => string;
};

const STRINGS: Record<DpaLang, Strings> = {
  en: {
    docTitle: "Data Processing Agreement",
    docSubtitle:
      "Standard contractual clauses under Article 28(7) GDPR (Implementing Decision (EU) 2021/915)",
    effective: EFFECTIVE_EN,
    metaDescription:
      "LicenseMeter's Data Processing Agreement (DPA / AVV): the European Commission's standard contractual clauses under Art. 28 GDPR, unchanged, with technical and organisational measures and named sub-processors. Pre-signed PDF in English and German.",
    preambleTitle: "About this agreement",
    preamble: [
      "This agreement is made of the standard contractual clauses between controllers and processors that the European Commission adopted under Article 28(7) GDPR with Implementing Decision (EU) 2021/915 of 4 June 2021. The Clauses are reproduced below without any change. Where the Clauses ask the parties to choose, the choice is: Regulation (EU) 2016/679 applies; the optional docking clause (Clause 5) is included; sub-processors are engaged under a general written authorisation with a notice period of " +
        `${DPA_CHOICES.noticePeriod.en} (Clause 7.7(a), option 2).`,
      "Only Annexes I to IV are written by LicenseMeter. The customer accepts the agreement online in the LicenseMeter portal. It applies to the use of the LicenseMeter service under the LicenseMeter Terms and Conditions.",
    ],
    processorFields: [
      "Fährstraße 217, 40221 Düsseldorf, Germany",
      `Ugur Koc, Managing Director (Geschäftsführer), ${SUPPORT_EMAIL}`,
    ],
    signedOnline: (version, effective) =>
      `Signed electronically by Ugur Koc, version ${version}, ${effective}`,
    standardController: [
      "The customer organisation that accepts these Clauses in the LicenseMeter portal",
      "As stated in the customer's LicenseMeter account",
      "The workspace owner or admin who accepts these Clauses, with the email address of that account",
      "Online acceptance in the LicenseMeter portal, recorded with the accepting user, the time and this document version",
    ],
    signedBy: (name, date, version) =>
      `Signed electronically by ${name} on ${date}, version ${version}`,
    subprocessorRole:
      "The customer processes the personal data as a processor on behalf of its own clients, who are the controllers, and engages LicenseMeter as its sub-processor under Article 28(4) GDPR. In these Clauses the customer takes the position of the controller towards LicenseMeter, and LicenseMeter the position of the processor. The customer confirms that its clients have authorised it to engage LicenseMeter.",
    annexIVIntro:
      "This is the agreed list of sub-processors under Clause 7.7(a), option 2. LicenseMeter announces an addition or replacement at least " +
      `${DPA_CHOICES.noticePeriod.en} in advance.`,
    subHeaders: {
      name: "Sub-processor",
      purpose: "Purpose",
      location: "Processing location",
      basis: "Transfer mechanism",
    },
    annexIVNote:
      "To be distinguished from sub-processors are the optional source systems the controller connects (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic) and any member lists the controller imports by CSV (ChatGPT, Claude). The processor reads from these systems on the controller's behalf on a read-only basis. They are data sources, not sub-processors of the processor; no personal data is disclosed to them beyond the authenticated read request. Where the controller connects a Microsoft tenant using its own app registration ('bring your own'), the credentials supplied (client secret or certificate private key) are stored encrypted at rest (AES-256-GCM) and used solely to perform the read-only Microsoft Graph sync.",
    annexIIIIntro:
      "The measures are listed under the headings the Clauses suggest. Each one describes how the Service is built and can be checked in its public source code.",
    assistanceTitle: "Assistance to the controller",
    signatureTitle: "Signatures",
    signatureIntro:
      "This agreement is pre-signed by LicenseMeter. The customer accepts it online in the LicenseMeter portal, where the acceptance is recorded. Customers whose internal process requires a counter-signed copy can sign below and keep it for their files.",
    signatureIntroSigned:
      "Both parties signed this agreement electronically. The customer's signature was given in the LicenseMeter portal by the signatory named below.",
    forProcessor: "For the processor",
    forController: "For the controller",
    name: "Name",
    title: "Title",
    blankLines: [
      "Legal entity: ____________________________",
      "Name: ____________________________",
      "Title: ____________________________",
      "Place / Date: ____________________________",
      "Signature: ____________________________",
    ],
    typedSignature: "Signature (typed)",
    date: "Date",
    summary: [
      "LicenseMeter reads license, directory and activity metadata from the systems you connect, so under GDPR it is your processor and a data processing agreement is required.",
      "The agreement is the European Commission's standard contractual clauses for processors, unchanged. Only the annexes are ours.",
      "The data is used only to find unused and oversized licenses, never to evaluate the performance or behavior of individual employees.",
      `Sub-processors are listed in Annex IV. You are told about a change at least ${DPA_CHOICES.noticePeriod.en} in advance and can object.`,
      "Deleting the workspace deletes all synchronized data immediately.",
    ],
    ui: {
      eyebrow: "Data protection",
      pageTitle: "Data Processing Agreement (DPA / AVV)",
      pageIntro:
        "LicenseMeter processes directory and license metadata on your behalf, so a data processing agreement under Art. 28 GDPR comes with every workspace. It is the European Commission's standard contractual clauses, unchanged, with our annexes. The full text is below; download the pre-signed PDF in English or German for your records and procurement checklist.",
      howToTitle: "How to put this agreement in place",
      howToSteps: [
        "Every workspace accepts it online: an owner or admin accepts the current version once in the LicenseMeter portal, and the acceptance is recorded.",
        "On Pro and MSP an owner can also sign it with the company named as a party, and download the PDF signed by both sides.",
        "LicenseMeter signs its own agreement. Customer templates are not negotiated on Pro.",
      ],
      download: "Download PDF",
      languageOf: "Language",
      annexNav: "Annexes",
    },
    metaLine: (version, effective) =>
      `Version ${version} · Effective ${effective}`,
  },
  de: {
    docTitle: "Auftragsverarbeitungsvertrag (AVV)",
    docSubtitle:
      "Standardvertragsklauseln gemäß Art. 28 Abs. 7 DSGVO (Durchführungsbeschluss (EU) 2021/915)",
    effective: EFFECTIVE_DE,
    metaDescription:
      "Auftragsverarbeitungsvertrag (AVV / DPA) von LicenseMeter: die Standardvertragsklauseln der Europäischen Kommission nach Art. 28 DSGVO, unverändert, mit technischen und organisatorischen Maßnahmen und benannten Unterauftragsverarbeitern. Vorunterzeichnetes PDF auf Deutsch und Englisch.",
    preambleTitle: "Zu dieser Vereinbarung",
    preamble: [
      "Diese Vereinbarung besteht aus den Standardvertragsklauseln zwischen Verantwortlichen und Auftragsverarbeitern, die die Europäische Kommission gemäß Art. 28 Abs. 7 DSGVO mit dem Durchführungsbeschluss (EU) 2021/915 vom 4. Juni 2021 erlassen hat. Die Klauseln sind nachstehend ohne jede Änderung wiedergegeben. Wo die Klauseln den Parteien eine Wahl lassen, gilt: Es gilt die Verordnung (EU) 2016/679; die fakultative Kopplungsklausel (Klausel 5) ist enthalten; Unterauftragsverarbeiter werden auf Grundlage einer allgemeinen schriftlichen Genehmigung mit einer Ankündigungsfrist von " +
        `${DPA_CHOICES.noticePeriod.de} beauftragt (Klausel 7.7 Buchstabe a, Option 2).`,
      "Nur die Anhänge I bis IV stammen von LicenseMeter. Der Kunde nimmt die Vereinbarung online im LicenseMeter-Portal an. Sie gilt für die Nutzung des Dienstes LicenseMeter nach den LicenseMeter-AGB.",
    ],
    processorFields: [
      "Fährstraße 217, 40221 Düsseldorf, Deutschland",
      `Ugur Koc, Geschäftsführer, ${SUPPORT_EMAIL}`,
    ],
    signedOnline: (version, effective) =>
      `Elektronisch unterzeichnet von Ugur Koc, Version ${version}, ${effective}`,
    standardController: [
      "Die Kundenorganisation, die diese Klauseln im LicenseMeter-Portal annimmt",
      "Wie im LicenseMeter-Konto des Kunden angegeben",
      "Der Owner oder Admin des Arbeitsbereichs, der diese Klauseln annimmt, mit der E-Mail-Adresse dieses Kontos",
      "Online-Annahme im LicenseMeter-Portal, aufgezeichnet mit annehmendem Nutzer, Zeitpunkt und dieser Dokumentversion",
    ],
    signedBy: (name, date, version) =>
      `Elektronisch unterzeichnet von ${name} am ${date}, Version ${version}`,
    subprocessorRole:
      "Der Kunde verarbeitet die personenbezogenen Daten als Auftragsverarbeiter im Auftrag seiner eigenen Kunden, die die Verantwortlichen sind, und setzt LicenseMeter als seinen Unterauftragsverarbeiter gemäß Art. 28 Abs. 4 DSGVO ein. In diesen Klauseln nimmt der Kunde gegenüber LicenseMeter die Stellung des Verantwortlichen ein und LicenseMeter die Stellung des Auftragsverarbeiters. Der Kunde bestätigt, dass seine Kunden ihm die Beauftragung von LicenseMeter genehmigt haben.",
    annexIVIntro:
      "Dies ist die vereinbarte Liste der Unterauftragsverarbeiter gemäß Klausel 7.7 Buchstabe a, Option 2. LicenseMeter kündigt eine Hinzufügung oder Ersetzung mindestens " +
      `${DPA_CHOICES.noticePeriod.de} im Voraus an.`,
    subHeaders: {
      name: "Unterauftragsverarbeiter",
      purpose: "Zweck",
      location: "Verarbeitungsort",
      basis: "Übermittlungsmechanismus",
    },
    annexIVNote:
      "Von den Unterauftragsverarbeitern zu unterscheiden sind die optionalen Quellsysteme, die der Verantwortliche verbindet (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic), sowie etwaige per CSV importierte Mitgliederlisten (ChatGPT, Claude). Aus diesen Systemen liest der Auftragsverarbeiter im Auftrag des Verantwortlichen ausschließlich lesend. Es handelt sich um Datenquellen, nicht um Unterauftragsverarbeiter des Auftragsverarbeiters; über die authentifizierte Leseanfrage hinaus werden ihnen keine personenbezogenen Daten offengelegt. Bindet der Verantwortliche einen Microsoft-Mandanten mit eigener App-Registrierung ein ('Bring your own'), werden die übergebenen Zugangsdaten (Client-Secret oder privater Schlüssel des Zertifikats) verschlüsselt gespeichert (AES-256-GCM) und ausschließlich zur Durchführung der nur lesenden Microsoft-Graph-Synchronisierung verwendet.",
    annexIIIIntro:
      "Die Maßnahmen sind unter den Überschriften aufgeführt, die die Klauseln vorschlagen. Jede beschreibt, wie der Dienst gebaut ist, und lässt sich in seinem öffentlichen Quellcode nachprüfen.",
    assistanceTitle: "Unterstützung des Verantwortlichen",
    signatureTitle: "Unterschriften",
    signatureIntro:
      "Diese Vereinbarung ist von LicenseMeter vorunterzeichnet. Der Kunde nimmt sie online im LicenseMeter-Portal an; die Annahme wird dort aufgezeichnet. Kunden, deren interner Ablauf ein gegengezeichnetes Exemplar verlangt, können unten unterzeichnen und es zu ihren Akten nehmen.",
    signatureIntroSigned:
      "Beide Parteien haben diese Vereinbarung elektronisch unterzeichnet. Die Unterschrift des Kunden wurde im LicenseMeter-Portal von der unten genannten Person geleistet.",
    forProcessor: "Für den Auftragsverarbeiter",
    forController: "Für den Verantwortlichen",
    name: "Name",
    title: "Funktion",
    blankLines: [
      "Unternehmen: ____________________________",
      "Name: ____________________________",
      "Funktion: ____________________________",
      "Ort / Datum: ____________________________",
      "Unterschrift: ____________________________",
    ],
    typedSignature: "Unterschrift (getippt)",
    date: "Datum",
    summary: [
      "LicenseMeter liest Lizenz-, Verzeichnis- und Aktivitätsmetadaten aus den Systemen, die Sie verbinden. Nach der DSGVO ist LicenseMeter damit Ihr Auftragsverarbeiter, und ein Auftragsverarbeitungsvertrag ist erforderlich.",
      "Der Vertrag besteht aus den Standardvertragsklauseln der Europäischen Kommission für Auftragsverarbeiter, unverändert. Nur die Anhänge stammen von uns.",
      "Die Daten dienen allein dazu, ungenutzte und überdimensionierte Lizenzen zu finden, nie zur Bewertung der Leistung oder des Verhaltens einzelner Beschäftigter.",
      `Die Unterauftragsverarbeiter stehen in Anhang IV. Über eine Änderung werden Sie mindestens ${DPA_CHOICES.noticePeriod.de} im Voraus informiert und können widersprechen.`,
      "Das Löschen des Arbeitsbereichs löscht alle synchronisierten Daten sofort.",
    ],
    ui: {
      eyebrow: "Datenschutz",
      pageTitle: "Auftragsverarbeitungsvertrag (AVV / DPA)",
      pageIntro:
        "LicenseMeter verarbeitet Verzeichnis- und Lizenzmetadaten in Ihrem Auftrag, daher gehört zu jedem Arbeitsbereich ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Er besteht aus den Standardvertragsklauseln der Europäischen Kommission, unverändert, mit unseren Anhängen. Der vollständige Text steht unten; laden Sie das vorunterzeichnete PDF auf Deutsch oder Englisch für Ihre Unterlagen und Ihre Beschaffungs-Checkliste herunter.",
      howToTitle: "So kommt diese Vereinbarung zustande",
      howToSteps: [
        "Jeder Arbeitsbereich nimmt sie online an: Ein Owner oder Admin nimmt die aktuelle Version einmal im LicenseMeter-Portal an, und die Annahme wird aufgezeichnet.",
        "In Pro und MSP kann ein Owner sie zusätzlich mit dem Unternehmen als benannter Partei unterzeichnen und das von beiden Seiten unterzeichnete PDF herunterladen.",
        "LicenseMeter unterzeichnet die eigene Vereinbarung. Kundenvorlagen werden in Pro nicht verhandelt.",
      ],
      download: "PDF herunterladen",
      languageOf: "Sprache",
      annexNav: "Anhänge",
    },
    metaLine: (version, effective) =>
      `Version ${version} · Gültig ab ${effective}`,
  },
};

/* ------------------------------------------------------------------ Builder */

/** A calendar date in the document language, in UTC so it never shifts. */
export const formatDpaDate = (lang: DpaLang, date: Date): string =>
  new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);

/**
 * The whole agreement in one language. Without a counterparty it is the
 * standard, pre-signed document every workspace accepts online; with one it is
 * the copy signed with a named company.
 */
export const buildDpa = (
  lang: DpaLang,
  counterparty?: DpaCounterparty,
): DpaDoc => {
  const t = STRINGS[lang];
  const scc = SCC[lang];
  const labels = partyFieldLabels(lang);
  const [controllerHeading, processorHeading] = partyHeadings(lang);
  const fields = (values: string[]) =>
    labels.map((term, i) => ({ term, def: values[i] ?? "" }));
  const processorSignature = t.signedOnline(DPA_VERSION, t.effective);

  const controllerValues = counterparty
    ? [
        counterparty.companyName,
        counterparty.companyAddress,
        `${counterparty.signerName}, ${counterparty.signerTitle}, ${counterparty.signerEmail}`,
        t.signedBy(
          counterparty.signerName,
          formatDpaDate(lang, counterparty.signedAt),
          DPA_VERSION,
        ),
      ]
    : [...t.standardController];

  const annexI: DpaAnnex = {
    id: "I",
    title: template(lang, "I").title,
    // TODO(owner, legal review): the MSP role statement is ours, not the
    // Commission's. Confirm that using the controller-to-processor Clauses for
    // the processor-to-sub-processor relationship this way is acceptable.
    intro:
      counterparty?.kind === "subprocessor"
        ? [{ kind: "p", text: t.subprocessorRole }]
        : undefined,
    parties: [
      { heading: controllerHeading, fields: fields(controllerValues) },
      {
        // TODO(owner): no data protection officer is recorded in this
        // repository. Add one to the contact line if one is appointed.
        heading: processorHeading,
        fields: fields([
          `${PROCESSOR_NAME}. ${PROCESSOR_REGISTER[lang]}`,
          t.processorFields[0],
          t.processorFields[1],
          processorSignature,
        ]),
      },
    ],
  };

  const annexII: DpaAnnex = {
    id: "II",
    title: template(lang, "II").title,
    body: [
      {
        kind: "defs",
        items: annexIIHeadings(lang).map((term, i) => ({
          term,
          def: ANNEX_II[lang][i] ?? "",
        })),
      },
    ],
  };

  const tomHeadings = annexIIIHeadings(lang);
  const annexIII: DpaAnnex = {
    id: "III",
    title: template(lang, "III").title,
    intro: [{ kind: "p", text: t.annexIIIIntro }],
    toms: [
      ...Object.entries(ANNEX_III[lang]).map(([i, items]) => ({
        title: tomHeadings[Number(i)] ?? "",
        items,
      })),
      { title: t.assistanceTitle, items: ANNEX_III_ASSISTANCE[lang] },
    ],
  };

  const annexIV: DpaAnnex = {
    id: "IV",
    title: template(lang, "IV").title,
    intro: [{ kind: "p", text: t.annexIVIntro }],
    subprocessors: {
      headers: t.subHeaders,
      rows: subprocessorRows(lang),
      note: [{ kind: "p", text: t.annexIVNote }],
    },
  };

  return {
    docTitle: t.docTitle,
    docSubtitle: t.docSubtitle,
    version: DPA_VERSION,
    effective: t.effective,
    metaDescription: t.metaDescription,
    preamble: {
      title: t.preambleTitle,
      body: t.preamble.map((text) => ({ kind: "p", text })),
    },
    // The published German title carries a typo, so the heading is ours.
    clausesTitle: lang === "de" ? "Standardvertragsklauseln" : scc.title,
    sections: scc.sections,
    clauses: resolvedClauses(lang),
    annexes: [annexI, annexII, annexIII, annexIV],
    signature: {
      title: t.signatureTitle,
      intro: counterparty ? t.signatureIntroSigned : t.signatureIntro,
      processor: {
        label: t.forProcessor,
        lines: [
          PROCESSOR_NAME,
          PROCESSOR_REGISTER[lang],
          `${t.name}: Ugur Koc`,
          `${t.title}: ${lang === "de" ? "Geschäftsführer" : "Managing Director (Geschäftsführer)"}`,
          processorSignature,
        ],
      },
      controller: {
        label: t.forController,
        lines: counterparty
          ? [
              counterparty.companyName,
              `${t.name}: ${counterparty.signerName}`,
              `${t.title}: ${counterparty.signerTitle}`,
              `${t.typedSignature}: ${counterparty.signerName}`,
              `${t.date}: ${formatDpaDate(lang, counterparty.signedAt)}`,
              `Version ${DPA_VERSION}`,
            ]
          : t.blankLines,
      },
    },
    summary: t.summary,
    ui: { ...t.ui, metaLine: t.metaLine(DPA_VERSION, t.effective) },
  };
};

/** The standard agreement, as shown on /dpa and in the public PDF. */
export const DPA: Record<DpaLang, DpaDoc> = {
  en: buildDpa("en"),
  de: buildDpa("de"),
};

/** The annex label of the Clauses for an annex id, e.g. "ANNEX III". */
export const annexLabel = (lang: DpaLang, id: DpaAnnexId): string =>
  template(lang, id).label;

/**
 * Anchors other pages already link to (/dpa#annex-2 for the measures,
 * /dpa#annex-3 for the sub-processors), kept alive after the renumbering.
 */
export const LEGACY_ANNEX_ANCHOR: Partial<Record<DpaAnnexId, string>> = {
  III: "annex-2",
  IV: "annex-3",
};

/** Download filename per language, e.g. LicenseMeter-DPA-en.pdf. */
export const dpaFilename = (lang: DpaLang): string =>
  lang === "de" ? "LicenseMeter-AVV-de.pdf" : "LicenseMeter-DPA-en.pdf";

/**
 * Download filename of the copy signed with a named company, e.g.
 * LicenseMeter-DPA-en-contoso-gmbh-v2.0.pdf. The company name is reduced to
 * a short ASCII slug so the header stays well-formed for every name.
 */
export const signedDpaFilename = (
  lang: DpaLang,
  companyName: string,
): string => {
  const slug =
    companyName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40)
      .replace(/-+$/, "") || "company";
  const doc = lang === "de" ? "AVV" : "DPA";
  return `LicenseMeter-${doc}-${lang}-${slug}-v${DPA_VERSION}.pdf`;
};

export const isDpaLang = (value: unknown): value is DpaLang =>
  value === "en" || value === "de";
