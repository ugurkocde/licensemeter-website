# LicenseMeter Security One-Pager

> For the IT/security gatekeeper evaluating LicenseMeter. Everything below is
> independently verifiable: scopes in your own Entra consent dialog, the rest
> at https://www.licensemeter.com/security. Convert to PDF for attachments.

## What LicenseMeter does

Read-only analysis of Microsoft 365 license waste: seats on disabled accounts,
never-active and long-inactive users, unassigned paid seats, unused Copilot
seats, licensed guests, each priced per month. Optional connectors for Adobe,
Zoom, Atlassian, Salesforce, OpenAI and Anthropic, plus CSV imports for
ChatGPT and Claude workspace seats, correlate those seats and API spend with
Entra account state (offboarding leaks).

## Access model

- The core LicenseMeter application uses read-only Microsoft Graph
  permissions, granted by one-time admin consent: `User.Read.All`,
  `AuditLog.Read.All`, `Reports.Read.All`, `LicenseAssignment.Read.All`,
  `ReportSettings.Read.All`
- The optional Software Metering module uses a separate app registration with
  `DeviceManagementScripts.ReadWrite.All`, used solely to create, assign and
  update LicenseMeter's own Intune Remediation script for software usage
  metering. It requires separate admin consent and is inactive unless the
  customer enables it. No other write permissions are used
- **Never accessible**: mailbox content, files, Teams messages, credentials.
  The granted scopes cannot read content
- Sign-in is a separate app with only `openid profile email`
- Revocable any time in Entra ID > Enterprise applications, independent of us

## Data handling

- Stored: license counts, directory metadata (name, UPN, enabled state,
  assignments), activity **timestamps** only; optional connector entitlements
  and daily API spend totals
- Residency: PostgreSQL in the EU (AWS Frankfurt); application functions
  pinned to Frankfurt
- Retention: for as long as the workspace exists. Deleting the workspace
  removes everything from the live database immediately (cascade); copies in
  the database provider's daily backups expire after 7 days. Revoking the
  Entra app stops access and deletes nothing
- Access: invite-only per workspace with roles (read-only viewer for
  finance); same-tenant sign-in alone grants nothing. Colleagues on the
  workspace's verified company email domain can ask to join; an owner or
  admin approves each request, and owners can switch this to automatic
  joining or turn it off
- Per-workspace activity log of exports and admin actions

## Technical measures (excerpt; full TOMs in the DPA)

TLS everywhere with HSTS; AES-256 at rest; third-party credentials
additionally app-layer encrypted (AES-256-GCM); least-privilege database
role; PKCE + JWKS-verified sign-in; security headers; CSRF origin checks.

Tenant isolation: customer data is logically separated per workspace in a
shared database. Isolation is enforced in the application layer: every request
is authenticated (Microsoft Entra ID sign-in, or a workspace-bound token for
the MCP API) and authorised against the user's workspace. Row-level security
is enabled on all tables and enforces per-tenant row policies on the MCP API
and data export endpoints. The Supabase public Data API has no access to any
table.

## Compliance

- GDPR processor (Art. 28): DPA/AVV with TOMs and subprocessor annexes
  available before production data is connected
- Subprocessors: Vercel Inc. (hosting and serverless functions, Frankfurt),
  Supabase Pte. Ltd. (database, Frankfurt), Microsoft (Entra ID sign-in and
  Graph API, customer tenant region), Resend Inc. (transactional email, EU),
  Cloudflare Inc. (Turnstile bot protection on forms, global edge)
- Breach notification to the controller within 72 hours
- Data-subject requests routed via you as controller

## Contact

security questions / vendor questionnaires: support@ugurlabs.com
