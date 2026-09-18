# Privacy mode (aggregate-only workspaces)

Status: spec, not implemented. Owner: Ugur. Created 2026-07-02.

## Summary

A workspace-level mode in which LicenseMeter never stores or displays the identity of
directory users. Findings, dashboards and exports operate on aggregate counts per SKU
instead of named individuals. The mode is enforced server-side, independent of
Microsoft's report-name concealment setting, and its toggle history is audited and
visible so a works council can verify it was never switched off.

## Motivation

German (and generally EU) enterprises treat per-employee activity data as
co-determination territory. Under BetrVG s. 87(1)(6), a works council has a
co-determination right over any technical system that is objectively capable of
monitoring employee behavior or performance; intent is irrelevant under
Bundesarbeitsgericht case law. LicenseMeter's default mode stores per-user sign-in
timestamps and per-workload last-activity dates and names individuals in findings and
CSV exports, so a Betriebsvereinbarung is typically required before deployment.

Privacy mode changes the negotiation: if the system cannot show who is inactive, only
how many licenses are inactive, the customer keeps most of the cost savings while the
monitoring capability is removed rather than merely promised away. It also aligns with
Art. 5(1)(c) GDPR (data minimization) and backs the purpose-limitation commitment added
to the DPA in v1.2 (Clause 1). This is a sales enabler for the German market and a
differentiator versus PowerShell scripts and most competitors.

## Current behavior (for contrast)

- Sync always stores `displayName` and `upn` in `tenant_users`
  (src/server/db/schema.ts, tenantUsers) along with sign-in and per-workload
  activity timestamps.
- Per-user findings name individuals in `findings.title` and `findings.detail`
  (upn, displayName) and link to /app/users/[id].
- The findings CSV export (src/app/api/export/findings/route.ts) emits UPNs in
  plaintext; the PDF report includes names.
- Aggregate behavior exists only as a fallback: when the customer's Microsoft tenant
  conceals report names, src/server/sync/join.ts detects hashed UPNs, sets
  `activitySignal: "none"` and derives a `usageAggregate` object (total and inactive
  counts) that the waste engine consumes instead of emitting per-user findings;
  Copilot has its own `copilotSignal: "aggregate"` variant. Even then, named
  directory users are still synced and stored; they are just not linked to findings.

## Design

### Setting

- New column `tenants.privacyMode boolean not null default false`.
- Editable only by workspace owners (not admins), in Settings next to
  `inactiveDays` (precedent: src/components/workspace/InactiveDaysForm).
- Both enabling and disabling are recorded in the audit log with actor identity
  (new `AuditAction` values `enablePrivacyMode`, `disablePrivacyMode`).

### Sync

When `privacyMode` is on:

- `tenant_users` rows are written with `displayName` and `upn` set to null. The
  Graph `id` (already a pseudonymous, stable key) remains the primary key so
  sync upserts, license diffing and seat counting keep working.
- Per-user activity timestamps (`lastInteractiveSignIn`, `lastNonInteractiveSignIn`,
  `lastActivity`, `workloadActivity`) are still stored per row, because inactivity
  counting needs them, but they are never joined to a name or email anywhere.
  (Open question 1 discusses dropping even this.)
- Enabling the mode retroactively scrubs existing data in the same transaction:
  null out `displayName`/`upn` on all `tenant_users` rows, delete or rewrite all
  person-level findings (see next section), and delete `findings.detail` fields
  that contain identity.
- `seenSignins.upn` and connector tables (`adobeUsers`, `saasSeats`) follow the
  same rule: no plaintext identity stored while the mode is on.

### Findings

- The waste engine (src/server/waste/engine.ts) reuses the existing aggregate path:
  instead of one finding per named user, it emits per-SKU aggregate findings
  ("14 of 220 Microsoft 365 E3 seats inactive for more than 90 days,
  EUR 480.20/month"). `graphUserId` stays null; `detail` carries counts and SKU
  identifiers only.
- Rules that inherently need an individual (for example "disabled account still
  licensed") also aggregate: count plus SKU plus monthly impact. The remediation
  path changes from "here is the user" to "here is the filter to run in your own
  admin center", where the customer, not LicenseMeter, resolves identities inside
  their tenant.

### UI

- /app/users list and /app/users/[id] detail pages are not rendered in privacy
  mode; navigation hides them. Seat counts and inactivity aggregates appear on the
  dashboard instead.
- Workspace settings show the mode prominently, including when it was enabled and
  by whom, sourced from the audit log. This is the screenshot a works council asks
  for.

### Exports

- Findings CSV: no User column; rows are aggregate findings.
- PDF report: aggregate tables only.
- The export endpoints derive their shape from the stored findings, so enforcing
  at sync/engine level automatically covers them; add an assertion in the export
  code paths that no identity fields are present when `privacyMode` is on
  (defense in depth).

### Enforcement and governance

- All checks are server-side; the client never receives identity fields in privacy
  mode because they are not stored. There is nothing to hide client-side.
- Disabling the mode does not resurrect anything (names were never stored). Names
  reappear only after the next sync completes, and the disable event is audited
  and permanently visible in the settings history while the workspace exists.
- Interaction with Microsoft report concealment: independent. Concealment continues
  to force the aggregate activity signal; privacy mode additionally stops storing
  identities. The security page and DPA should describe both.

## Data model changes

- `tenants.privacyMode boolean not null default false` (drizzle + db:push locally,
  app_all RLS policy already covers `tenants`).
- `tenant_users.displayName` and `.upn` become nullable (upn currently has a
  per-tenant lookup index; index stays, null rows are simply absent from lookups).
- New `AuditAction` values `enablePrivacyMode` and `disablePrivacyMode`.
- No new tables.

## Rollout

1. Schema migration (columns nullable, new setting).
2. Sync + engine behavior behind the setting, plus the retroactive scrub on enable.
3. UI (settings toggle owner-only, hidden user pages, dashboard aggregates).
4. Export assertions.
5. Marketing follow-up (separate task): document the mode on /security and
   /de/security, add it to the DPA TOMs (Annex 2) at the next version bump, and
   build the German works-council briefing page around it.

## Out of scope

- Per-role visibility tiers (viewers see aggregates, admins see names). Privacy mode
  is all-or-nothing per workspace; role tiers can layer on later without schema
  changes.
- Time-based retention limits for activity data in named mode (worth doing, separate
  spec).
- Pseudonym display (user-047 style aliases). Rejected for v1: aliases stable across
  syncs are re-identifiable with tenant knowledge and would weaken the "cannot show
  individuals" claim.

## Open questions

1. Should per-row activity timestamps be dropped entirely in favor of nightly
   aggregate counters? Strongest privacy posture, but loses the ability to change
   `inactiveDays` without a full resync and complicates trend history. Current
   answer: keep per-row timestamps keyed by Graph id only; revisit if works
   councils push back.
2. Should enabling privacy mode require re-consent or a confirmation export of the
   scrub result? Leaning: show a summary ("removed names from 220 users, rewrote
   14 findings") in the audit detail.
3. Pricing: free, like the rest of the product.

## Acceptance criteria

- With privacy mode on, no plaintext displayName or UPN of directory users exists
  anywhere in the workspace's rows in `tenant_users`, `findings`, `seenSignins`,
  `adobeUsers` or `saasSeats`, verified by a test that syncs a fixture tenant and
  inspects the database.
- Findings, dashboard, CSV and PDF outputs contain counts and SKUs only; a test
  asserts no email-shaped strings in exports.
- Enabling the mode scrubs pre-existing names and person-level findings in the same
  transaction; a test enables the mode on a named workspace and verifies the scrub.
- Toggle events appear in the audit log with actor and timestamp and are rendered
  in workspace settings.
- Turning the mode off produces no names until the next successful sync.
- Microsoft-concealed tenants behave exactly as before when privacy mode is off.
