---
description: "Configure the application registrations used by your own LicenseMeter deployment."
icon: key
---

# Microsoft application setup

This guide is for operators of a self-hosted installation. Hosted LicenseMeter users should start with the [Microsoft connector](../connectors/microsoft.md).

For Docker, start with [Self-hosting with Docker](README.md). This reference also covers Vercel and other Node.js hosts.

## Authentication

Everyone signs in with Microsoft Entra ID, using a work or school account. There is no other sign-in method and no provider switch. Sign-in and the Microsoft 365 connector are two separate app registrations with separate credentials.

| Registration | Configuration                                                  | What it is allowed to do                                                                                                                                                   |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in      | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | OpenID Connect sign-in with the `openid`, `profile` and `email` scopes. It declares no Microsoft Graph permissions, needs no admin rights and reads nothing in the tenant. |
| Connector    | `CONNECTOR_CLIENT_ID`, `CONNECTOR_CLIENT_SECRET`               | Read-only application permissions for the license data, granted later by an administrator through admin consent.                                                           |

At sign-in Microsoft receives the usual OpenID Connect request: the sign-in app's client ID, the redirect URI and the three scopes. LicenseMeter receives an ID token with the person's name, their username, their email address when Microsoft releases it, their object ID and their tenant ID. Membership is keyed on the object ID and tenant ID. The name, username and email are display values and never grant access on their own.

`AUTH_SECRET` signs the session cookie. A sample instance runs without either registration when `DEMO_MODE=true`.

### Linking existing members by verified email

This step is optional. A membership that predates Microsoft sign-in, or an invitation addressed to an email, has to be matched to the person's Entra identity once. LicenseMeter only trusts the email in the ID token for that match when Microsoft marks its domain as verified by the tenant: the token must carry `xms_edov` with the value `true` together with an `email` claim. Microsoft describes `xms_edov` as a "Boolean value indicating whether the user's email domain owner has been verified" in the [optional claims reference](https://learn.microsoft.com/entra/identity-platform/optional-claims-reference).

[setup-entra.ps1](https://github.com/ugurkocde/licensemeter-website/blob/main/scripts/setup-entra.ps1) does not configure this. To turn it on, change the sign-in app registration only:

1. In the Microsoft Entra admin center open App registrations, the sign-in app, Token configuration, and add the optional ID token claims `email` and `xms_edov`. The same change in Microsoft Graph is a `PATCH https://graph.microsoft.com/v1.0/applications/{object-id}` with this body:

   ```json
   {
     "optionalClaims": {
       "idToken": [
         { "name": "email", "essential": false },
         { "name": "xms_edov", "essential": false }
       ]
     }
   }
   ```

2. Tell Microsoft to drop email addresses whose domain owner is not verified, so an unverified address never reaches the token. Send `PATCH https://graph.microsoft.com/v1.0/applications/{object-id}/authenticationBehaviors` with this body:

   ```json
   { "removeUnverifiedEmailClaim": true }
   ```

   Microsoft documents the property, and its advisory that apps should never use the email claim for authorization, in [Manage application authenticationBehaviors](https://learn.microsoft.com/graph/applications-authenticationbehaviors).

Both requests need `Application.ReadWrite.All` or ownership of the app, use the application's object ID (not the client ID), and return `204 No Content`. They change what the sign-in app's ID tokens contain for every person who signs in afterwards; they do not touch the connector app or any customer tenant. To undo them, remove the two optional claims and send `{ "removeUnverifiedEmailClaim": null }` to restore Microsoft's default.

With the claims in place, an existing member or invited person whose verified email matches is linked automatically on their first Microsoft sign-in. Without them nobody is linked by email: the person uses the claim link that LicenseMeter emails to the address on the membership, which proves control of that mailbox instead.

## Microsoft registrations

[setup-entra.ps1](https://github.com/ugurkocde/licensemeter-website/blob/main/scripts/setup-entra.ps1) creates two multi-tenant app registrations in the tenant you select, each with a service principal and a client secret that expires after 12 months. "LicenseMeter Sign-in" gets the sign-in redirect URI and declares no Microsoft Graph permissions. "LicenseMeter Connector" gets the connector redirect URI and the five read-only application permissions listed below. The script prints the four environment values once. Review the script and its requested permissions before running it. It creates application registrations and credentials in the selected Microsoft tenant, affecting sign-in and connector access for this deployment. Start in a test tenant, verify the tenant and generated applications, and stop if the requested permissions or redirect URLs differ from your plan. To retire the setup, revoke consent, remove the created credentials and applications, and remove their deployment settings. This stops sign-in or refresh for the installation; it does not erase data already collected.

```powershell
Install-Module Microsoft.Graph.Applications -Scope CurrentUser
./scripts/setup-entra.ps1 -BaseUrl "https://licenses.example.com"
```

Register these Web redirect URIs for your deployment:

- Sign-in: `https://licenses.example.com/api/auth/callback/microsoft-entra-id`
- Connector: `https://licenses.example.com/api/connect/callback`

Store the generated IDs and secrets in deployment environment variables. The connector uses `CONNECTOR_CLIENT_ID` and `CONNECTOR_CLIENT_SECRET`, independently of sign-in. Its setup page also supports bringing your own app registration. `scripts/add-redirect-uris.ps1` requires your own sign-in and connector app IDs explicitly.

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

For Vercel, configure the database, authentication, encryption, `APP_BASE_URL`, and `CRON_SECRET`. `vercel.json` schedules the sync, digest, and monthly report. The hosted deployment retains its Crisp chat behavior; `SELF_HOSTED=true` is for instances you operate yourself.

## First connection

Sign in, open Connectors, and select Microsoft 365. Review the read-only permissions and complete consent with an account permitted to grant it. After syncing, review findings and set the license price book to your agreements. Invite colleagues through workspace membership controls.

Some activity signals require additional Microsoft licensing or identifiable reports. The application exposes missing signals and falls back where supported. It does not change report privacy settings on your behalf.
