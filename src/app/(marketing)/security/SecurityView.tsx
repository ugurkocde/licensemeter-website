import Link from "next/link";

import { env, signInPath } from "~/env";
import { type DpaLang, subprocessorRows } from "~/lib/dpa";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "~/lib/support";

import { SECURITY_CONTENT } from "./content";

/**
 * Renders the security overview from the bilingual structure in ./content and
 * the sub-processor rows from ~/lib/dpa. Each language is a real,
 * server-rendered URL (/security and /de/security); the language toggle links
 * between them so crawlers see both versions. The delegate-consent PowerShell
 * script is shared across languages (code comments stay English).
 */

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

export const SecurityView = ({ lang }: { lang: DpaLang }) => {
  const c = SECURITY_CONTENT[lang];
  const subprocessors = subprocessorRows(lang);
  const langs: { id: DpaLang; label: string; href: string }[] = [
    { id: "en", label: "English", href: "/security" },
    { id: "de", label: "Deutsch", href: "/de/security" },
  ];

  return (
    <main lang={lang} className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        {c.eyebrow}
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {c.h1}
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {c.intro}
      </p>

      <div className="mt-6">
        <div
          role="group"
          aria-label={c.toggleLabel}
          className="border-line-strong bg-card inline-flex rounded-xl border p-1"
        >
          {langs.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              aria-current={lang === l.id ? "page" : undefined}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                lang === l.id
                  ? "bg-brand-strong text-white"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <Section title={c.access.title}>
        <p>
          {c.access.body.pre}
          <strong className="text-ink">{c.access.body.strong}</strong>
          {c.access.body.post}
        </p>
        <ul className="border-line bg-card mt-5 border">
          {CONNECTOR_SCOPES.map((s) => (
            <li
              key={s.scope}
              className="border-line flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <code className="text-ink font-mono text-xs">{s.scope}</code>
              <span className="text-xs">
                {c.access.scopeWhy[s.scope] ?? s.why}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-3 text-xs">{c.access.consentNote}</p>
      </Section>

      <Section id="delegate-consent" title={c.delegate.title}>
        <p>
          {c.delegate.body.pre}
          {CONNECTOR_SCOPES.length}
          {c.delegate.body.post}
        </p>
        <pre className="border-line bg-card text-ink mt-5 overflow-x-auto border p-4 font-mono text-xs leading-relaxed">
          <code>{DELEGATE_CONSENT_SCRIPT}</code>
        </pre>
        {!env.CONNECTOR_CLIENT_ID && (
          <p className="text-ink-faint mt-3 text-xs">
            {c.delegate.connectorIdNote}
          </p>
        )}
        <p className="mt-4">
          {c.delegate.csv.pre}
          <a
            href={`${signInPath()}?returnTo=${encodeURIComponent(c.delegate.csv.href)}`}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.delegate.csv.linkText}
          </a>
          {c.delegate.csv.post}
        </p>
      </Section>

      <Section title={c.never.title}>
        <ul className="mt-2 flex flex-col gap-2">
          {c.never.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-brand-text mt-0.5">
                ×
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4">{c.never.note}</p>
      </Section>

      <Section title={c.stored.title}>
        <ul className="mt-2 flex flex-col gap-2">
          {c.stored.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-moss mt-0.5">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4">{c.stored.note}</p>
      </Section>

      <Section title={c.residency.title}>
        <p>{c.residency.body}</p>
      </Section>

      <Section id="subprocessors" title={c.subprocessors.title}>
        <ul className="border-line bg-card mt-2 border">
          {subprocessors.map((sp) => (
            <li
              key={sp.name}
              className="border-line flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <span className="text-ink font-medium">{sp.name}</span>
              <span className="text-xs sm:text-right">
                {sp.purpose}. {sp.location}.
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-3 text-xs">
          {c.subprocessors.note.pre}
          <Link
            href={c.subprocessors.note.href}
            className="hover:text-ink underline underline-offset-4"
          >
            {c.subprocessors.note.linkText}
          </Link>
          {c.subprocessors.note.post}
        </p>
      </Section>

      <Section id="dpa" title={c.dpa.title}>
        <p>
          {c.dpa.body.pre}
          <Link
            href={c.dpa.body.href}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.dpa.body.linkText}
          </Link>
          {c.dpa.body.post}
        </p>
      </Section>

      <Section title={c.publisher.title}>
        <p>{c.publisher.body}</p>
      </Section>

      <Section title={c.who.title}>
        <p>
          {c.who.pre}
          <a
            href="https://ugurkoc.de"
            target="_blank"
            rel="noreferrer"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.who.kocLabel}
          </a>
          {c.who.mid}
          <Link
            href="/impressum"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.who.impressumLabel}
          </Link>
          {c.who.post}
        </p>
      </Section>

      <Section title={c.questions.title}>
        <p>
          {c.questions.body}
          <a
            href={SUPPORT_MAILTO}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          {c.questions.seeAlso.pre}
          <Link
            href="/faq"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.questions.seeAlso.faqLabel}
          </Link>
          {c.questions.seeAlso.mid}
          <Link
            href="/privacy"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.questions.seeAlso.privacyLabel}
          </Link>
          {c.questions.seeAlso.post}
        </p>
      </Section>
    </main>
  );
};
