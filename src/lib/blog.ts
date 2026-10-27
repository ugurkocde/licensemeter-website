import { TRIAL_DAYS } from "~/lib/pricing";

/**
 * Posts for /blog, newest first. Content is structured data rather than
 * Markdown so it renders with the site's own components and is checked by
 * the type system. Every product claim in a post must match the code and the
 * docs at docs.licensemeter.com at the time of publishing.
 */

/** Plain text, bold lead-ins and links, in reading order. */
export type Inline =
  string | { strong: string } | { text: string; href: string };

export type BlogBlock =
  | { type: "p"; text: Inline[] }
  | { type: "h2"; id: string; text: string }
  | { type: "list"; items: Inline[][] }
  | { type: "steps"; items: { title: string; body: Inline[] }[] }
  | { type: "note"; title: string; text: Inline[] }
  | { type: "meteringSample" };

export type BlogPost = {
  slug: string;
  title: string;
  /** Search and share description. */
  description: string;
  /** One or two sentences for the index card and the post lede. */
  excerpt: string;
  /** YYYY-MM-DD. */
  publishedOn: string;
  author: { name: string; role: string; url: string };
  tag: string;
  body: BlogBlock[];
  /** The closing call to action under the post. */
  cta: {
    title: string;
    body: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
  };
};

const UGUR = {
  name: "Ugur Koc",
  role: "Maintainer, Microsoft MVP for Intune",
  url: "https://ugurkoc.de",
};

const METERING_DOCS =
  "https://docs.licensemeter.com/connectors/windows-metering/";

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "software-metering",
    title: "Introducing Software Metering: see which Windows apps get started",
    description:
      "LicenseMeter Software Metering shows, for every Windows app you deploy through Intune, how many devices have it installed and how many started it. Read live from Intune, no user names, included in Pro and MSP.",
    excerpt:
      "Microsoft 365 tells you who signs in. It does not tell you whether the Visio, Acrobat Pro or AutoCAD on a laptop actually gets opened. Software Metering does, from the day you roll it out.",
    publishedOn: "2026-10-27",
    author: UGUR,
    tag: "Product",
    cta: {
      title: "Try Software Metering on your own devices.",
      body: `Software Metering is included in Pro and MSP. Both plans start with a ${TRIAL_DAYS}-day trial.`,
      primary: { label: "See Pro and MSP", href: "/pricing#software-metering" },
      secondary: { label: "Read the setup guide", href: METERING_DOCS },
    },
    body: [
      {
        type: "p",
        text: [
          "LicenseMeter started with Microsoft 365: disabled accounts that still hold licenses, seats nobody signs in to, Copilot licenses that sit idle. Those signals come from Entra ID and the Microsoft 365 usage reports. Desktop software is different. A Visio or AutoCAD license is assigned to a device or a person, the app is installed by Intune, and from then on nothing in the admin center tells you whether anyone ever opens it.",
        ],
      },
      {
        type: "p",
        text: [
          "Those are often the most expensive seats in the estate, and the renewal question is always the same: who actually uses it? Today we are announcing Software Metering, our answer for Windows apps you deploy through Intune. It is included in the ",
          { text: "Pro and MSP plans", href: "/pricing#software-metering" },
          ".",
        ],
      },
      { type: "h2", id: "what-it-shows", text: "What it shows" },
      {
        type: "p",
        text: [
          "For every Windows app assigned in your Intune (Win32, Microsoft Store, WinGet and line-of-business apps, and Microsoft 365 Apps, with Visio and Project listed on their own), Software Metering shows how many devices have it installed, how many of those started it in the observation period, and how many starts happened in the last 24 hours. The observation period is 30, 60 or 90 days, with 60 as the default.",
        ],
      },
      { type: "meteringSample" },
      {
        type: "p",
        text: [
          "The feature has three pages in the workspace sidebar. The Dashboard holds the charts. Apps lets you search every app, open it to see its devices, and change its settings in the same place. Setup walks you through the connection in three steps. The report exports to CSV.",
        ],
      },
      { type: "h2", id: "how-it-works", text: "How it works" },
      {
        type: "p",
        text: [
          "Install status comes from Intune. Starts come from a small detection script that LicenseMeter generates for your workspace and that runs as an Intune Remediation. Setup takes you through it:",
        ],
      },
      {
        type: "steps",
        items: [
          {
            title: "Connect Software Metering",
            body: [
              "Software Metering uses its own Microsoft Entra application with its own consent. Your existing Microsoft 365 connection keeps its read-only permissions, and people who never enable metering are never asked for Intune access.",
            ],
          },
          {
            title: "Turn on process auditing",
            body: [
              "Enable Audit Process Creation (Success) through the Intune settings catalog or Group Policy. The collector reads process start events from the local Security log. Command-line auditing is not needed.",
            ],
          },
          {
            title: "Create the collector in Intune",
            body: [
              "Select Create in Intune and LicenseMeter creates the Remediations package with the right settings: detection script only, running as SYSTEM in 64-bit PowerShell. Assign it to a pilot group first, or to all devices hourly. If you prefer to review and deploy it yourself, download the script instead.",
            ],
          },
          {
            title: "Read the report",
            body: [
              "LicenseMeter finds the package that runs the collector on its own and reads the results from Intune whenever you open the report. The Dashboard shows its charts from the first report and fills them in as devices report, with the most recent app starts listed alongside.",
            ],
          },
        ],
      },
      {
        type: "p",
        text: [
          "The collector watches program file names, such as acad.exe for AutoCAD. Intune rarely records which program an app starts, so LicenseMeter takes it from a program file an Admin entered, then from the app's Intune detection rule, then from a built-in list of common licensed software. Apps it cannot resolve show Needs a program file, and adding one takes a few seconds on the Apps page. When LicenseMeter can write to Intune, saving updates the collector right away.",
        ],
      },
      {
        type: "h2",
        id: "data-protection",
        text: "Built for European data protection",
      },
      {
        type: "p",
        text: [
          "Measuring software use on employee devices is a sensitive thing to do, especially in Germany and the rest of the EU. We designed Software Metering around that from the first line:",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "No user names." },
            " The collector reports program file names, last starts, start counts, coverage and health per device. It never reports user names, command lines or file paths, and LicenseMeter never requests user columns from Intune.",
          ],
          [
            { strong: "Nothing stored." },
            " Results stay in Intune, under your control. LicenseMeter reads them live when someone opens or exports the report and keeps them in memory for at most five minutes. Only the metering settings are stored.",
          ],
          [
            { strong: "Separate and optional." },
            " Metering has its own application and consent, which you can revoke on its own. Disabling metering deletes its settings immediately.",
          ],
          [
            { strong: "Writes only its own package." },
            " The single write permission is on Intune scripts, used only to create and update LicenseMeter's collector package after an Admin confirms. Every write appears in the activity log.",
          ],
        ],
      },
      {
        type: "note",
        title: "Not for evaluating people",
        text: [
          "Timestamps linked to a device can still relate to the person who uses it. Review your organization's privacy requirements before you deploy the collector, and do not use the report to evaluate individual employee performance.",
        ],
      },
      {
        type: "h2",
        id: "what-a-start-means",
        text: "What a start means, and what it does not",
      },
      {
        type: "p",
        text: [
          "A start is evidence that a program file was launched on a device. It does not measure time in the foreground, productive work or who owns the license. An app counts as not started only when the collector covered the whole observation period on that device without a single start. Missing results, coverage gaps and disabled auditing show as no data and are never read as unused.",
        ],
      },
      {
        type: "p",
        text: [
          "Coverage begins with the collector's first run. It does not reconstruct the past from a short event log, so the first full 60-day picture arrives 60 days after rollout. And as with everything else in LicenseMeter, nothing is removed for you: the report tells you where to look, and you decide what to reclaim.",
        ],
      },
      { type: "h2", id: "requirements", text: "What you need" },
      {
        type: "list",
        items: [
          [
            `A Pro or MSP plan for the workspace on licensemeter.com. Both come with a ${TRIAL_DAYS}-day trial, and self-hosted installations include Software Metering without a plan.`,
          ],
          [
            "Windows devices managed by Intune or co-managed with Configuration Manager, joined to Microsoft Entra or hybrid joined.",
          ],
          [
            "Licensing that includes Intune Remediations. Microsoft lists Windows Enterprise E3 or E5, Windows Education A3 or A5, and Windows VDA per user.",
          ],
          [
            "An administrator who can grant Microsoft Graph application permissions, usually a Global Administrator or Privileged Role Administrator.",
          ],
        ],
      },
      { type: "h2", id: "get-started", text: "Get started" },
      {
        type: "p",
        text: [
          "Open Software Metering, then Setup, in your workspace and follow the three steps. Start with a small pilot group, check a known app start on a test device, then widen the assignment. The ",
          { text: "setup guide", href: METERING_DOCS },
          " covers every step in detail, including log sizing for busy devices and troubleshooting.",
        ],
      },
      {
        type: "p",
        text: [
          "Software Metering is new, and we want to hear how it works in your estate. Tell us what you find and what you would like it to do next through ",
          { text: "support", href: "/support" },
          ".",
        ],
      },
    ],
  },
];

export const blogPost = (slug: string): BlogPost | undefined =>
  BLOG_POSTS.find((post) => post.slug === slug);

/** The launch post the announcement banner points to. */
export const ANNOUNCED_POST = "software-metering";

/** "October 27, 2026". Parsed as UTC so the day never shifts. */
export const formatPostDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

/** Whole minutes at 220 words per minute, never less than one. */
export const readingMinutes = (post: BlogPost): number => {
  const inline = (parts: Inline[]) =>
    parts.map((part) =>
      typeof part === "string"
        ? part
        : "strong" in part
          ? part.strong
          : part.text,
    );
  const words = post.body
    .flatMap((block) => {
      switch (block.type) {
        case "p":
          return inline(block.text);
        case "h2":
          return [block.text];
        case "list":
          return block.items.flatMap(inline);
        case "steps":
          return block.items.flatMap((s) => [s.title, ...inline(s.body)]);
        case "note":
          return [block.title, ...inline(block.text)];
        case "meteringSample":
          return [];
      }
    })
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
};
