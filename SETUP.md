# Deployment configuration

For Docker, start with [docs/self-hosting.md](docs/self-hosting.md). This reference also covers Vercel and other Node.js hosts.

## Authentication

The Microsoft connector is separate from sign-in.

| Provider        | Configuration                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Entra | `AUTH_PROVIDER=entra`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`                                                           |
| WorkOS AuthKit  | `AUTH_PROVIDER=workos` (application default), `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` |

Compose selects Entra and needs no WorkOS account. A sample instance runs without provider credentials when `AUTH_PROVIDER=entra` and `DEMO_MODE=true`.

For WorkOS, register your deployment's `/auth/callback` URL and `/auth/sign-in` endpoint. The cookie password must contain at least 32 characters. Configure `NEXT_PUBLIC_WORKOS_REDIRECT_URI` before building. Follow the [AuthKit Next.js documentation](https://workos.com/docs/authkit/nextjs).

## Microsoft registrations

[scripts/setup-entra.ps1](scripts/setup-entra.ps1) creates separate sign-in and read-only connector applications in the tenant you select. Review the script and its requested permissions before running it.

```powershell
Install-Module Microsoft.Graph.Applications -Scope CurrentUser
./scripts/setup-entra.ps1 -BaseUrl "https://licenses.example.com"
```

Register these Web redirect URIs for your deployment:

- Sign-in: `https://licenses.example.com/api/auth/callback/microsoft-entra-id`
- Connector: `https://licenses.example.com/api/connect/callback`

Store the generated IDs and secrets in deployment environment variables. The connector uses `CONNECTOR_CLIENT_ID` and `CONNECTOR_CLIENT_SECRET`, independently of the login provider. Its setup page also supports bringing your own app registration. `scripts/add-redirect-uris.ps1` requires your own sign-in and connector app IDs explicitly.

The managed connector requests `User.Read.All`, `AuditLog.Read.All`, `Reports.Read.All`, `LicenseAssignment.Read.All`, and `ReportSettings.Read.All`. Consent and publisher requirements depend on the target tenant's policies. See Microsoft's [admin-consent documentation](https://learn.microsoft.com/entra/identity-platform/v2-admin-consent) and [publisher verification overview](https://learn.microsoft.com/entra/identity-platform/publisher-verification-overview).

## Shared environment

| Variable                                                     | Purpose                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | PostgreSQL connection using the limited runtime role                        |
| `AUTH_SECRET`                                                | Session signing secret, at least 32 characters in production                |
| `DATA_ENCRYPTION_KEY`                                        | Separate encryption key for connector credentials                           |
| `APP_BASE_URL`                                               | Canonical deployment origin, HTTPS for public access                        |
| `CRON_SECRET`                                                | Bearer secret for scheduled-job routes                                      |
| `DEMO_MODE`                                                  | `true` enables credentials-free sample-workspace access                     |
| `SELF_HOSTED`                                                | `true` enables runtime page configuration and disables hosted chat defaults |
| `RESEND_API_KEY`, `EMAIL_FROM`                               | Optional transactional email                                                |
| `SUPPORT_TO_EMAIL`                                           | Destination for the self-hosted support form                                |
| `SUPPORT_TURNSTILE_SITE_KEY`, `SUPPORT_TURNSTILE_SECRET_KEY` | Optional spam verification; configure both for your hostname                |
| `CRISP_WEBSITE_ID`                                           | Optional chat website ID for your instance                                  |

Never commit environment files, database dumps, or private keys. `SKIP_ENV_VALIDATION` is for builds without secrets, not runtime deployment.

## Database and hosting

Docker initializes its dedicated database automatically. Do not point its initial migration at an existing hosted database; it creates a complete schema and requires an empty database.

For an independently managed PostgreSQL database, provision the schema as the database owner and use a separate login for runtime. Keep administrator connection strings out of the web environment.

The `scripts/db-*.sql` files describe the hosted Supabase deployment: RLS, application-role DML permissions, and denial of Supabase Data API access. Tenant isolation remains in application code. Review these files before applying them, and run `scripts/db-audit-posture.sql` after schema changes. The bundled PostgreSQL service has no Data API and does not need these Supabase-specific scripts.

For Vercel, configure the database, authentication, encryption, `APP_BASE_URL`, and `CRON_SECRET`. `vercel.json` schedules the sync, digest, and monthly report. The hosted deployment retains its WorkOS and Crisp behavior; `SELF_HOSTED=true` is for instances you operate yourself.

## First connection

Sign in, open Connectors, and select Microsoft 365. Review the read-only permissions and complete consent with an account permitted to grant it. After syncing, review findings and set the license price book to your agreements. Invite colleagues through workspace membership controls.

With WorkOS sign-in, the first workspace created from a company email domain also answers for that domain. Its owner chooses under Settings, Members, Who can join how colleagues with a verified email on the domain get in: ask to join (the default: an owner or admin approves each request), join automatically as viewer, or invite only. Owners and admins are emailed about requests and automatic joins, and every request, approval, decline and join is written to the activity log. Whoever is not admitted gets a separate workspace of their own, so nobody waits on an approval to use the product. Consumer email domains never qualify, and Entra sign-in (the Compose default) is always invite only.

After upgrading a hosted database with `db:push`, run `scripts/db-backfill-domain-join-mode.sql` once: workspaces that used to admit colleagues silently move to approval, all others to invite only. Docker deployments get the same step from the bundled migration.

Some activity signals require additional Microsoft licensing or identifiable reports. The application exposes missing signals and falls back where supported. It does not change report privacy settings on your behalf.
