# WorkOS auth + dual-path Microsoft connector (2026-06-22)

## Goal

Two independent architecture shifts, planned together because they share one root change
(decoupling *who logs in* from *which Microsoft tenant is connected*):

1. **Auth via WorkOS** — lower the sign-in barrier. Stop forcing a Microsoft work
   account; offer Google, Apple, passkeys, email magic link, and enterprise SSO.
2. **Microsoft as a real connector** — set up on the dashboard like every other
   connector, with two paths:
   - **Managed (one-click):** admin-consent to LicenseMeter's multi-tenant app (today's flow).
   - **BYO:** customer creates their own Entra app registration and pastes credentials,
     stored encrypted, verified by a test-connection call, used for nightly app-only syncs.

Both paths feed the **same** sync pipeline and data model.

## Core architecture decision

`tenants.id` is already a surrogate UUID PK that memberships, billing, findings, and every
data table reference — only `tenants.tid` and the login→tid binding are Microsoft-specific.
So `tenants` already *is* the workspace; we do **not** physically rename it (RLS policy risk
— see [[local-db-pglite-and-rls]]). Instead:

- `tenants` = the **workspace / billing / membership** unit (conceptual rename only).
- The Microsoft tenant becomes a **connector record** (`msConnections`), mirroring the
  existing `adobeConnections` / `saasConnections` shape (`clientId` + AES-256-GCM `secretEnc`).
- Tenant binding moves from **login** to **connector setup** (a workspace may have `tid = null`
  until a Microsoft connector is added).

Non-goals (explicitly out of scope for this plan):
- Physical rename of the `tenants` table.
- Multiple Microsoft tenants per workspace (model allows it later; UI stays single for now).
- New non-Microsoft MDM/SaaS connectors (architecture enables; none built here).

---

## Phase A — Auth migration to WorkOS

**WorkOS model mapping** (verified against WorkOS docs, 2026-06-22). LicenseMeter is a **B2B**
app, so use WorkOS **Organizations**, not the flat B2C model:
- WorkOS **Organization** ↔ our `tenants` row (the workspace). Store `workosOrgId` on `tenants`.
- WorkOS **User** ↔ a person. Store `workosUserId` on `memberships` (replaces Entra `oid` as the
  identity join key; `oid`/`upn` kept as Entra-sourced metadata).
- WorkOS **Organization Membership** ↔ our `memberships` row. Carry our `role`
  (viewer/admin/owner) via a WorkOS **JWT template** / org-membership role so the session token
  already has it.

**Deliverables**
- [ ] **Hosted AuthKit** integrated via `authkit-nextjs` + the Next.js **proxy** (formerly
      middleware — Next 16 rename). Sign-in offers Microsoft, Google, Apple, passkey, Magic Auth,
      and email+password. Microsoft stays available as a login method.
- [ ] Session migrated off the Entra-oid-keyed JWT cookie ([msal.ts](src/server/auth/msal.ts)) to
      AuthKit's sealed session (`WORKOS_COOKIE_PASSWORD`), keyed by WorkOS user + active org.
- [ ] **Identity linking** enabled so one person signing in with Google one time and Microsoft
      another resolves to a single WorkOS user (no duplicate memberships).
- [ ] **Provisioning via domain-based JIT** (not naive "every sign-in = new empty workspace"):
  - Verified **corporate** domain → user auto-joins the existing Organization/workspace for that
    domain ([domain policy](https://workos.com/docs/authkit/jit-provisioning)). Prevents 10
    colleagues each spawning a duplicate empty workspace.
  - **Consumer / unverified** domain (gmail.com etc.) → create a personal workspace for that user.
  - Guests / cross-domain users → invitation flow (`authkit/invitations`), not auto-join.
- [ ] Trial-abuse guardrails on the personal-workspace path (rate-limit, consumer-domain heuristics).

**Acceptance criteria**
- A brand-new user signs in with Google (no Microsoft account) and lands on a workspace with a
  Connectors page and **zero** Microsoft data — no errors, no forced consent.
- Two users from the same verified corporate domain land in the **same** workspace; two unrelated
  consumer-email users get **separate** workspaces.
- An existing Microsoft-login user retains access to their current workspace (identity mapped to a
  WorkOS user, membership preserved) after migration; a later Google login on the same email links
  to that same user, not a new one.
- Invite flow binds an invited email to the correct workspace on first WorkOS sign-in.
- All existing auth tests pass or are updated; new tests cover Google-only, domain-JIT join, and
  invite-join paths.

---

## Phase B — Decouple workspace identity from the Microsoft tenant

**Deliverables**
- [ ] `tenants` gains `workosOrgId` (the WorkOS Organization for this workspace);
      `memberships` gains `workosUserId` as the identity join key (Phase A mapping). Indexed.
- [ ] `tenants.tid` made **nullable**; partial-unique index on `tid` kept but allows null
      ([schema.ts:82](src/server/db/schema.ts)).
- [ ] New `msConnections` table, one row per workspace that has a Microsoft connection:
      `tenantId` (FK), `mode` (`'managed' | 'byo'`), `tid`, plus BYO-only columns
      (`appClientId`, `secretEnc`, `secretExpiresAt`, `lastVerifiedAt`, `lastVerifyError`).
- [ ] `consentStates` flow updated so the managed path writes an `msConnections` row on callback
      instead of conflating identity with the login tid ([connect/callback:114](src/app/api/connect/callback/route.ts)).
- [ ] Microsoft surfaced in the connector registry/UI alongside Zoom/Adobe/etc.
      ([connectors.ts](src/lib/connectors.ts)) — its own tile with two setup modes.
- [ ] `db:push` run; prod Supabase `app_all` RLS policy added to `msConnections`
      (see [[local-db-pglite-and-rls]]).

**Acceptance criteria**
- A workspace can exist, bill, and add non-Microsoft connectors with **no** Microsoft connection.
- The Connectors page renders Microsoft as a tile with "Managed (one-click)" and "Bring your own
  app registration" options; both create an `msConnections` row.
- Existing single-tenant isolation guarantees are unchanged (every data query still scoped by
  `tenantId`); no cross-workspace leakage in tests.

---

## Phase C — Microsoft connector: dual-path setup

**Deliverables**
- [ ] **Managed path** preserved end-to-end: admin-consent redirect → callback → `msConnections`
      row with `mode='managed'`, `tid` from the `tenant` param. Credentials remain the central
      `CONNECTOR_CLIENT_ID/SECRET` env ([msGraph.ts:28](src/server/graph/msGraph.ts)).
- [ ] **UI default:** managed one-click is the recommended/default option; BYO sits behind an
      "Advanced — bring your own app registration" toggle.
- [ ] **BYO path:** a credential form (Tenant ID, App/Client ID) supporting **both** auth types
      from launch — client secret **and** certificate (upload private key / PFX, or paste). Follows
      the existing `ConnectorSpec.fields` pattern, with a `setupHint` and a link to the docs/script.
      `msConnections` gains a `credType` (`'secret' | 'cert'`) column.
- [ ] `appClientForTenant` branches on `msConnections.mode` and `credType`: managed → env secret
      + tid; BYO/secret → decrypted per-workspace secret; BYO/cert → decrypted private key (MSAL
      `ConfidentialClientApplication` clientCertificate) + stored tenant id.
- [ ] Both secret and certificate private key stored AES-256-GCM (reuse the established `secretEnc`
      helper keyed off AUTH_SECRET; same pattern as [adobeConnections](src/server/db/schema.ts:259)).
      Masked in UI (last 4 / thumbprint), never logged, redacted in error surfaces.

**Acceptance criteria**
- Connecting via BYO with a correctly-configured customer app reg produces the **same** findings
  as the managed path against the same tenant (diffed on a real test tenant).
- Switching a workspace from managed → BYO (or back) re-points sync with no data loss.
- Secret never appears in logs, API responses, or client bundles (grep + manual review).

---

## Phase D — Test-connection, secret lifecycle, scheduled sync

**Deliverables**
- [ ] **Test-connection** on BYO save: acquire an app-only token with the entered creds, **decode
      the `roles` claim**, and check it contains all required app permissions
      ([scopes.ts](src/lib/scopes.ts)). Return a **per-permission checklist** (green/red per scope),
      not a single pass/fail. Add one live probe for the Reports API (its quirks aren't visible in
      the token).
- [ ] **Verified end-to-end via Lokka** against a real tenant before merge: confirm the
      client-credentials token's `roles` claim actually reflects granted app permissions and that an
      ungranted scope is absent (per global rule on Graph verification).
- [ ] **Secret expiry handling:** store `secretExpiresAt`; surface a dashboard warning before
      expiry and a clear "credential expired — re-enter secret" state when app-only auth fails.
- [ ] **Graceful degradation extended:** a missing scope at sync time downgrades the affected
      findings (e.g. no `Reports.Read.All` → skip usage findings) instead of failing the whole sync,
      consistent with the existing P1/concealed-names fallback.
- [ ] Nightly scheduled sync runs for **both** modes via the existing sync pipeline
      ([runSync.ts](src/server/sync/runSync.ts)).

**Acceptance criteria**
- Entering creds with a missing permission shows exactly which scope is missing (red row) and
  blocks "Connect" with an actionable message.
- A wrong/expired secret yields a specific, non-leaking error (not a generic 500).
- A nightly sync on a BYO connection with an expired secret marks the connection
  `lastVerifyError` and notifies the workspace, without crashing the run.
- Lokka transcript attached showing the `roles`-claim verification on a real tenant.

---

## Phase E — Documentation & friction reduction

**Deliverables**
- [ ] Customer-facing **app-reg setup script** adapted from [setup-entra.ps1](scripts/setup-entra.ps1):
      creates the app registration with exactly the required app permissions, grants admin consent,
      creates a secret, and prints Tenant ID / Client ID / Secret to paste. Collapses the ~15-min
      manual task to "run script, paste output."
- [ ] A docs page (with screenshots) covering the manual portal route as a fallback, the exact
      permission list, and least-privilege rationale.
- [ ] `connectorGuides.ts` / connector `setupHint` updated for the Microsoft BYO tile.

**Acceptance criteria**
- A new admin can stand up a working BYO connection from the docs/script alone, without support.
- The documented permission set is byte-for-byte the scopes the test-connection enforces
  ([scopes.ts](src/lib/scopes.ts)) — no drift between docs, script, and runtime check.

---

## Phase F — Migration & rollout

**Deliverables**
- [ ] Backfill: every existing `tenants` row with a `tid` gets an `msConnections` row,
      `mode='managed'`. No customer re-consents.
- [ ] Feature-flag the WorkOS login + BYO path; managed path is the default and unchanged for
      existing customers.
- [ ] Rollback plan documented (flag off → revert to MSAL login + tid-bound connect flow).
- [ ] DPA/subprocessor review: storing customer Graph secrets changes the security posture; update
      [[dpa-avv]] (WorkOS as a new subprocessor; encrypted-credential custody statement).

**Acceptance criteria**
- Existing customers see no change and no re-consent prompt after deploy.
- Flag-off cleanly restores the current login + connect behavior.
- `npm run build`, `npm run check` (lint+tsc), and `npm run test` all green; new tests for
  msConnections, test-connection (`roles` parsing), and dual-mode token acquisition.
- Independent `feature-dev:code-reviewer` pass against these acceptance criteria, findings fixed.

---

## Decisions (2026-06-22)

- **BYO credential type:** support **client secret AND certificate** from launch (cert is the
  more secure, longer-lived option; secret matches existing connectors). `credType` column added.
- **Secret-at-rest:** **reuse the existing AUTH_SECRET-derived AES-256-GCM** helper for consistency
  with adobe/saas connections. KMS/Supabase Vault envelope encryption tracked as future hardening
  (raise in the security review, not a launch blocker).
- **New-user provisioning:** auto-provision via **domain-based JIT** — verified corporate domain
  auto-joins the existing workspace, consumer/unverified domain gets a personal workspace, guests
  via invitation. (Refined from "always create empty workspace" after reviewing WorkOS JIT docs:
  same self-serve goal, but no duplicate-workspace fragmentation.) Trial-abuse guardrails on the
  personal-workspace path.
- **Default Microsoft path:** **managed one-click is the default/recommended**; BYO lives behind
  an "Advanced" toggle.

## Pricing / packaging (verified 2026-06-22, [workos.com/pricing](https://workos.com/pricing))

- **AuthKit (user management): FREE up to 1M MAU**, then ~$2,500/mo per additional 1M MAU. Our
  multi-method login (Google/Apple/passkey/Magic Auth/email+password/Microsoft social) sits in the
  free tier — effectively **$0 at launch scale**. (Permanent free-up-to-1M-MAU startup program also
  exists.)
- **Enterprise SSO: ~$125/connection/mo** (volume discounts to ~$65). Pay-per-connection, only when
  an enterprise customer wants their own IdP — a natural upsell, **not** needed at launch.
- **Directory Sync (SCIM): ~$125/connection/mo — we do NOT use it.** Confirmed it is not required
  for AuthKit; it stays off (it only does SCIM users/groups, never license/usage data anyway).
- **Custom domain / branded login (CNAME): ~$99/mo flat** — optional, likely wanted for a branded
  AuthKit login page. The only realistic launch-time spend.
- **Net:** ~$0 (or ~$99/mo with branded domain) until enterprise-SSO connections are sold.

## Open questions (still to resolve)

- [ ] None blocking. (Pricing resolved above; revisit SSO connection budget when the first
      enterprise customer requests their own IdP.)

## Review

_(to be filled after implementation — outcome, acceptance-criteria pass/fail, gates)_
