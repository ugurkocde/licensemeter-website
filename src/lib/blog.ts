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
  /** YYYY-MM-DD, when the post was last substantively updated. */
  updatedOn?: string;
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
    slug: "remove-license-from-disabled-user",
    title: "How to remove licenses from disabled Microsoft 365 users",
    description:
      "Check mailbox retention, remove direct or group-based licenses from disabled Microsoft 365 users, and verify the assignment and billing changes.",
    excerpt:
      "To remove a direct license from a disabled Microsoft 365 user, open Users > Active users, select the account, then clear the license under Licenses and Apps and save. Check mailbox holds and retention first, and remove any inherited assignment through the group that grants it.",
    publishedOn: "2026-11-25",
    author: {
      name: "Ugur Koc",
      role: "Maintainer, Microsoft MVP for Intune",
      url: "https://ugurkoc.de",
    },
    tag: "Guide",
    cta: {
      title: "Review disabled accounts that still hold licenses",
      body: "Find the accounts that still have paid assignments and track each one through your offboarding review.",
      primary: {
        label: "Review the finding",
        href: "/waste/disabled-accounts-still-licensed",
      },
      secondary: {
        label: "Read the remediation workflow",
        href: "https://docs.licensemeter.com/findings/workflow/",
      },
    },
    body: [
      {
        type: "h2",
        id: "check-before-removal",
        text: "Check holds and data before removing a license",
      },
      {
        type: "p",
        text: [
          "Confirm that sign-in was blocked intentionally. Record the user's current licenses and identify any services or downstream access that still depend on them.",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "Holds and legal access." },
            " Check whether a hold still needs to be in place before proceeding. Microsoft's former employee guidance requires clearing holds before license removal. If authorized staff still need eDiscovery access for compliance or legal reasons, keep the required Exchange license while you arrange preservation. Microsoft specifies Exchange Online Plan 2 or Plan 1 with the Exchange Online Archiving add-on to apply a hold before deleting the mailbox. See ",
            {
              text: "Microsoft's offboarding guidance on holds",
              href: "https://learn.microsoft.com/en-us/microsoft-365/admin/add-users/remove-former-employee-step-6?view=o365-worldwide",
            },
            ".",
          ],
          [
            { strong: "Exchange data and search." },
            " Exchange Online holds the user's mailbox data for 30 days after license removal. After that grace period, the data is permanently deleted, with content covered by retention labels kept for discovery. Once the license is removed, the user's mailbox is no longer searchable through Content Search or eDiscovery (Premium). If you plan to delete the account and need to preserve mailbox data, review inactive mailboxes for eligible Enterprise subscriptions.",
          ],
          [
            { strong: "OneDrive files." },
            " Before removing the license, identify and preserve the OneDrive files your organization still needs, even if you plan to keep the user account. Check retention requirements and who needs continued access. See ",
            {
              text: "Microsoft's guidance for former employee data",
              href: "https://learn.microsoft.com/en-us/microsoft-365/admin/add-users/remove-former-employee?view=o365-worldwide",
            },
            ".",
          ],
          [
            { strong: "Shared mailbox conversion." },
            " If a leaver's mailbox should become shared, review ",
            {
              text: "the licensing checks for converting to a shared mailbox",
              href: "/blog/shared-mailbox-license#convert-a-user-mailbox",
            },
            " before removing its license.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          {
            text: "Microsoft's license unassignment guide covers the effects on user data",
            href: "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/assign-licenses-to-users?view=o365-worldwide",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "check-assignment-source",
        text: "Check whether the license is direct or group-based",
      },
      {
        type: "p",
        text: [
          "For a group assignment, the product's license list shows the group name. In the Microsoft 365 admin center, open ",
          { strong: "Teams & groups > Active teams & groups" },
          " to check the group's members.",
        ],
      },
      {
        type: "p",
        text: [
          "In Microsoft Graph, select the user's ",
          { strong: "licenseAssignmentStates" },
          " and check ",
          { strong: "assignedByGroup" },
          " for each assignment of the product. A null value means the license is assigned directly. A group ID identifies the group that grants it. The assignedLicenses field lists both kinds of assignment together. See ",
          {
            text: "Microsoft's group licensing PowerShell examples",
            href: "https://learn.microsoft.com/en-us/entra/identity/users/licensing-powershell-graph-examples",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "remove-in-admin-center",
        text: "Remove direct licenses in the Microsoft 365 admin center",
      },
      {
        type: "p",
        text: [
          "Open ",
          { strong: "Users > Active users" },
          " with an appropriate role, such as License Administrator or User Administrator.",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "One user." },
            " Select the user's row and open ",
            { strong: "Licenses and Apps" },
            ". Expand ",
            { strong: "Licenses" },
            ", clear the products you intend to remove, and select ",
            { strong: "Save changes" },
            ".",
          ],
          [
            { strong: "Multiple users." },
            " Select the circles beside the reviewed accounts and choose ",
            { strong: "Manage product licenses" },
            ". Use ",
            { strong: "Unassign all" },
            " only when you intend to remove every license from those accounts. Follow the group steps below for inherited assignments. Select ",
            { strong: "Save changes" },
            ", then ",
            { strong: "Done" },
            ".",
          ],
        ],
      },
      {
        type: "h2",
        id: "remove-with-powershell",
        text: "Remove a direct license with PowerShell",
      },
      {
        type: "p",
        text: [
          "Connect to your tenant using the permissions in ",
          {
            text: "Microsoft's PowerShell license removal guide",
            href: "https://learn.microsoft.com/en-us/microsoft-365/enterprise/remove-licenses-from-user-accounts-with-microsoft-365-powershell?view=o365-worldwide",
          },
          ". Use the reviewed account and the SKU ID of the license you intend to remove.",
        ],
      },
      {
        type: "note",
        title: "Destructive command. Test on one account first.",
        text: [
          "Replace the placeholders with a single approved account and its target SKU ID, then verify the result before repeating the operation.",
        ],
      },
      {
        type: "p",
        text: [
          'Set-MgUserLicense -UserId "<Account>" -RemoveLicenses @("<AccountSkuId1>") -AddLicenses @{}',
        ],
      },
      {
        type: "h2",
        id: "remove-group-based-license",
        text: "Remove a group-based license at its source",
      },
      {
        type: "list",
        items: [
          [
            { strong: "Remove the assignment for one user." },
            " Remove the user from the group that grants the license. Review the group's other assigned products and any access the user still needs before changing membership.",
          ],
          [
            { strong: "Remove the assignment for the whole group." },
            " Go to ",
            { strong: "Billing > Licenses" },
            ", select the product, and find the group's row. Open the three-dot menu and select ",
            { strong: "Unassign" },
            ". Use this option only if the group should stop granting that product to its members. See ",
            {
              text: "Microsoft's group license instructions",
              href: "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-group-licenses?view=o365-worldwide",
            },
            ".",
          ],
        ],
      },
      {
        type: "h2",
        id: "reduce-subscription-quantity",
        text: "Reduce the subscription quantity if you no longer need the seat",
      },
      {
        type: "p",
        text: [
          "Unassigning a license frees it for reassignment. To stop paying for a seat you no longer need, reduce the purchased quantity. In ",
          { strong: "Billing > Your products" },
          ", select the subscription and choose ",
          { strong: "Remove licenses" },
          ". Specify when the change can take effect and the new total quantity, then select ",
          { strong: "Save" },
          ".",
        ],
      },
      {
        type: "h2",
        id: "verify-removal",
        text: "Confirm the license is gone",
      },
      {
        type: "p",
        text: [
          "Reopen the user's ",
          { strong: "Licenses and Apps" },
          " pane and confirm the target product is gone. If it still appears, check for another group assignment or a remaining direct assignment. If you reduced the subscription quantity, verify the new total in ",
          { strong: "Billing > Your products" },
          " when the change takes effect.",
        ],
      },
      {
        type: "h2",
        id: "track-remediation",
        text: "Track and verify the change in LicenseMeter",
      },
      {
        type: "p",
        text: [
          "The ",
          { strong: "Disabled account still licensed" },
          " finding flags a disabled directory account with a paid assignment. An Admin can set the remediation status, assignee, due date, external ticket URL, and notes. The status options are Not planned, Planned, Remediation requested, and In progress.",
        ],
      },
      {
        type: "p",
        text: [
          "LicenseMeter connectors are read-only and do not remove licenses. After you make the change in Microsoft 365, run another sync. LicenseMeter resolves the finding when the condition is gone. See ",
          {
            text: "the detection rules",
            href: "https://docs.licensemeter.com/findings/rules/",
          },
          " for what the finding checks.",
        ],
      },
    ],
  },
  {
    slug: "shared-mailbox-license",
    title: "Does a Microsoft 365 shared mailbox need a license?",
    description:
      "Check when a Microsoft 365 shared mailbox needs a license and what to verify in Exchange before removing one or converting a user mailbox.",
    excerpt:
      "A Microsoft 365 shared mailbox can store up to 50 GB without a license. It needs a license for storage over 50 GB, archive expansion, Litigation Hold or In-Place Hold, and some advanced features might also require one.",
    publishedOn: "2026-11-24",
    author: {
      name: "Ugur Koc",
      role: "Maintainer, Microsoft MVP for Intune",
      url: "https://ugurkoc.de",
    },
    tag: "Guide",
    cta: {
      title: "Review disabled accounts that still hold licenses",
      body: "Use the finding to identify accounts for review, then check in Exchange whether the mailbox still needs its license.",
      primary: {
        label: "Review the finding",
        href: "/waste/disabled-accounts-still-licensed",
      },
      secondary: {
        label: "Read the detection rules",
        href: "https://docs.licensemeter.com/findings/rules/",
      },
    },
    body: [
      {
        type: "h2",
        id: "when-a-license-is-required",
        text: "When does a shared mailbox need a license?",
      },
      {
        type: "list",
        items: [
          [
            { strong: "More than 50 GB." },
            " Exchange Online Plan 2 raises the mailbox limit to 100 GB.",
          ],
          [
            { strong: "Archive growth or auto-expanding archiving." },
            " Use Exchange Online Plan 2 or Exchange Online Plan 1 with the Exchange Online Archiving add-on.",
          ],
          [
            { strong: "Litigation Hold or In-Place Hold." },
            " Use Exchange Online Plan 2 or Exchange Online Plan 1 with the Exchange Online Archiving add-on.",
          ],
          [
            { strong: "Advanced features." },
            " Microsoft Defender for Office 365, Microsoft Purview eDiscovery (Premium), and retention policies might require licenses.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          "See ",
          {
            text: "Microsoft’s shared mailbox licensing guidance",
            href: "https://learn.microsoft.com/en-us/microsoft-365/admin/email/about-shared-mailboxes?view=o365-worldwide#licensing-and-mailbox-storage-limits",
          },
          " for details.",
        ],
      },
      {
        type: "h2",
        id: "before-removing-a-license",
        text: "What to check before removing a license",
      },
      {
        type: "list",
        items: [
          [
            { strong: "Mailbox size." },
            " Check the size in Exchange and confirm the mailbox is below 50 GB. At the storage limit, the mailbox stops sending. It eventually stops receiving too, and senders get a non-delivery report.",
          ],
          [
            { strong: "Holds and archive." },
            " Check for Litigation Hold, In-Place Hold, and archive settings in Exchange. Confirm whether archive expansion or any retention or other advanced feature still requires the license.",
          ],
          [
            { strong: "Account sign-in." },
            " Verify that sign-in is blocked for the shared mailbox account and keep it blocked.",
          ],
          [
            { strong: "The associated account." },
            " Keep the user account when you remove its license. The shared mailbox depends on that account as its anchor.",
          ],
        ],
      },
      {
        type: "h2",
        id: "convert-a-user-mailbox",
        text: "Convert a user mailbox before removing its license",
      },
      {
        type: "p",
        text: [
          "The user mailbox must have a license assigned when you convert it to a shared mailbox. If you already removed the license, reassign it before converting. After conversion, you can remove the license if the mailbox is below 50 GB and none of the licensing requirements above apply. Follow ",
          {
            text: "Microsoft’s mailbox conversion steps",
            href: "https://learn.microsoft.com/en-us/microsoft-365/admin/email/convert-user-mailbox-to-shared-mailbox?view=o365-worldwide",
          },
          " to make the change.",
        ],
      },
      {
        type: "h2",
        id: "review-licensed-accounts",
        text: "Review licensed accounts in LicenseMeter",
      },
      {
        type: "p",
        text: [
          "LicenseMeter’s ",
          { strong: "Disabled account still licensed" },
          " finding lists disabled directory accounts that retain a paid license assignment. A shared mailbox account with blocked sign-in can appear there if it still has a paid license.",
        ],
      },
      {
        type: "p",
        text: [
          "The finding is based on directory and license data. LicenseMeter does not read mailbox content, so check mailbox size, holds, and retention requirements in Exchange before removing a license.",
        ],
      },
      {
        type: "h2",
        id: "member-licenses",
        text: "Do people who use the shared mailbox need their own licenses?",
      },
      {
        type: "p",
        text: [
          "Yes. Each member needs their own licensed Exchange Online mailbox. Member access does not require an additional license for the shared mailbox itself.",
        ],
      },
    ],
  },
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
