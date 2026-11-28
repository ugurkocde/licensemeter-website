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
    slug: "microsoft-graph-licenseassignment-read-all",
    title: 'What the "Read all license assignments" Graph permission allows',
    description:
      "LicenseAssignment.Read.All lets an app read license assignments for users and groups. See its limits, a read-only license review set, and how to check a grant in Entra.",
    excerpt:
      "LicenseAssignment.Read.All is a Microsoft Graph permission that allows an app to read license assignments for users and groups. As an application permission it works without a signed-in user and needs admin consent, and as a delegated permission it acts on behalf of the signed-in user.",
    publishedOn: "2026-11-28",
    author: {
      name: "Ugur Koc",
      role: "Maintainer, Microsoft MVP for Intune",
      url: "https://ugurkoc.de",
    },
    tag: "Guide",
    cta: {
      title: "Compare LicenseMeter's grant with the docs",
      body: "Read the connector's permission table and consent lines, then match them against the Admin consent tab in your tenant.",
      primary: {
        label: "Read the Microsoft 365 connector permissions",
        href: "https://docs.licensemeter.com/connectors/microsoft/#data-used",
      },
      secondary: {
        label: "Review LicenseMeter security",
        href: "/security",
      },
    },
    body: [
      {
        type: "h2",
        id: "what-it-allows",
        text: "What LicenseAssignment.Read.All allows",
      },
      {
        type: "p",
        text: [
          'Microsoft\'s permissions reference lists LicenseAssignment.Read.All in two forms, both with the display text "Read all license assignments." The application permission "Allows an app to read license assignments for users and groups, without a signed-in user" and requires admin consent. The delegated permission allows the same read on behalf of the signed-in user, and Microsoft lists it as not requiring admin consent. See ',
          {
            text: "Microsoft's Graph permissions reference",
            href: "https://learn.microsoft.com/en-us/graph/permissions-reference",
          },
          ".",
        ],
      },
      {
        type: "p",
        text: [
          "For ",
          { strong: "GET /subscribedSkus" },
          ", Microsoft marks LicenseAssignment.Read.All as the least privileged permission for both delegated and application access. Directory.Read.All, Directory.ReadWrite.All, Organization.Read.All and Organization.ReadWrite.All are listed as higher privileged alternatives. Microsoft's advice is to use a higher privileged permission only if your app requires it. See ",
          {
            text: "the List subscribedSkus permissions table",
            href: "https://learn.microsoft.com/en-us/graph/api/subscribedsku-list?view=graph-rest-1.0",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "subscribedskus-fields",
        text: "What the subscribedSkus counts show",
      },
      {
        type: "p",
        text: [
          "Each SKU in the response carries these fields, as defined in ",
          {
            text: "the subscribedSku resource reference",
            href: "https://learn.microsoft.com/en-us/graph/api/resources/subscribedsku?view=graph-rest-1.0",
          },
          ":",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "skuPartNumber:" },
            " the SKU part number, for example AAD_PREMIUM or RMSBASIC.",
          ],
          [
            { strong: "consumedUnits:" },
            " the number of licenses that have been assigned.",
          ],
          [
            { strong: "prepaidUnits:" },
            " information about the number and status of prepaid licenses.",
          ],
          [
            { strong: "appliesTo:" },
            " only SKUs with target class User are assignable.",
          ],
          [
            { strong: "capabilityStatus:" },
            " Enabled means prepaidUnits has at least one enabled unit. LockedOut means the customer canceled the subscription.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          "Inside prepaidUnits, ",
          {
            text: "the licenseUnitsDetail resource",
            href: "https://learn.microsoft.com/en-us/graph/api/resources/licenseunitsdetail?view=graph-rest-1.0",
          },
          " splits the units by status:",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "enabled:" },
            " units that are enabled for the active subscription of the SKU.",
          ],
          [
            { strong: "warning:" },
            " units in warning status. When the subscription has expired, there is a grace period to renew before it is canceled and moved to a suspended state.",
          ],
          [
            { strong: "suspended:" },
            " units suspended because the subscription was canceled. They can't be assigned but can still be reactivated before they're deleted.",
          ],
          [
            { strong: "lockedOut:" },
            " units locked out because the subscription was canceled.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          "Reading consumedUnits next to prepaidUnits puts assigned licenses beside the number and status of prepaid licenses for each SKU. The method supports only the $select query parameter and doesn't support $filter, so narrow the fields with $select and filter the results on your side.",
        ],
      },
      {
        type: "h2",
        id: "what-it-does-not-cover",
        text: "What LicenseAssignment.Read.All does not cover",
      },
      {
        type: "list",
        items: [
          [
            { strong: "Changing assignments." },
            ' Managing license assignments is a separate permission, LicenseAssignment.ReadWrite.All, shown as "Manage all license assignments". Its application form allows an app to manage license assignments for users and groups without a signed-in user. If you see this line in a dialog for a tool you expected to be read-only, stop and ask why.',
          ],
          [
            { strong: "Per-user licenseDetails without a signed-in user." },
            " For the List licenseDetails API, Microsoft lists delegated LicenseAssignment.Read.All as least privileged and application permissions as not supported. See ",
            {
              text: "the List licenseDetails permissions table",
              href: "https://learn.microsoft.com/en-us/graph/api/user-list-licensedetails?view=graph-rest-1.0",
            },
            ".",
          ],
          [
            { strong: "Listing users." },
            " LicenseAssignment.Read.All is not among the application permissions Microsoft lists for List users. The least privileged one there is User.Read.All. See ",
            {
              text: "the List users permissions table",
              href: "https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0",
            },
            ".",
          ],
          [
            { strong: "Reading or changing accountEnabled." },
            " Microsoft names User.EnableDisableAccount.All plus User.Read.All as the least privileged combination to read and write the accountEnabled property.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          "Directory.Read.All reads data in your organization's directory, such as users, groups and apps. Organization.Read.All reads the organization and related resources, such as subscribed SKUs and tenant branding information. For reading SKUs, Microsoft lists both as higher privileged than LicenseAssignment.Read.All.",
        ],
      },
      {
        type: "p",
        text: [
          "If your review ends with removing licenses from accounts that are already disabled, follow the ",
          {
            text: "license removal guide for disabled Microsoft 365 users",
            href: "/blog/remove-license-from-disabled-user",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "read-only-permission-set",
        text: "A read-only permission set for a license review",
      },
      {
        type: "p",
        text: [
          "LicenseMeter's live connector pairs LicenseAssignment.Read.All with four other read permissions. It reads directory users and assigned licenses, purchased and assigned SKU counts, available sign-in activity, usage and Copilot reports, and report-privacy settings. Each line shows the text Microsoft displays in the consent dialog and what the connector reads with it.",
        ],
      },
      {
        type: "list",
        items: [
          [
            { strong: "User.Read.All" },
            ' ("Read all users\' full profiles"): directory users, enabled state and assigned licenses.',
          ],
          [
            { strong: "AuditLog.Read.All" },
            ' ("Read all audit log data"): sign-in timestamps, subject to the tenant\'s licensing and available signal.',
          ],
          [
            { strong: "Reports.Read.All" },
            ' ("Read all usage reports"): usage and Copilot activity reports.',
          ],
          [
            { strong: "LicenseAssignment.Read.All" },
            ' ("Read all license assignments."): purchased versus assigned seat counts.',
          ],
          [
            { strong: "ReportSettings.Read.All" },
            ' ("Read all admin report settings"): whether reports conceal user identities.',
          ],
        ],
      },
      {
        type: "p",
        text: [
          "Microsoft lists all five application permissions as requiring admin consent. Read access is tenant-wide for the approved data, not limited to the person who signs in. The connector does not request mailbox, calendar, Teams message, OneDrive file or SharePoint document content. See ",
          {
            text: "the connector's data and permission table",
            href: "https://docs.licensemeter.com/connectors/microsoft/#data-used",
          },
          ".",
        ],
      },
      {
        type: "note",
        title: "The sixth line in the dialog",
        text: [
          "Microsoft adds \"Sign in and read user profile\" (User.Read, delegated) to the consent dialog itself. LicenseMeter's connector registration doesn't declare it, and the connector authenticates as an application without a signed-in user, so it never reads data on behalf of the approving administrator.",
        ],
      },
      {
        type: "h2",
        id: "check-grant-in-entra",
        text: "Check what an app was granted in Entra",
      },
      {
        type: "steps",
        items: [
          {
            title: "Open the enterprise application",
            body: [
              "Sign in to the Microsoft Entra admin center as at least a Cloud Application Administrator. Browse to ",
              { strong: "Entra ID > Enterprise apps > All applications" },
              " and select the application you want to check.",
            ],
          },
          {
            title: "Read the Admin consent tab",
            body: [
              "Select ",
              { strong: "Permissions" },
              ". The ",
              { strong: "Admin consent" },
              " tab shows permissions that apply to your entire organization. The ",
              { strong: "User consent" },
              " tab shows permissions granted to a specific user or group.",
            ],
          },
          {
            title: "Open the details of each permission",
            body: [
              "Select a permission from the list to open the ",
              { strong: "Permission Details" },
              " pane. Compare each entry with the permissions the vendor or app owner documented.",
            ],
          },
          {
            title: "Revoke a permission you don't expect",
            body: [
              "Before you revoke, confirm with the app's owner which feature relies on the permission. In the Admin consent tab, choose the permission, select the ",
              { strong: "..." },
              " control for it, then select ",
              { strong: "Revoke permission" },
              ". Revoking the current grant doesn't stop users from consenting again to the permissions the application requests.",
            ],
          },
        ],
      },
      {
        type: "p",
        text: [
          "You can't revoke permissions in the User consent tab using the portal. Microsoft points to Microsoft Graph API calls or PowerShell cmdlets for those.",
        ],
      },
      {
        type: "p",
        text: [
          "See ",
          {
            text: "Microsoft's guide to reviewing permissions granted to enterprise applications",
            href: "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-application-permissions",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "check-licensemeter-grant",
        text: "Check LicenseMeter's connector grant",
      },
      {
        type: "p",
        text: [
          "Accepting consent creates an enterprise application named ",
          { strong: "LicenseMeter Connector" },
          " in your tenant. Its publisher is Ugurlabs UG (haftungsbeschränkt) as a Microsoft verified publisher, and its application ID is ",
          { strong: "1a1a346a-05d5-4f54-87a5-5b5e63f9c610" },
          ". In Enterprise applications, clear the application type filter or search by name or application ID, then open Permissions. The Admin consent tab lists the five Microsoft Graph application permissions. No client secret or certificate is created in your tenant.",
        ],
      },
      {
        type: "p",
        text: [
          "A publisher shown as unverified, a different application name, or any permission containing write, manage or mail, file and chat content is not the LicenseMeter connector. Select Cancel and contact Support. See ",
          {
            text: "how to review Microsoft's approval screen and find the grant afterwards",
            href: "https://docs.licensemeter.com/connectors/microsoft-managed/",
          },
          ".",
        ],
      },
      {
        type: "p",
        text: [
          "Consent grants no connector write permission. To end the connector's access, disconnect it and revoke that application's permissions in Entra, or delete the enterprise application. Previously collected data remains until separately deleted. The ",
          { text: "security overview", href: "/security" },
          " and the ",
          { text: "trust center", href: "/trust-center" },
          " describe how the rest of the service handles that data, and the ",
          { text: "FAQ", href: "/faq" },
          " answers whether LicenseMeter can change anything in your tenant.",
        ],
      },
      {
        type: "h2",
        id: "faq",
        text: "Frequently asked questions",
      },
      {
        type: "list",
        items: [
          [
            {
              strong:
                "Can LicenseAssignment.Read.All assign or remove licenses?",
            },
            ' No. Microsoft describes it as a read permission. Managing assignments is LicenseAssignment.ReadWrite.All, shown as "Manage all license assignments".',
          ],
          [
            { strong: "Does the delegated permission need admin consent?" },
            " Microsoft lists admin consent as not required for the delegated permission and required for the application permission.",
          ],
          [
            {
              strong:
                "Do I need Directory.Read.All or Organization.Read.All to read subscribedSkus?",
            },
            " No. Microsoft lists LicenseAssignment.Read.All as the least privileged permission for that API and the other two as higher privileged.",
          ],
          [
            {
              strong:
                "Can an app read a user's licenseDetails with application permissions?",
            },
            " Microsoft lists application permissions as not supported for List licenseDetails. The least privileged delegated permission there is LicenseAssignment.Read.All.",
          ],
          [
            { strong: "What does the User consent tab show?" },
            " Permissions granted to a specific user or group, as opposed to the organization-wide grants on the Admin consent tab. You can't revoke User consent permissions in the portal.",
          ],
        ],
      },
    ],
  },
  {
    slug: "intune-software-metering",
    title: "How to do software metering in Microsoft Intune",
    description:
      "Compare Intune inventory with SCCM software metering. Track Windows app starts with Event ID 4688 and Intune Remediations before renewing desktop licenses.",
    excerpt:
      "Microsoft Intune has no built-in software metering equivalent to Configuration Manager (SCCM). Discovered apps and App inventory show installed software only.",
    publishedOn: "2026-11-27",
    author: {
      name: "Ugur Koc",
      role: "Maintainer, Microsoft MVP for Intune",
      url: "https://ugurkoc.de",
    },
    tag: "Guide",
    cta: {
      title: "Preview Software Metering before rollout",
      body: "See a report with fictional device data or follow the setup guide for your Intune pilot.",
      primary: {
        label: "Explore the sample metering report",
        href: "https://docs.licensemeter.com/connectors/windows-metering/#see-it-in-the-sample-workspace-first",
      },
      secondary: {
        label: "Read the metering setup guide",
        href: "https://docs.licensemeter.com/connectors/windows-metering/",
      },
    },
    body: [
      {
        type: "h2",
        id: "intune-versus-sccm",
        text: "Intune app inventory and SCCM software metering",
      },
      {
        type: "p",
        text: [
          "To decide whether to renew licenses for Visio, Project, Acrobat Pro or a CAD tool, use Windows process auditing with Intune Remediations to collect app start evidence on the devices where you deployed it. See ",
          {
            text: "Microsoft's guide to Discovered apps and App inventory",
            href: "https://learn.microsoft.com/en-us/intune/app-management/discovered-apps",
          },
          ".",
        ],
      },
      {
        type: "p",
        text: [
          "Configuration Manager meters Windows desktop apps with .exe files. Enable software metering in client settings and define rules by file name or original file name, with version and language criteria. Viewing reports requires a reporting services point. Clients submit data on a seven-day default collection schedule. Metering records and summaries stay in the Configuration Manager database until configurable site maintenance tasks delete them. See ",
          {
            text: "Microsoft's Configuration Manager software metering reference",
            href: "https://learn.microsoft.com/en-us/intune/configmgr/apps/deploy-use/monitor-app-usage-with-software-metering",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "check-remediations-requirements",
        text: "Check Intune Remediations requirements",
      },
      {
        type: "p",
        text: [
          "Start with a small group of Microsoft Entra joined or hybrid joined Windows devices. They must run Windows Enterprise, Pro or Education and be enrolled in Intune MDM, or be co-managed Windows devices. Their users need Windows Enterprise E3 or E5, Windows Education A3 or A5, or Windows Virtual Desktop Access (VDA) per user. An Intune Service Administrator must confirm licensing before the first use. See ",
          {
            text: "Microsoft's device and licensing requirements for Remediations",
            href: "https://learn.microsoft.com/en-us/intune/device-management/tools/deploy-remediations#prerequisites",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "collect-app-starts",
        text: "Collect Windows app starts with Event ID 4688",
      },
      {
        type: "steps",
        items: [
          {
            title: "Enable Audit Process Creation",
            body: [
              "In your approved Intune settings catalog or Group Policy, go to Advanced Audit Policy Configuration > Detailed Tracking and enable ",
              { strong: "Audit Process Creation (Success)" },
              ". Windows writes Event ID 4688 to the Security log when a process starts. Leave command-line auditing out of this setup because the event already identifies the new executable. On a pilot device, confirm Success is enabled with ",
              {
                strong:
                  'auditpol /get /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}"',
              },
              ". Start a pilot app and confirm its executable appears in the event. See ",
              {
                text: "Microsoft's Audit Process Creation policy",
                href: "https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/audit-process-creation",
              },
              " and ",
              {
                text: "the Event ID 4688 field reference",
                href: "https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4688",
              },
              ".",
            ],
          },
          {
            title: "Size the Security log for the pilot",
            body: [
              "The default maximum is 20 MB. If old events are overwritten between runs, try 100 to 200 MB as a starting point. Set the maximum through Administrative Templates > Windows Components > Event Log Service > Security > Specify the maximum log file size (KB), or the equivalent Group Policy setting. Restart the device, then confirm the applied size with ",
              { strong: "wevtutil gl Security" },
              ".",
            ],
          },
          {
            title: "Assign a detection-only script",
            body: [
              "In the Intune admin center, open Devices > Scripts and remediations. Upload a UTF-8 detection script that reads Event ID 4688 locally and matches the executable names you want to meter. Return a compact device-level summary within Intune's 2,048-character output limit and exit with code 0 after a successful run. Keep personal data, including user names and raw event contents, out of collection and output. Set ",
              { strong: "Run this script using the logged-on credentials" },
              " to No so it runs as SYSTEM, and set ",
              { strong: "Run script in 64-bit PowerShell" },
              " to Yes. Assign it to the pilot group hourly.",
            ],
          },
          {
            title: "Check collection and coverage before expanding",
            body: [
              "Verify that a known pilot app start appears in the script output. Keep a local checkpoint so you can carry results across runs and identify gaps when events roll over before the script can read them. Intune can run the script hourly, but it sends recurring results when they change and sends an unchanged result every seven days. Check reporting and coverage before widening the assignment. See ",
              {
                text: "Microsoft's Remediations deployment and reporting guidance",
                href: "https://learn.microsoft.com/en-us/intune/device-management/tools/deploy-remediations",
              },
              ".",
            ],
          },
        ],
      },
      {
        type: "h2",
        id: "before-reclaiming-licenses",
        text: "What to check before reclaiming a desktop app license",
      },
      {
        type: "list",
        items: [
          [
            { strong: "Wait for a full observation window." },
            " Choose 30, 60 or 90 days and confirm uninterrupted coverage on the device. Treat missing results, stale checkpoints and lost events as unknown.",
          ],
          [
            { strong: "Check the work the app supports." },
            " Ask the app owner about seasonal work, infrequent tasks and shared devices where a quiet period can still be normal.",
          ],
          [
            { strong: "Check which executable started." },
            " Look for background launches and other programs that share the same executable name before you interpret a start as evidence of demand.",
          ],
          [
            { strong: "Confirm the assignment and owner." },
            " Verify who or what holds the license and confirm continued access needs with the owner before uninstalling the app or reclaiming the seat.",
          ],
        ],
      },
      {
        type: "p",
        text: [
          "For a separate review of cloud account activity, see ",
          {
            text: "how to find inactive users in Microsoft 365",
            href: "/blog/find-inactive-users-microsoft-365",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "licensemeter-software-metering",
        text: "How LicenseMeter Software Metering collects app starts",
      },
      {
        type: "p",
        text: [
          "LicenseMeter generates a workspace-specific detection script and combines its start results with Intune install status. It covers Intune-deployed Win32, Microsoft Store, WinGet and line-of-business apps, plus Microsoft 365 Apps with Visio and Project listed separately. The report shows which devices have the app installed and which started it during the observation window. See ",
          {
            text: "the Software Metering report overview",
            href: "/blog/software-metering",
          },
          ".",
        ],
      },
      {
        type: "p",
        text: [
          "Metering uses a separate Microsoft Entra app with its own consent. LicenseMeter reads results live from Intune and caches them in server memory for at most five minutes, without storing them. The collector reports no user names, command lines or file paths. Software Metering is included in ",
          { text: "the Pro and MSP plans", href: "/pricing#software-metering" },
          ".",
        ],
      },
      {
        type: "h2",
        id: "faq",
        text: "Frequently asked questions",
      },
      {
        type: "list",
        items: [
          [
            { strong: "What does Discovered apps show on personal devices?" },
            " It collects managed apps on personal devices. On corporate devices, it inventories both managed and unmanaged apps.",
          ],
          [
            { strong: "Can I measure app starts from before rollout?" },
            " Start your observation window with the first collector run. A short Security log cannot reconstruct months of activity.",
          ],
          [
            { strong: "Does a start tell me how long someone used the app?" },
            " A start records a process launch. Measuring foreground time or productive work would require different evidence.",
          ],
          [
            { strong: "Can I preview the report before granting consent?" },
            " Yes. Choose Open the sample tenant, then Software Metering in the sidebar to explore fictional results without granting Microsoft permissions.",
          ],
        ],
      },
    ],
  },
  {
    slug: "find-inactive-users-microsoft-365",
    title: "How to find inactive users in Microsoft 365",
    description:
      "Use the Microsoft 365 Active users report, export workload activity to CSV, and compare it with last interactive sign-in times in Microsoft Entra.",
    excerpt:
      "Microsoft Entra ID has no built-in report for inactive user accounts. To find candidates for review, compare the last active dates for each workload in the Microsoft 365 apps Active users report with each user's last interactive sign-in time in Microsoft Entra.",
    publishedOn: "2026-11-26",
    author: {
      name: "Ugur Koc",
      role: "Maintainer, Microsoft MVP for Intune",
      url: "https://ugurkoc.de",
    },
    tag: "Guide",
    cta: {
      title: "Review inactive licensed users",
      body: "See how LicenseMeter flags inactive seats and what to check before removing a license.",
      primary: {
        label: "Review the inactive seat finding",
        href: "/waste/inactive-licensed-users",
      },
      secondary: {
        label: "Review licensed accounts with no usable activity",
        href: "/waste/licensed-but-never-active",
      },
    },
    body: [
      {
        type: "h2",
        id: "choose-an-inactivity-threshold",
        text: "Choose a cutoff date",
      },
      {
        type: "p",
        text: [
          "Start with your organization's inactivity policy. Microsoft suggests 90 to 180 days as a reasonable window for many organizations. Allow for planned leave and other legitimate absences, then use the same cutoff date for workload activity and sign-in review. See ",
          {
            text: "Microsoft's guidance on inactive accounts",
            href: "https://learn.microsoft.com/en-us/entra/identity/monitoring-health/howto-manage-inactive-user-accounts",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "export-the-active-users-report",
        text: "Open and export the Active users report",
      },
      {
        type: "steps",
        items: [
          {
            title: "Find the report",
            body: [
              "In the Microsoft 365 admin center, open ",
              { strong: "Reports > Usage" },
              ". Use ",
              { strong: "Show all" },
              " if Reports is hidden. Under Reports on the Usage page, select ",
              { strong: "Microsoft 365 apps > Active users" },
              ".",
            ],
          },
          {
            title: "Read the last active dates",
            body: [
              "Use ",
              { strong: "Choose columns" },
              " to show the last active dates for Exchange, OneDrive, SharePoint, Viva Engage, and Microsoft Teams. Each date reflects the most recent intentional activity in that workload, regardless of the trend period you select. The trend options are 7, 30, 90, or 180 days. The data usually covers activity up to the last 24 to 48 hours.",
            ],
          },
          {
            title: "Export to CSV",
            body: [
              "Select ",
              { strong: "Export" },
              " to download usage data for all users. Sort and filter the workload dates in your spreadsheet.",
            ],
          },
        ],
      },
      {
        type: "p",
        text: [
          "See ",
          {
            text: "Microsoft's Active users report column definitions",
            href: "https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/active-users-ww?view=o365-worldwide",
          },
          " and ",
          {
            text: "the usage reports overview",
            href: "https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/activity-reports?view=o365-worldwide",
          },
          " for how Microsoft defines the last activity date.",
        ],
      },
      {
        type: "h2",
        id: "concealed-user-names",
        text: "Check report privacy if names are concealed",
      },
      {
        type: "p",
        text: [
          "Microsoft has hidden user identities in usage reports by default since September 1, 2021. Get internal approval before showing names. The setting applies across the tenant, and showing identifiable user information is a logged event in the Microsoft Purview audit log. See ",
          {
            text: "Microsoft's explanation of anonymous user names",
            href: "https://learn.microsoft.com/en-us/troubleshoot/microsoft-365/admin/miscellaneous/reports-show-anonymous-user-name",
          },
          ".",
        ],
      },
      {
        type: "p",
        text: [
          "After approval, a Global Administrator can open ",
          { strong: "Settings > Org Settings > Services > Reports" },
          " in the Microsoft 365 admin center, clear ",
          { strong: "Conceal user, group, and site names in all reports" },
          ", and select ",
          { strong: "Save" },
          ". Allow a few minutes for the change to take effect before exporting again. See ",
          {
            text: "how report privacy affects LicenseMeter's detection coverage",
            href: "https://docs.licensemeter.com/troubleshooting/report-privacy/",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "check-last-interactive-sign-in",
        text: "Check the last interactive sign-in in Entra",
      },
      {
        type: "steps",
        items: [
          {
            title: "Add the sign-in column",
            body: [
              "In the Microsoft Entra admin center, sign in as at least a Reports Reader and open ",
              { strong: "Entra ID > Users" },
              ". Choose ",
              { strong: "Manage view > Edit columns" },
              ", select ",
              { strong: "+ Add column" },
              ", add ",
              { strong: "Last interactive sign-in time" },
              ", and save.",
            ],
          },
          {
            title: "Filter by the cutoff",
            body: [
              "Select ",
              { strong: "Add filter" },
              ", set a time frame with the filter options, choose ",
              { strong: "<=" },
              " as the operator, and select your cutoff date.",
            ],
          },
        ],
      },
      {
        type: "p",
        text: [
          "Microsoft notes that the last sign-in date and time in the Entra admin center can take up to 24 hours to update, so treat dates close to your cutoff with care. Users with no value in the column need a separate look before you draw any conclusion.",
        ],
      },
      {
        type: "h2",
        id: "compare-dates",
        text: "Compare the dates for each user",
      },
      {
        type: "p",
        text: [
          "Match the users in Entra to their rows in the usage export. Take the most recent date across the available workload and sign-in dates, then flag users whose newest recorded date is on or before your cutoff. The two sources can disagree because they track different events. If a workload shows recent activity, keep that user off the inactivity list even if their last interactive sign-in is old.",
        ],
      },
      {
        type: "p",
        text: [
          "Look up users with blank dates separately in the unfiltered list. Where both sources lack a usable date, check the age of the account and the available report coverage before treating it as inactive.",
        ],
      },
      {
        type: "h2",
        id: "review-before-acting",
        text: "Review each account before changing access",
      },
      {
        type: "p",
        text: [
          "Microsoft suggests starting with three questions after you identify inactive users.",
        ],
      },
      {
        type: "list",
        items: [
          ["Does the person still work for the organization?"],
          [
            "Does the person still need access to the resources they have access to?",
          ],
          ["Does the organization still need this account for another reason?"],
        ],
      },
      {
        type: "p",
        text: [
          "If an account is already disabled and you've approved removing its license, follow the ",
          {
            text: "license removal guide for disabled Microsoft 365 users",
            href: "/blog/remove-license-from-disabled-user",
          },
          ".",
        ],
      },
      {
        type: "h2",
        id: "review-inactive-seats-in-licensemeter",
        text: "Review inactive seats in LicenseMeter",
      },
      {
        type: "p",
        text: [
          "LicenseMeter's read-only Microsoft 365 connector reads available sign-in activity, usage reports, and the tenant's report-privacy setting. The ",
          { strong: "Inactive seat" },
          " finding flags activity outside your workspace's configured inactivity window. Set the threshold to match your review policy and treat the results as candidates for review.",
        ],
      },
      {
        type: "p",
        text: [
          "Open ",
          { strong: "Settings > Detection capabilities" },
          " to see which signals are available, including identifiable usage reports and sign-in activity. License removal and tenant changes are separate administrative actions.",
        ],
      },
    ],
  },
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
