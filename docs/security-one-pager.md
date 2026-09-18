# LicenseMeter Security One-Pager

> For the IT/security gatekeeper evaluating LicenseMeter. Everything below is
> independently verifiable: scopes in your own Entra consent dialog, the rest
> at https://www.licensemeter.com/security. Convert to PDF for attachments.

## What LicenseMeter does

Read-only analysis of Microsoft 365 license waste: seats on disabled accounts,
never-active and long-inactive users, unassigned paid seats, unused Copilot
seats, licensed guests, each priced per month. Optional Adobe connector
correlates Adobe seats with Entra account state (offboarding leaks).

## Access model

- One-time admin consent for application permissions that are **read-only
  without exception**: `User.Read.All`, `AuditLog.Read.All`,
  `Reports.Read.All`, `LicenseAssignment.Read.All`, `ReportSettings.Read.All`
- **Never accessible**: mailbox content, files, Teams messages, credentials.
  The granted scopes cannot read content, and no write scope exists
- Sign-in is a separate app with only `openid profile email`
- Revocable any time in Entra ID > Enterprise applications, independent of us

## Data handling

- Stored: license counts, directory metadata (name, UPN, enabled state,
  assignments), activity **timestamps** only; optional Adobe entitlements
- Residency: PostgreSQL in the EU (AWS Frankfurt); application functions
  pinned to Frankfurt
- Retention: only while connected. Disconnecting deletes everything
  immediately (cascade); backups rotate out within 7 days
- Access: invite-only per workspace with roles (read-only viewer for
  finance); same-tenant sign-in alone grants nothing. Colleagues on the
  workspace's verified company email domain can ask to join; an owner or
  admin approves each request, and owners can switch this to automatic
  joining or turn it off
- Per-workspace activity log of exports and admin actions

## Technical measures (excerpt; full TOMs in the DPA)

TLS everywhere with HSTS; AES-256 at rest; third-party credentials
additionally app-layer encrypted (AES-256-GCM); least-privilege database role
behind row-level security; PKCE + JWKS-verified sign-in; security headers;
CSRF origin checks; tenant isolation verified by independent security audit.

## Compliance

- GDPR processor (Art. 28): DPA/AVV with TOMs and subprocessor annexes
  available before production data is connected
- Subprocessors: Vercel (hosting, EU functions), Supabase (database,
  Frankfurt), Microsoft (identity + Graph), Resend (admin notifications, EU)
- Breach notification to the controller within 72 hours
- Data-subject requests routed via you as controller

## Contact

security questions / vendor questionnaires: support@licensemeter.com
