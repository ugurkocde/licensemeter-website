import { SUPPORT_EMAIL } from "~/lib/support";

/**
 * Single source of truth for the Data Processing Agreement (DPA) /
 * Auftragsverarbeitungsvertrag (AVV). One typed, bilingual structure renders
 * into BOTH the web page (src/app/(marketing)/dpa) and the downloadable PDF
 * (src/server/dpa) so the four surfaces (web x PDF, EN x DE) can never drift.
 *
 * IMPORTANT - legal review required before relying on this. This is a
 * structured, Art. 28 GDPR-aligned DRAFT grounded in the codebase's real facts
 * (parties from the Impressum, subprocessors, TOMs from the actual security
 * implementation). It is NOT legal advice and must be reviewed by counsel / the
 * DPO before it is held out as the executed agreement. This matches the
 * "structured draft, not legal advice" convention in privacy/page.tsx and
 * terms/page.tsx.
 *
 * Consistency: the subprocessor list below is the DEFINITIVE list. Keep it in
 * sync with the convenience subset shown on /security (#subprocessors) and the
 * prose list in /privacy (section 5). Adobe/Zoom/Atlassian/Salesforce/OpenAI/
 * Anthropic and CSV imports are deliberately framed as DATA SOURCES, not
 * subprocessors - preserve that framing (see /privacy section 5).
 */

export type DpaLang = "en" | "de";

export type DpaBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "defs"; items: { term: string; def: string }[] };

export type DpaClause = { n: string; title: string; body: DpaBlock[] };

export type DpaSubprocessor = {
  name: string;
  purpose: string;
  location: string;
  basis: string;
};

export type DpaTomGroup = { title: string; items: string[] };

export type DpaAnnex = {
  id: string;
  title: string;
  intro?: DpaBlock[];
  body?: DpaBlock[];
  toms?: DpaTomGroup[];
  subprocessors?: {
    headers: { name: string; purpose: string; location: string; basis: string };
    rows: DpaSubprocessor[];
    note: DpaBlock[];
  };
};

export type DpaSignParty = { label: string; lines: string[] };

export type DpaDoc = {
  docTitle: string;
  docSubtitle: string;
  version: string;
  effective: string;
  metaDescription: string;
  parties: {
    title: string;
    intro: DpaBlock[];
    processor: DpaSignParty;
    controller: DpaSignParty;
  };
  recitals: { title: string; body: DpaBlock[] };
  clauses: DpaClause[];
  annexLabel: string;
  annexes: DpaAnnex[];
  signature: {
    title: string;
    intro: string;
    processor: DpaSignParty;
    controller: DpaSignParty;
  };
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
// encrypted-credential custody statement to Annex 3.
const VERSION = "1.1";
const EFFECTIVE_EN = "22 June 2026";
const EFFECTIVE_DE = "22. Juni 2026";

/* ------------------------------------------------------------------ English */

const EN: DpaDoc = {
  docTitle: "Data Processing Agreement",
  docSubtitle: "pursuant to Article 28 GDPR",
  version: VERSION,
  effective: EFFECTIVE_EN,
  metaDescription:
    "LicenseMeter's Data Processing Agreement (DPA / AVV) under Art. 28 GDPR: scope, technical and organizational measures, named subprocessors and EU data residency. Pre-signed PDF download in English and German.",
  parties: {
    title: "Parties",
    intro: [
      {
        kind: "p",
        text: 'This Data Processing Agreement ("DPA") forms part of the LicenseMeter Terms and Conditions (the "Principal Agreement") between the Parties for use of the LicenseMeter service (the "Service"). It governs the processing of personal data carried out by the Processor on behalf of the Controller in connection with the Service, in accordance with Article 28 GDPR.',
      },
    ],
    processor: {
      label: "Processor (Auftragsverarbeiter)",
      lines: [
        "UgurLabs UG (haftungsbeschränkt)",
        "Fährstraße 217, 40221 Düsseldorf, Germany",
        "Represented by its Managing Director Ugur Koc",
        `Contact: ${SUPPORT_EMAIL}`,
        '("LicenseMeter" or the "Processor")',
      ],
    },
    controller: {
      label: "Controller (Verantwortlicher)",
      lines: [
        "The customer organization that uses the Service and is bound by the Principal Agreement (the \"Controller\").",
        "Its legal name, address and authorized representative are those stated in the Controller's account and in the counter-signature block of this DPA.",
      ],
    },
  },
  recitals: {
    title: "Background",
    body: [
      {
        kind: "p",
        text: "On the Controller's instruction, the Processor reads license, directory and activity metadata from the Controller's Microsoft 365 tenant and, where the Controller connects them, from further source systems, and presents the results as analyses, reports and exports. Mailbox, file and message content is never accessed; access to the tenant is technically limited to read-only permissions.",
      },
      {
        kind: "p",
        text: "In doing so the Processor processes personal data on behalf of the Controller. The Parties enter into this DPA to meet the requirements of Article 28 GDPR. With regard to the processing of personal data, this DPA prevails over any conflicting provision of the Principal Agreement.",
      },
    ],
  },
  clauses: [
    {
      n: "1",
      title: "Subject matter, duration and scope",
      body: [
        {
          kind: "p",
          text: "The subject matter and duration of the processing, its nature and purpose, the types of personal data and the categories of data subjects are set out in Annex 1. The processing is carried out for the term of the Principal Agreement and ends when that agreement ends, subject to Section 10.",
        },
        {
          kind: "p",
          text: "The Processor processes personal data exclusively within the European Union / European Economic Area, save for the transfers described in Section 12. The Processor does not process the data for its own purposes.",
        },
      ],
    },
    {
      n: "2",
      title: "Rights and instructions of the Controller",
      body: [
        {
          kind: "p",
          text: "The Controller is responsible for assessing the lawfulness of the processing and for safeguarding the rights of data subjects. The Controller retains sole control and ownership of the personal data.",
        },
        {
          kind: "p",
          text: "The Controller's documented instructions are constituted by this DPA, the Principal Agreement and the configuration choices the Controller makes in the Service (for example which tenant and which optional source systems it connects, the price book it maintains and the exports it triggers). Additional or amended instructions must be issued in text form.",
        },
      ],
    },
    {
      n: "3",
      title: "General obligations of the Processor",
      body: [
        {
          kind: "p",
          text: "The Processor processes personal data only on the Controller's documented instructions, including with regard to transfers to a third country, unless required to do so by Union or Member State law to which it is subject; in such a case the Processor informs the Controller of that legal requirement before processing, unless the law prohibits it.",
        },
        {
          kind: "p",
          text: "The Processor informs the Controller without undue delay if, in its opinion, an instruction infringes the GDPR or other applicable data protection provisions. The Processor is not obliged to carry out a legal review of the instructions.",
        },
      ],
    },
    {
      n: "4",
      title: "Confidentiality",
      body: [
        {
          kind: "p",
          text: "The Processor ensures that persons authorized to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality (Art. 28(3)(b), Art. 29, Art. 32(4) GDPR). Access to the personal data is limited to those employees and contractors who need it to provide and operate the Service.",
        },
      ],
    },
    {
      n: "5",
      title: "Technical and organizational measures (Art. 32 GDPR)",
      body: [
        {
          kind: "p",
          text: "Taking into account the state of the art, the costs of implementation and the nature, scope, context and purposes of the processing, the Processor implements appropriate technical and organizational measures to ensure a level of security appropriate to the risk. The measures in place are described in Annex 2.",
        },
        {
          kind: "p",
          text: "The measures are subject to technical progress and further development. The Processor may implement adequate alternative measures, provided the security level is not reduced below that of Annex 2. Material changes are documented.",
        },
      ],
    },
    {
      n: "6",
      title: "Sub-processors",
      body: [
        {
          kind: "p",
          text: "The Controller grants the Processor general written authorization to engage the sub-processors listed in Annex 3 for the processing on the Controller's behalf. Each sub-processor is bound by a contract imposing data protection obligations equivalent to those of this DPA, in particular sufficient guarantees under Art. 28(3) and (4) GDPR. The Processor remains fully liable to the Controller for the performance of its sub-processors' obligations.",
        },
        {
          kind: "p",
          text: "The Processor informs the Controller of any intended change concerning the addition or replacement of a sub-processor at least thirty (30) days in advance, thereby giving the Controller the opportunity to object on reasonable data protection grounds. If the Controller objects and the Parties cannot agree on a solution, the Controller may terminate the affected part of the Service for good cause.",
        },
      ],
    },
    {
      n: "7",
      title: "Assistance with data subjects' rights",
      body: [
        {
          kind: "p",
          text: "Taking into account the nature of the processing, the Processor assists the Controller by appropriate technical and organizational measures, insofar as possible, in fulfilling the Controller's obligation to respond to requests for exercising data subjects' rights under Chapter III GDPR (Art. 12 to 23).",
        },
        {
          kind: "p",
          text: "Where a data subject contacts the Processor directly, the Processor forwards the request to the Controller without undue delay and does not respond on the merits itself unless instructed by the Controller.",
        },
      ],
    },
    {
      n: "8",
      title: "Assistance with the Controller's compliance obligations",
      body: [
        {
          kind: "p",
          text: "Taking into account the nature of the processing and the information available to it, the Processor assists the Controller in ensuring compliance with its obligations under Art. 32 to 36 GDPR, in particular the security of processing, the notification of personal data breaches, the communication of breaches to data subjects, data protection impact assessments and prior consultation.",
        },
      ],
    },
    {
      n: "9",
      title: "Personal data breaches",
      body: [
        {
          kind: "p",
          text: "The Processor notifies the Controller without undue delay after becoming aware of a personal data breach affecting personal data processed on the Controller's behalf. The notification describes, to the extent known, the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences and the measures taken or proposed to address it.",
        },
      ],
    },
    {
      n: "10",
      title: "Return and deletion of personal data",
      body: [
        {
          kind: "p",
          text: "On termination of the processing, and at the Controller's choice, the Processor deletes or returns all personal data processed on the Controller's behalf and deletes existing copies, unless Union or Member State law requires storage. Disconnecting a workspace in the Service deletes all synchronized data immediately and irreversibly; remaining copies in routine encrypted backups are overwritten within the backup rotation window (currently around seven days).",
        },
        {
          kind: "p",
          text: "Where the Service involves billing, the payment subprocessor named in Annex 3 retains invoice and transaction data for the period required by statutory tax and commercial-law retention duties, even after deletion of the workspace.",
        },
      ],
    },
    {
      n: "11",
      title: "Audits and demonstration of compliance",
      body: [
        {
          kind: "p",
          text: "The Processor makes available to the Controller all information necessary to demonstrate compliance with the obligations laid down in Art. 28 GDPR and allows for and contributes to audits, including inspections, conducted by the Controller or another auditor mandated by the Controller.",
        },
        {
          kind: "p",
          text: "The Processor may satisfy this obligation in the first instance by providing this DPA, the security overview published at the /security page, the subprocessors' own certifications and audit reports (for example SOC 2 / ISO 27001), and written answers to security questionnaires. On-site inspections are carried out on reasonable prior notice, during business hours, without disrupting operations, and subject to confidentiality.",
        },
      ],
    },
    {
      n: "12",
      title: "International data transfers",
      body: [
        {
          kind: "p",
          text: "Primary storage and the core processing take place in the European Union (see Annex 2 and Annex 3). Where a sub-processor processes personal data outside the EU / EEA without an adequacy decision, such transfer is based on the European Commission's Standard Contractual Clauses (SCCs) together with any supplementary measures required, or on another valid transfer mechanism under Chapter V GDPR. The transfer mechanism applicable to each sub-processor is indicated in Annex 3.",
        },
      ],
    },
    {
      n: "13",
      title: "Liability",
      body: [
        {
          kind: "p",
          text: "Liability of the Parties is governed by Art. 82 GDPR and by the liability provisions of the Principal Agreement. The liability limitations and caps agreed in the Principal Agreement apply to claims under this DPA to the extent permitted by law.",
        },
      ],
    },
    {
      n: "14",
      title: "Term and order of precedence",
      body: [
        {
          kind: "p",
          text: "This DPA takes effect together with the Principal Agreement and remains in force for as long as the Processor processes personal data on the Controller's behalf. In the event of a conflict between this DPA and the Principal Agreement regarding the processing of personal data, this DPA prevails. In the event of a conflict between this DPA and the SCCs, the SCCs prevail.",
        },
      ],
    },
    {
      n: "15",
      title: "Final provisions",
      body: [
        {
          kind: "p",
          text: "This DPA is governed by the law of the Federal Republic of Germany, excluding the UN Convention on Contracts for the International Sale of Goods. The exclusive place of jurisdiction, where permitted, is the registered seat of the Processor. Should individual provisions be or become invalid, the validity of the remaining provisions is unaffected; the invalid provision is replaced by a valid provision that comes closest to its economic intent. Amendments must be made in text form.",
        },
      ],
    },
  ],
  annexLabel: "Annex",
  annexes: [
    {
      id: "1",
      title: "Description of the processing",
      intro: [
        {
          kind: "defs",
          items: [
            {
              term: "Subject matter",
              def: "Analysis of the Controller's software licensing to surface unused, oversized and misaligned license assignments, and the generation of related reports and exports.",
            },
            {
              term: "Nature and purpose",
              def: "Read-only collection, storage, aggregation and analysis of license, directory and activity metadata, solely to provide the Service to the Controller.",
            },
            {
              term: "Duration",
              def: "For the term of the Principal Agreement; data is retained only while the workspace is connected and is deleted on disconnect (see Section 10).",
            },
            {
              term: "Frequency",
              def: "Continuous / scheduled synchronization (typically nightly) plus on-demand actions triggered by the Controller's users.",
            },
            {
              term: "Categories of data subjects",
              def: "The Controller's employees and other directory users; holders of seats in connected source systems; the Controller's own workspace members who sign in to the Service.",
            },
            {
              term: "Types of personal data",
              def: "Display name; user principal name (UPN) / email address; directory object and tenant identifiers; account status and user type; account creation date; assigned license SKUs; last sign-in and per-workload last-activity timestamps; for connected source systems, seat email, status and product assignments; for workspace members, name, email, role and sign-in activity.",
            },
            {
              term: "Special categories",
              def: "None. The Service is not intended for special categories of personal data (Art. 9 GDPR), and mailbox, file and message content is never accessed.",
            },
          ],
        },
      ],
    },
    {
      id: "2",
      title: "Technical and organizational measures (Art. 32 GDPR)",
      toms: [
        {
          title: "Confidentiality - access control",
          items: [
            "Workspace access is invite-based; signing in with a tenant account grants nothing by itself. Roles (owner, admin, viewer) enforce least privilege.",
            "Tenant isolation is enforced in the application on every query and, in addition, by PostgreSQL row-level security with a deny-all default and a least-privilege application database role (no schema or superuser rights).",
            "Authentication uses OpenID Connect with PKCE and JWKS verification; sessions are signed, httpOnly, secure cookies with a bounded lifetime.",
            "Access to the production environment is limited to authorized personnel under confidentiality obligations.",
          ],
        },
        {
          title: "Confidentiality - encryption",
          items: [
            "All data in transit is protected with TLS and HSTS.",
            "Data at rest is encrypted by the managed database provider (AES-256).",
            "Third-party connector credentials are additionally encrypted at the application layer using AES-256-GCM with a key derived via HKDF-SHA256.",
          ],
        },
        {
          title: "Integrity",
          items: [
            "Read-only access to the Microsoft 365 tenant: the Service holds no write permissions and cannot change anything in the tenant.",
            "State-changing requests are protected by origin / CSRF checks; authentication and sensitive endpoints are rate-limited.",
            "Database integrity is enforced through primary keys, unique constraints and foreign-key constraints.",
          ],
        },
        {
          title: "Availability and resilience",
          items: [
            "Hosting in EU data centers (Frankfurt region) on a managed platform with DDoS protection and a content delivery network.",
            "Automated, managed database backups with point-in-time recovery within the provider's retention window.",
            "The synchronization is resilient to missing optional permissions and logs each run for recovery and post-incident analysis.",
          ],
        },
        {
          title: "Accountability and review",
          items: [
            "A per-workspace audit log records exports and administrative actions and is deleted with the workspace.",
            "A documented breach-notification process (notification to the Controller without undue delay).",
            "Subprocessors are selected for documented security postures (e.g. SOC 2 / ISO 27001) and bound by data processing agreements.",
          ],
        },
        {
          title: "Deletion and separation",
          items: [
            "Disconnecting a workspace deletes all synchronized data immediately and irreversibly (cascade delete), including the audit log and, where billing applies, the payment-provider customer record.",
            "Customer data is logically separated per tenant throughout storage and processing.",
          ],
        },
      ],
    },
    {
      id: "3",
      title: "Approved sub-processors",
      intro: [
        {
          kind: "p",
          text: "The Processor engages the following sub-processors for the processing of personal data on the Controller's behalf:",
        },
      ],
      subprocessors: {
        headers: {
          name: "Sub-processor",
          purpose: "Purpose",
          location: "Processing location",
          basis: "Transfer mechanism",
        },
        rows: [
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
            purpose: "Identity platform (sign-in, admin consent) and Microsoft Graph API",
            location: "EU Data Boundary; US fallback",
            basis: "EU Standard Contractual Clauses (Microsoft Products and Services DPA)",
          },
          {
            name: "WorkOS, Inc.",
            purpose: "Authentication and user identity management (AuthKit sign-in), where enabled",
            location: "US",
            basis: "EU Standard Contractual Clauses (WorkOS DPA)",
          },
          {
            name: "Stripe (Stripe Payments Europe Ltd. / Stripe, Inc.)",
            purpose: "Billing and subscription management (for paid plans)",
            location: "EU and US",
            basis: "EU Standard Contractual Clauses (Stripe DPA); retains invoice data to meet statutory tax-retention duties",
          },
          {
            name: "Resend Inc.",
            purpose: "Transactional and notification email delivery",
            location: "EU (Ireland region)",
            basis: "EU processing; SCCs where applicable",
          },
        ],
        note: [
          {
            kind: "p",
            text: "To be distinguished from sub-processors are the optional source systems named in Annex 1 (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic) and any member lists the Controller imports by CSV (ChatGPT, Claude). The Processor reads from these systems on the Controller's behalf on a read-only basis. They are data sources, not sub-processors of the Processor; no personal data is disclosed to them beyond the authenticated read request. Where the Controller connects a Microsoft tenant using its own app registration ('bring your own'), the credentials supplied (client secret or certificate private key) are stored encrypted at rest (AES-256-GCM) and used solely to perform the read-only Microsoft Graph sync; they are never logged or disclosed.",
          },
        ],
      },
    },
  ],
  signature: {
    title: "Signatures",
    intro:
      "This DPA is pre-signed by the Processor. It takes effect either automatically when the Controller accepts the Principal Agreement, or on the date the Controller signs below. Controllers whose internal processes require a fully executed copy may return this signed PDF to the contact address above.",
    processor: {
      label: "For the Processor",
      lines: [
        "UgurLabs UG (haftungsbeschränkt)",
        "Name: Ugur Koc",
        "Title: Managing Director (Geschäftsführer)",
        `Signed electronically with version ${VERSION}, ${EFFECTIVE_EN}`,
      ],
    },
    controller: {
      label: "For the Controller",
      lines: [
        "Legal entity: ____________________________",
        "Name: ____________________________",
        "Title: ____________________________",
        "Place / Date: ____________________________",
        "Signature: ____________________________",
      ],
    },
  },
  ui: {
    eyebrow: "Data protection",
    pageTitle: "Data Processing Agreement (DPA / AVV)",
    pageIntro:
      "LicenseMeter processes directory and license metadata on your behalf, so a data processing agreement under Art. 28 GDPR is part of every subscription. The full text is below; download the pre-signed PDF in English or German for your records and procurement checklist.",
    metaLine: `Version ${VERSION} · Effective ${EFFECTIVE_EN}`,
    howToTitle: "How to put this DPA in place",
    howToSteps: [
      "It is already in effect: accepting the LicenseMeter Terms also accepts this DPA, which is pre-signed by us.",
      "Need a signed paper for your files? Download the PDF, fill in your entity details, and counter-sign the signature block.",
      "Send the signed copy to the contact address in the document if your process requires a fully executed version.",
    ],
    download: "Download PDF",
    languageOf: "Language",
    annexNav: "Annexes",
  },
};

/* ------------------------------------------------------------------- German */

const DE: DpaDoc = {
  docTitle: "Auftragsverarbeitungsvertrag (AVV)",
  docSubtitle: "gemäß Art. 28 DSGVO",
  version: VERSION,
  effective: EFFECTIVE_DE,
  metaDescription:
    "Auftragsverarbeitungsvertrag (AVV / DPA) von LicenseMeter nach Art. 28 DSGVO: Umfang, technische und organisatorische Maßnahmen, benannte Unterauftragsverarbeiter und EU-Datenhaltung. Vorunterzeichneter PDF-Download in Deutsch und Englisch.",
  parties: {
    title: "Parteien",
    intro: [
      {
        kind: "p",
        text: 'Dieser Auftragsverarbeitungsvertrag ("AVV") ist Bestandteil der LicenseMeter-AGB (der "Hauptvertrag") zwischen den Parteien über die Nutzung des Dienstes LicenseMeter (der "Dienst"). Er regelt die Verarbeitung personenbezogener Daten, die der Auftragsverarbeiter im Zusammenhang mit dem Dienst im Auftrag des Verantwortlichen durchführt, gemäß Art. 28 DSGVO.',
      },
    ],
    processor: {
      label: "Auftragsverarbeiter",
      lines: [
        "UgurLabs UG (haftungsbeschränkt)",
        "Fährstraße 217, 40221 Düsseldorf, Deutschland",
        "Vertreten durch den Geschäftsführer Ugur Koc",
        `Kontakt: ${SUPPORT_EMAIL}`,
        '("LicenseMeter" bzw. der "Auftragsverarbeiter")',
      ],
    },
    controller: {
      label: "Verantwortlicher",
      lines: [
        'Die Kundenorganisation, die den Dienst nutzt und an den Hauptvertrag gebunden ist (der "Verantwortliche").',
        "Firma, Anschrift und vertretungsberechtigte Person ergeben sich aus dem Konto des Verantwortlichen und aus dem Unterschriftenfeld dieses AVV.",
      ],
    },
  },
  recitals: {
    title: "Präambel",
    body: [
      {
        kind: "p",
        text: "Auf Weisung des Verantwortlichen liest der Auftragsverarbeiter Lizenz-, Verzeichnis- und Aktivitätsmetadaten aus dem Microsoft-365-Tenant des Verantwortlichen sowie - soweit der Verantwortliche sie verbindet - aus weiteren Quellsystemen und stellt die Ergebnisse als Analysen, Berichte und Exporte bereit. Auf Postfach-, Datei- oder Nachrichteninhalte wird zu keinem Zeitpunkt zugegriffen; der Zugriff auf den Tenant ist technisch auf Leseberechtigungen beschränkt.",
      },
      {
        kind: "p",
        text: "Dabei verarbeitet der Auftragsverarbeiter personenbezogene Daten im Auftrag des Verantwortlichen. Die Parteien schließen diesen AVV, um den Anforderungen des Art. 28 DSGVO zu genügen. Hinsichtlich der Verarbeitung personenbezogener Daten geht dieser AVV widersprechenden Regelungen des Hauptvertrags vor.",
      },
    ],
  },
  clauses: [
    {
      n: "1",
      title: "Gegenstand, Dauer und Umfang",
      body: [
        {
          kind: "p",
          text: "Gegenstand und Dauer der Verarbeitung, ihre Art und ihr Zweck, die Arten personenbezogener Daten und die Kategorien betroffener Personen ergeben sich aus Anlage 1. Die Verarbeitung erfolgt für die Laufzeit des Hauptvertrags und endet mit dessen Beendigung, vorbehaltlich Ziffer 10.",
        },
        {
          kind: "p",
          text: "Der Auftragsverarbeiter verarbeitet die personenbezogenen Daten ausschließlich innerhalb der Europäischen Union / des Europäischen Wirtschaftsraums, abgesehen von den in Ziffer 12 beschriebenen Übermittlungen. Eine Verarbeitung zu eigenen Zwecken erfolgt nicht.",
        },
      ],
    },
    {
      n: "2",
      title: "Rechte und Weisungen des Verantwortlichen",
      body: [
        {
          kind: "p",
          text: "Der Verantwortliche ist für die Beurteilung der Zulässigkeit der Verarbeitung sowie für die Wahrung der Rechte der betroffenen Personen verantwortlich. Die Kontrolle über die personenbezogenen Daten und die Rechte daran verbleiben beim Verantwortlichen.",
        },
        {
          kind: "p",
          text: "Die dokumentierten Weisungen des Verantwortlichen ergeben sich aus diesem AVV, dem Hauptvertrag und den Konfigurationsentscheidungen, die der Verantwortliche im Dienst trifft (etwa welcher Tenant und welche optionalen Quellsysteme verbunden werden, das gepflegte Preisbuch und die ausgelösten Exporte). Ergänzende oder geänderte Weisungen sind in Textform zu erteilen.",
        },
      ],
    },
    {
      n: "3",
      title: "Allgemeine Pflichten des Auftragsverarbeiters",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter verarbeitet die personenbezogenen Daten nur auf dokumentierte Weisung des Verantwortlichen - auch in Bezug auf die Übermittlung in ein Drittland -, sofern er nicht durch das Recht der Union oder der Mitgliedstaaten, dem er unterliegt, hierzu verpflichtet ist; in einem solchen Fall teilt er dem Verantwortlichen diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das Recht dies nicht verbietet.",
        },
        {
          kind: "p",
          text: "Der Auftragsverarbeiter informiert den Verantwortlichen unverzüglich, falls eine Weisung seiner Auffassung nach gegen die DSGVO oder andere anwendbare Datenschutzvorschriften verstößt. Eine rechtliche Prüfung der Weisungen schuldet der Auftragsverarbeiter nicht.",
        },
      ],
    },
    {
      n: "4",
      title: "Vertraulichkeit",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter stellt sicher, dass sich die zur Verarbeitung der personenbezogenen Daten befugten Personen zur Vertraulichkeit verpflichtet haben oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen (Art. 28 Abs. 3 lit. b, Art. 29, Art. 32 Abs. 4 DSGVO). Der Zugriff auf die personenbezogenen Daten ist auf diejenigen Beschäftigten und Auftragnehmer beschränkt, die ihn zur Bereitstellung und zum Betrieb des Dienstes benötigen.",
        },
      ],
    },
    {
      n: "5",
      title: "Technische und organisatorische Maßnahmen (Art. 32 DSGVO)",
      body: [
        {
          kind: "p",
          text: "Unter Berücksichtigung des Stands der Technik, der Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung trifft der Auftragsverarbeiter geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten. Die getroffenen Maßnahmen sind in Anlage 2 beschrieben.",
        },
        {
          kind: "p",
          text: "Die Maßnahmen unterliegen dem technischen Fortschritt und der Weiterentwicklung. Dem Auftragsverarbeiter steht es frei, angemessene alternative Maßnahmen umzusetzen, sofern das Schutzniveau der Anlage 2 nicht unterschritten wird. Wesentliche Änderungen werden dokumentiert.",
        },
      ],
    },
    {
      n: "6",
      title: "Unterauftragsverarbeiter",
      body: [
        {
          kind: "p",
          text: "Der Verantwortliche erteilt dem Auftragsverarbeiter die allgemeine schriftliche Genehmigung, die in Anlage 3 genannten Unterauftragsverarbeiter für die Verarbeitung im Auftrag des Verantwortlichen einzusetzen. Jeder Unterauftragsverarbeiter wird vertraglich zu Datenschutzpflichten verpflichtet, die denen dieses AVV entsprechen, insbesondere zu hinreichenden Garantien gemäß Art. 28 Abs. 3 und 4 DSGVO. Der Auftragsverarbeiter haftet dem Verantwortlichen gegenüber uneingeschränkt für die Erfüllung der Pflichten seiner Unterauftragsverarbeiter.",
        },
        {
          kind: "p",
          text: "Der Auftragsverarbeiter informiert den Verantwortlichen mindestens dreißig (30) Tage im Voraus über jede beabsichtigte Änderung in Bezug auf die Hinzuziehung oder Ersetzung eines Unterauftragsverarbeiters und gibt dem Verantwortlichen damit die Möglichkeit, aus berechtigten datenschutzrechtlichen Gründen Einspruch zu erheben. Erhebt der Verantwortliche Einspruch und können sich die Parteien nicht einigen, kann der Verantwortliche den betroffenen Teil des Dienstes aus wichtigem Grund kündigen.",
        },
      ],
    },
    {
      n: "7",
      title: "Unterstützung bei den Rechten betroffener Personen",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter unterstützt den Verantwortlichen unter Berücksichtigung der Art der Verarbeitung nach Möglichkeit mit geeigneten technischen und organisatorischen Maßnahmen dabei, seiner Pflicht zur Beantwortung von Anträgen auf Wahrnehmung der Rechte der betroffenen Personen gemäß Kapitel III DSGVO (Art. 12 bis 23) nachzukommen.",
        },
        {
          kind: "p",
          text: "Wendet sich eine betroffene Person unmittelbar an den Auftragsverarbeiter, leitet dieser das Anliegen unverzüglich an den Verantwortlichen weiter und beantwortet es nicht selbst inhaltlich, sofern keine Weisung des Verantwortlichen vorliegt.",
        },
      ],
    },
    {
      n: "8",
      title: "Unterstützung bei den Pflichten des Verantwortlichen",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter unterstützt den Verantwortlichen unter Berücksichtigung der Art der Verarbeitung und der ihm zur Verfügung stehenden Informationen bei der Einhaltung der in Art. 32 bis 36 DSGVO genannten Pflichten, insbesondere der Sicherheit der Verarbeitung, der Meldung von Verletzungen des Schutzes personenbezogener Daten, der Benachrichtigung betroffener Personen, der Datenschutz-Folgenabschätzung und der vorherigen Konsultation.",
        },
      ],
    },
    {
      n: "9",
      title: "Verletzungen des Schutzes personenbezogener Daten",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter benachrichtigt den Verantwortlichen unverzüglich, nachdem ihm eine Verletzung des Schutzes der im Auftrag des Verantwortlichen verarbeiteten personenbezogenen Daten bekannt geworden ist. Die Benachrichtigung beschreibt, soweit bekannt, die Art der Verletzung, die Kategorien und die ungefähre Zahl der betroffenen Personen und Datensätze, die wahrscheinlichen Folgen sowie die ergriffenen oder vorgeschlagenen Maßnahmen.",
        },
      ],
    },
    {
      n: "10",
      title: "Rückgabe und Löschung personenbezogener Daten",
      body: [
        {
          kind: "p",
          text: "Nach Beendigung der Verarbeitung löscht der Auftragsverarbeiter nach Wahl des Verantwortlichen alle im Auftrag verarbeiteten personenbezogenen Daten oder gibt sie zurück und löscht vorhandene Kopien, sofern nicht nach dem Recht der Union oder der Mitgliedstaaten eine Aufbewahrung vorgeschrieben ist. Das Trennen eines Arbeitsbereichs im Dienst löscht alle synchronisierten Daten unmittelbar und unwiderruflich; verbleibende Kopien in routinemäßigen verschlüsselten Backups werden innerhalb des Backup-Rotationszeitraums (derzeit etwa sieben Tage) überschrieben.",
        },
        {
          kind: "p",
          text: "Soweit der Dienst eine Abrechnung umfasst, bewahrt der in Anlage 3 genannte Zahlungs-Unterauftragsverarbeiter Rechnungs- und Transaktionsdaten für den Zeitraum auf, der nach den gesetzlichen steuer- und handelsrechtlichen Aufbewahrungspflichten erforderlich ist, auch nach Löschung des Arbeitsbereichs.",
        },
      ],
    },
    {
      n: "11",
      title: "Audits und Nachweis der Einhaltung",
      body: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter stellt dem Verantwortlichen alle erforderlichen Informationen zum Nachweis der Einhaltung der in Art. 28 DSGVO niedergelegten Pflichten zur Verfügung und ermöglicht Überprüfungen - einschließlich Inspektionen -, die vom Verantwortlichen oder einem von diesem beauftragten Prüfer durchgeführt werden, und trägt zu diesen bei.",
        },
        {
          kind: "p",
          text: "Der Auftragsverarbeiter kann diese Pflicht zunächst durch Vorlage dieses AVV, der auf der Seite /security veröffentlichten Sicherheitsübersicht, der Zertifizierungen und Prüfberichte der Unterauftragsverarbeiter (z. B. SOC 2 / ISO 27001) sowie durch schriftliche Beantwortung von Sicherheitsfragebögen erfüllen. Vor-Ort-Prüfungen erfolgen mit angemessener Vorankündigung, während der Geschäftszeiten, ohne Betriebsstörung und unter Wahrung der Vertraulichkeit.",
        },
      ],
    },
    {
      n: "12",
      title: "Datenübermittlungen in Drittländer",
      body: [
        {
          kind: "p",
          text: "Die primäre Speicherung und die Kernverarbeitung finden in der Europäischen Union statt (siehe Anlage 2 und Anlage 3). Soweit ein Unterauftragsverarbeiter personenbezogene Daten außerhalb der EU / des EWR ohne Angemessenheitsbeschluss verarbeitet, beruht eine solche Übermittlung auf den Standardvertragsklauseln (SCC) der Europäischen Kommission nebst etwaig erforderlichen ergänzenden Maßnahmen oder auf einem anderen gültigen Übermittlungsmechanismus nach Kapitel V DSGVO. Der für den jeweiligen Unterauftragsverarbeiter geltende Mechanismus ist in Anlage 3 angegeben.",
        },
      ],
    },
    {
      n: "13",
      title: "Haftung",
      body: [
        {
          kind: "p",
          text: "Die Haftung der Parteien richtet sich nach Art. 82 DSGVO und nach den Haftungsregelungen des Hauptvertrags. Die im Hauptvertrag vereinbarten Haftungsbeschränkungen und -höchstgrenzen gelten für Ansprüche aus diesem AVV, soweit gesetzlich zulässig.",
        },
      ],
    },
    {
      n: "14",
      title: "Laufzeit und Rangfolge",
      body: [
        {
          kind: "p",
          text: "Dieser AVV tritt zusammen mit dem Hauptvertrag in Kraft und bleibt in Kraft, solange der Auftragsverarbeiter personenbezogene Daten im Auftrag des Verantwortlichen verarbeitet. Bei Widersprüchen zwischen diesem AVV und dem Hauptvertrag hinsichtlich der Verarbeitung personenbezogener Daten geht dieser AVV vor. Bei Widersprüchen zwischen diesem AVV und den SCC gehen die SCC vor.",
        },
      ],
    },
    {
      n: "15",
      title: "Schlussbestimmungen",
      body: [
        {
          kind: "p",
          text: "Dieser AVV unterliegt dem Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Ausschließlicher Gerichtsstand ist, soweit zulässig, der Sitz des Auftragsverarbeiters. Sollten einzelne Bestimmungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt; die unwirksame Bestimmung wird durch eine wirksame ersetzt, die ihrem wirtschaftlichen Zweck am nächsten kommt. Änderungen bedürfen der Textform.",
        },
      ],
    },
  ],
  annexLabel: "Anlage",
  annexes: [
    {
      id: "1",
      title: "Beschreibung der Verarbeitung",
      intro: [
        {
          kind: "defs",
          items: [
            {
              term: "Gegenstand",
              def: "Analyse der Softwarelizenzierung des Verantwortlichen zur Aufdeckung ungenutzter, überdimensionierter und fehlerhaft zugewiesener Lizenzen sowie Erstellung zugehöriger Berichte und Exporte.",
            },
            {
              term: "Art und Zweck",
              def: "Ausschließlich lesende Erhebung, Speicherung, Aggregation und Analyse von Lizenz-, Verzeichnis- und Aktivitätsmetadaten, allein zur Erbringung des Dienstes für den Verantwortlichen.",
            },
            {
              term: "Dauer",
              def: "Für die Laufzeit des Hauptvertrags; Daten werden nur gespeichert, solange der Arbeitsbereich verbunden ist, und beim Trennen gelöscht (siehe Ziffer 10).",
            },
            {
              term: "Häufigkeit",
              def: "Fortlaufende / geplante Synchronisierung (in der Regel nächtlich) sowie durch Nutzer des Verantwortlichen ausgelöste Aktionen.",
            },
            {
              term: "Kategorien betroffener Personen",
              def: "Beschäftigte und sonstige Verzeichnisnutzer des Verantwortlichen; Inhaber von Lizenzplätzen in verbundenen Quellsystemen; die eigenen Arbeitsbereichs-Mitglieder des Verantwortlichen, die sich am Dienst anmelden.",
            },
            {
              term: "Arten personenbezogener Daten",
              def: "Anzeigename; User Principal Name (UPN) / E-Mail-Adresse; Verzeichnis-Objekt- und Tenant-Kennungen; Kontostatus und Nutzertyp; Erstellungsdatum des Kontos; zugewiesene Lizenz-SKUs; Zeitstempel der letzten Anmeldung und der letzten Aktivität je Dienst; bei verbundenen Quellsystemen E-Mail, Status und Produktzuweisungen der Lizenzplätze; bei Arbeitsbereichs-Mitgliedern Name, E-Mail, Rolle und Anmeldeaktivität.",
            },
            {
              term: "Besondere Kategorien",
              def: "Keine. Der Dienst ist nicht für besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) bestimmt; auf Postfach-, Datei- und Nachrichteninhalte wird zu keinem Zeitpunkt zugegriffen.",
            },
          ],
        },
      ],
    },
    {
      id: "2",
      title: "Technische und organisatorische Maßnahmen (Art. 32 DSGVO)",
      toms: [
        {
          title: "Vertraulichkeit - Zugangs- und Zugriffskontrolle",
          items: [
            "Der Zugang zum Arbeitsbereich erfolgt auf Einladung; die Anmeldung mit einem Tenant-Konto allein gewährt keinerlei Zugriff. Rollen (Owner, Admin, Viewer) setzen das Prinzip der geringsten Rechte durch.",
            "Die Mandantentrennung wird in der Anwendung bei jeder Abfrage erzwungen und zusätzlich durch PostgreSQL Row-Level-Security mit Deny-all-Standard und einer Anwendungsdatenbankrolle mit minimalen Rechten (ohne Schema- oder Superuser-Rechte) abgesichert.",
            "Die Authentifizierung nutzt OpenID Connect mit PKCE und JWKS-Prüfung; Sitzungen verwenden signierte, httpOnly-, Secure-Cookies mit begrenzter Lebensdauer.",
            "Der Zugriff auf die Produktionsumgebung ist auf befugtes, zur Vertraulichkeit verpflichtetes Personal beschränkt.",
          ],
        },
        {
          title: "Vertraulichkeit - Verschlüsselung",
          items: [
            "Alle Daten während der Übertragung sind durch TLS und HSTS geschützt.",
            "Ruhende Daten werden durch den verwalteten Datenbankanbieter verschlüsselt (AES-256).",
            "Zugangsdaten von Drittanbieter-Konnektoren werden zusätzlich auf Anwendungsebene mit AES-256-GCM verschlüsselt, mit einem über HKDF-SHA256 abgeleiteten Schlüssel.",
          ],
        },
        {
          title: "Integrität",
          items: [
            "Ausschließlich lesender Zugriff auf den Microsoft-365-Tenant: Der Dienst besitzt keine Schreibberechtigungen und kann im Tenant nichts verändern.",
            "Zustandsändernde Anfragen sind durch Origin- / CSRF-Prüfungen geschützt; Anmelde- und sensible Endpunkte sind ratenbegrenzt.",
            "Die Datenbankintegrität wird durch Primärschlüssel, Eindeutigkeits- und Fremdschlüsselbeschränkungen sichergestellt.",
          ],
        },
        {
          title: "Verfügbarkeit und Belastbarkeit",
          items: [
            "Hosting in EU-Rechenzentren (Region Frankfurt) auf einer verwalteten Plattform mit DDoS-Schutz und Content Delivery Network.",
            "Automatisierte, verwaltete Datenbank-Backups mit Point-in-Time-Recovery innerhalb des Aufbewahrungszeitraums des Anbieters.",
            "Die Synchronisierung ist gegenüber fehlenden optionalen Berechtigungen widerstandsfähig und protokolliert jeden Lauf zur Wiederherstellung und Nachanalyse.",
          ],
        },
        {
          title: "Rechenschaft und Überprüfung",
          items: [
            "Ein arbeitsbereichsbezogenes Audit-Protokoll erfasst Exporte und administrative Aktionen und wird mit dem Arbeitsbereich gelöscht.",
            "Ein dokumentiertes Verfahren zur Meldung von Schutzverletzungen (Benachrichtigung des Verantwortlichen unverzüglich).",
            "Unterauftragsverarbeiter werden nach dokumentierten Sicherheitsstandards ausgewählt (z. B. SOC 2 / ISO 27001) und durch Auftragsverarbeitungsverträge gebunden.",
          ],
        },
        {
          title: "Löschung und Trennung",
          items: [
            "Das Trennen eines Arbeitsbereichs löscht alle synchronisierten Daten unmittelbar und unwiderruflich (Cascade Delete), einschließlich des Audit-Protokolls und - soweit eine Abrechnung erfolgt - des Kundendatensatzes beim Zahlungsdienstleister.",
            "Kundendaten werden über Speicherung und Verarbeitung hinweg je Mandant logisch getrennt.",
          ],
        },
      ],
    },
    {
      id: "3",
      title: "Genehmigte Unterauftragsverarbeiter",
      intro: [
        {
          kind: "p",
          text: "Der Auftragsverarbeiter setzt für die Verarbeitung personenbezogener Daten im Auftrag des Verantwortlichen die folgenden Unterauftragsverarbeiter ein:",
        },
      ],
      subprocessors: {
        headers: {
          name: "Unterauftragsverarbeiter",
          purpose: "Zweck",
          location: "Verarbeitungsort",
          basis: "Übermittlungsmechanismus",
        },
        rows: [
          {
            name: "Vercel Inc.",
            purpose: "Anwendungs-Hosting und Content Delivery",
            location: "EU (Funktionsregion Frankfurt)",
            basis: "Verarbeitung in der EU; SCC für etwaige Support-Zugriffe von außerhalb der EU",
          },
          {
            name: "Supabase Inc.",
            purpose: "Verwaltete PostgreSQL-Datenbank (primärer Datenspeicher)",
            location: "EU (AWS eu-central-1, Frankfurt)",
            basis: "Verarbeitung in der EU; SCC für etwaige Support-Zugriffe von außerhalb der EU",
          },
          {
            name: "Microsoft (Microsoft Ireland Operations Ltd. / Microsoft Corporation)",
            purpose: "Identitätsplattform (Anmeldung, Admin-Consent) und Microsoft Graph API",
            location: "EU Data Boundary; US als Rückfallebene",
            basis: "EU-Standardvertragsklauseln (Microsoft Products and Services DPA)",
          },
          {
            name: "WorkOS, Inc.",
            purpose: "Authentifizierung und Identitätsverwaltung (AuthKit-Anmeldung), soweit aktiviert",
            location: "USA",
            basis: "EU-Standardvertragsklauseln (WorkOS DPA)",
          },
          {
            name: "Stripe (Stripe Payments Europe Ltd. / Stripe, Inc.)",
            purpose: "Abrechnung und Abonnementverwaltung (bei kostenpflichtigen Plänen)",
            location: "EU und USA",
            basis: "EU-Standardvertragsklauseln (Stripe DPA); Aufbewahrung von Rechnungsdaten zur Erfüllung gesetzlicher steuerlicher Aufbewahrungspflichten",
          },
          {
            name: "Resend Inc.",
            purpose: "Versand transaktionaler und Benachrichtigungs-E-Mails",
            location: "EU (Region Irland)",
            basis: "Verarbeitung in der EU; SCC soweit einschlägig",
          },
        ],
        note: [
          {
            kind: "p",
            text: "Von den Unterauftragsverarbeitern zu unterscheiden sind die in Anlage 1 genannten optionalen Quellsysteme (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic) sowie etwaige per CSV importierte Mitgliederlisten (ChatGPT, Claude). Aus diesen Systemen liest der Auftragsverarbeiter im Auftrag des Verantwortlichen ausschließlich lesend. Es handelt sich um Datenquellen, nicht um Unterauftragsverarbeiter des Auftragsverarbeiters; über die authentifizierte Leseanfrage hinaus werden ihnen keine personenbezogenen Daten offengelegt. Bindet der Verantwortliche einen Microsoft-Mandanten mit eigener App-Registrierung ein ('Bring your own'), werden die übergebenen Zugangsdaten (Client-Secret oder privater Schlüssel des Zertifikats) verschlüsselt gespeichert (AES-256-GCM) und ausschließlich zur Durchführung der nur lesenden Microsoft-Graph-Synchronisierung verwendet; sie werden niemals protokolliert oder offengelegt.",
          },
        ],
      },
    },
  ],
  signature: {
    title: "Unterschriften",
    intro:
      "Dieser AVV ist vom Auftragsverarbeiter vorunterzeichnet. Er tritt entweder automatisch mit Annahme des Hauptvertrags durch den Verantwortlichen oder mit dem Datum der nachstehenden Unterschrift des Verantwortlichen in Kraft. Verantwortliche, deren interne Abläufe ein vollständig unterzeichnetes Exemplar erfordern, können dieses unterzeichnete PDF an die oben genannte Kontaktadresse zurücksenden.",
    processor: {
      label: "Für den Auftragsverarbeiter",
      lines: [
        "UgurLabs UG (haftungsbeschränkt)",
        "Name: Ugur Koc",
        "Funktion: Geschäftsführer",
        `Elektronisch unterzeichnet mit Version ${VERSION}, ${EFFECTIVE_DE}`,
      ],
    },
    controller: {
      label: "Für den Verantwortlichen",
      lines: [
        "Unternehmen: ____________________________",
        "Name: ____________________________",
        "Funktion: ____________________________",
        "Ort / Datum: ____________________________",
        "Unterschrift: ____________________________",
      ],
    },
  },
  ui: {
    eyebrow: "Datenschutz",
    pageTitle: "Auftragsverarbeitungsvertrag (AVV / DPA)",
    pageIntro:
      "LicenseMeter verarbeitet Verzeichnis- und Lizenzmetadaten in Ihrem Auftrag, daher ist ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO Bestandteil jedes Abonnements. Der vollständige Text steht unten; laden Sie das vorunterzeichnete PDF auf Deutsch oder Englisch für Ihre Unterlagen und Ihre Beschaffungs-Checkliste herunter.",
    metaLine: `Version ${VERSION} · Gültig ab ${EFFECTIVE_DE}`,
    howToTitle: "So setzen Sie diesen AVV in Kraft",
    howToSteps: [
      "Er ist bereits in Kraft: Mit Annahme der LicenseMeter-AGB nehmen Sie auch diesen von uns vorunterzeichneten AVV an.",
      "Sie benötigen ein unterschriebenes Exemplar für Ihre Akten? Laden Sie das PDF herunter, tragen Sie Ihre Unternehmensangaben ein und gegenzeichnen Sie das Unterschriftenfeld.",
      "Senden Sie das unterzeichnete Exemplar an die im Dokument genannte Kontaktadresse, falls Ihr Prozess eine vollständig unterzeichnete Fassung verlangt.",
    ],
    download: "PDF herunterladen",
    languageOf: "Sprache",
    annexNav: "Anlagen",
  },
};

export const DPA: Record<DpaLang, DpaDoc> = { en: EN, de: DE };

/** Download filename per language, e.g. LicenseMeter-DPA-en.pdf. */
export const dpaFilename = (lang: DpaLang): string =>
  lang === "de" ? "LicenseMeter-AVV-de.pdf" : "LicenseMeter-DPA-en.pdf";
