import type { Metadata } from "next";
import Link from "next/link";

import { env, siteUrl } from "~/env";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "~/lib/support";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How LicenseMeter accesses Microsoft 365 tenants: read-only application permissions, EU-hosted data storage, deletion on disconnect, named subprocessors.",
};

const NEVER_ACCESSED = [
  "Mailbox content, attachments or calendars",
  "Files in OneDrive, SharePoint or Teams",
  "Teams messages or meeting content",
  "Passwords, credentials or security tokens of your users",
  "Any write access: LicenseMeter cannot change anything in your tenant",
];

const STORED_DATA = [
  "License SKUs with purchased and assigned seat counts",
  "Directory users: display name, UPN, enabled state, user type, creation date, assigned licenses",
  "Last sign-in timestamps (when your tenant has Entra ID P1) and per-workload last-activity dates",
  "The prices you enter in the price book and the findings derived from the above",
  "If you connect Adobe, Zoom, Atlassian, Salesforce, OpenAI or Anthropic (all optional): seat or console-member emails, status, product assignments and last-login dates where the provider exposes them, plus daily API cost totals for OpenAI and Anthropic; the credentials themselves are stored encrypted (AES-256-GCM) and used read-only",
  "If you import ChatGPT or Claude member lists (optional CSV paste): the member emails, names, seat types and last-active dates contained in the data you paste",
  "A per-workspace activity log of exports and administrative actions, deleted with the workspace",
];

const BASE = siteUrl();

const CONNECTOR_APP_ID =
  env.CONNECTOR_CLIENT_ID ??
  "<LicenseMeter connector application ID, shown on the consent screen>";

/**
 * Microsoft Graph PowerShell for the delegate-consent section. The permission
 * names are rendered from CONNECTOR_SCOPES, so the script can never drift
 * from the consent screen. Cmdlet shapes follow Microsoft Learn
 * (manage-app-consent-policies, custom-consent-permissions).
 */
const DELEGATE_CONSENT_SCRIPT = `# One-time setup - requires Privileged Role Administrator or Global Administrator.
Connect-MgGraph -Scopes "Policy.ReadWrite.PermissionGrant","RoleManagement.ReadWrite.Directory"

# Microsoft Graph service principal; app-role IDs looked up by permission
# name, so the grant covers exactly what the consent screen shows.
$graphSp = Get-MgServicePrincipal -Filter "appId eq '00000003-0000-0000-c000-000000000000'"
$permissionNames = @(
${CONNECTOR_SCOPES.map((s) => `  "${s.scope}"`).join(",\n")}
)
$permissionIds = $graphSp.AppRoles |
  Where-Object { $_.Value -in $permissionNames } |
  ForEach-Object { $_.Id }

# Abort rather than create a policy with an empty permission list - an empty
# list would mean "all permissions of this resource", far broader than intended.
if ($permissionIds.Count -ne $permissionNames.Count) {
  throw "Resolved $($permissionIds.Count) of $($permissionNames.Count) permission IDs - aborting. Update the Microsoft.Graph module and retry."
}

# App consent policy: exactly these application permissions, only for the
# LicenseMeter connector as the client app.
New-MgPolicyPermissionGrantPolicy \`
  -Id "licensemeter-read-only" \`
  -DisplayName "LicenseMeter read-only consent" \`
  -Description "Admin consent for the LicenseMeter connector's read-only Graph permissions only."

New-MgPolicyPermissionGrantPolicyInclude \`
  -PermissionGrantPolicyId "licensemeter-read-only" \`
  -PermissionType "application" \`
  -ResourceApplication $graphSp.AppId \`
  -Permissions $permissionIds \`
  -ClientApplicationIds @("${CONNECTOR_APP_ID}")

# Custom directory role whose only permission is consenting under that policy.
New-MgRoleManagementDirectoryRoleDefinition -BodyParameter @{
  displayName     = "LicenseMeter Consent Approver"
  description     = "Grants tenant-wide admin consent for the LicenseMeter connector's read-only permissions, nothing else."
  isEnabled       = $true
  rolePermissions = @(
    @{ allowedResourceActions = @(
      "microsoft.directory/servicePrincipals/managePermissionGrantsForAll.licensemeter-read-only"
    ) }
  )
}

# Assign the role in the portal: Entra ID > Roles and administrators >
# "LicenseMeter Consent Approver" > Add assignment.`;

const Section = ({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="mt-12 scroll-mt-24">
    <h2 className="font-display text-2xl tracking-tight">{title}</h2>
    <div className="text-ink-soft mt-4 text-sm leading-relaxed">{children}</div>
  </section>
);

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
        Security overview
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        Written for the person who has to say yes.
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        LicenseMeter asks for tenant-wide read access, so this page spells out
        exactly what is granted, what is stored where, and how you leave. Share
        it with your security team before anyone clicks consent.
      </p>

      <Section title="How access works">
        <p>
          A Global Administrator of your tenant grants consent once, through
          Microsoft&rsquo;s standard admin-consent dialog. That authorizes the
          &ldquo;LicenseMeter Connector&rdquo; application for{" "}
          <strong className="text-ink">
            application permissions that are read-only without exception
          </strong>
          . LicenseMeter then syncs nightly using its own credential: no service
          account in your tenant, no agent, no mailbox plugin. You can revoke
          the application in Entra ID at any time, independently of us.
        </p>
        <ul className="border-line bg-card mt-5 border">
          {CONNECTOR_SCOPES.map((s) => (
            <li
              key={s.scope}
              className="border-line flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <code className="text-ink font-mono text-xs">{s.scope}</code>
              <span className="text-xs">{s.why}</span>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-3 text-xs">
          The consent is recorded in your tenant&rsquo;s audit log. Sign-in to
          the dashboard itself uses a separate app registration with only
          openid, profile and email.
        </p>
      </Section>

      <Section
        id="delegate-consent"
        title="Delegating the consent without standing Global Administrator rights"
      >
        <p>
          Tenant-wide admin consent for Microsoft Graph application permissions
          (the kind listed above) can be granted by a Global Administrator or a
          Privileged Role Administrator; an Application Administrator is not
          sufficient for Graph application permissions, a boundary Microsoft
          sets, not us. Entra ID does let an organization delegate this consent
          narrowly: an app consent policy pinned to exactly these{" "}
          {CONNECTOR_SCOPES.length} read-only permissions and to the
          LicenseMeter connector app, attached to a custom directory role. The
          one-time setup itself requires a Privileged Role Administrator or
          Global Administrator and Microsoft Graph PowerShell (the role
          permission cannot be added in the Entra portal yet) and belongs in
          your identity team&rsquo;s review.
        </p>
        <pre className="border-line bg-card text-ink mt-5 overflow-x-auto border p-4 font-mono text-xs leading-relaxed">
          <code>{DELEGATE_CONSENT_SCRIPT}</code>
        </pre>
        {!env.CONNECTOR_CLIENT_ID && (
          <p className="text-ink-faint mt-3 text-xs">
            The connector application ID is shown on the connect page and in
            Microsoft&rsquo;s consent dialog.
          </p>
        )}
        <p className="mt-4">
          No role with consent rights at hand today? The{" "}
          <a
            href="/api/auth/signin?returnTo=%2Fapp%2Fconnect%2Fcsv"
            className="text-ink hover:text-rust-text font-medium underline underline-offset-4"
          >
            CSV trial
          </a>{" "}
          computes your waste number from two Microsoft 365 admin center
          exports, with no consent at all. The link signs you in with Microsoft
          first.
        </p>
      </Section>

      <Section title="What LicenseMeter never accesses">
        <ul className="mt-2 flex flex-col gap-2">
          {NEVER_ACCESSED.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-rust-text mt-0.5">
                ×
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4">
          Usage reports are consumed as counts and last-activity dates only:
          metadata, never content.
        </p>
      </Section>

      <Section title="What is stored">
        <ul className="mt-2 flex flex-col gap-2">
          {STORED_DATA.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-moss mt-0.5">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4">
          Access to a workspace is invite-based. Signing in with an account from
          your tenant grants nothing by itself; the admin who completed consent
          decides who sees the data and in which role.
        </p>
      </Section>

      <Section title="Data residency, retention and deletion">
        <p>
          Customer application data is stored in the EU in a Supabase Postgres
          database hosted on AWS eu-central-1 (Frankfurt), matching the current
          Privacy Policy wording. Data is retained only while your tenant is
          connected. Disconnecting the workspace (Settings → Danger zone)
          deletes all synced data immediately and irreversibly: users, findings,
          prices, history. Revoking the enterprise application in your Entra ID
          additionally cuts our access at the source.
        </p>
      </Section>

      <Section id="subprocessors" title="Subprocessors">
        <ul className="border-line bg-card mt-2 border">
          {[
            ["Vercel Inc.", "Application hosting (EU function region)"],
            ["Supabase Inc.", "Postgres database, EU (Frankfurt)"],
            ["Microsoft", "Identity platform (sign-in, consent) and Graph API"],
            [
              "Resend Inc.",
              "Email delivery: workspace notifications, weekly digest and the signup guide email, EU region",
            ],
          ].map(([name, role]) => (
            <li
              key={name}
              className="border-line flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span className="text-ink font-medium">{name}</span>
              <span className="text-xs">{role}</span>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-3 text-xs">
          The definitive subprocessor list is part of the DPA.
        </p>
      </Section>

      <Section id="dpa" title="DPA / Auftragsverarbeitung">
        <p>
          LicenseMeter processes directory data on your behalf, so a data
          processing agreement under Art. 28 GDPR (AVV) is part of every
          subscription. Request the current version by email and receive a
          countersigned copy before you connect production data.
        </p>
      </Section>

      <Section title="Publisher verification">
        <p>
          Microsoft publisher verification for the LicenseMeter app
          registrations is in progress.
          {/* TODO: update this wording the day verification completes. */}{" "}
          Until it completes, the consent dialog shows the apps as unverified,
          and tenants with strict consent policies may block them. Microsoft
          displays the verification status directly in the consent dialog, so
          your admin can always confirm the current state independently of this
          page.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Security review, pentest coordination or vendor questionnaires:{" "}
          <a
            href={SUPPORT_MAILTO}
            className="text-ink hover:text-rust-text font-medium underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          . See also the{" "}
          <Link
            href="/faq"
            className="text-ink hover:text-rust-text font-medium underline underline-offset-4"
          >
            FAQ
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-ink hover:text-rust-text font-medium underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <script
        type="application/ld+json"
        // Static breadcrumb; "<" escaped so nothing can terminate the script.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: BASE },
              {
                "@type": "ListItem",
                position: 2,
                name: "Security",
                item: `${BASE}/security`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
