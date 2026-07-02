# Security review + fix plan (2026-07-02) - DONE (uncommitted, awaiting owner commit)

Four parallel security reviewers covered: (A) auth/API routes, (B) server actions & data
access, (C) integrations/crypto/tokens, (D) web layer & config. No critical or high-severity
exploitable defects were found; the codebase is well hardened (signed `__Host-` cookies,
per-tenant scoping on every query, constant-time token compares, Stripe webhook signature +
customer-match, AES-256-GCM with per-tenant AAD, SSRF host pinning). Items below are one medium
exposure plus defense-in-depth hardening. Codex CLI implements F1-F11; a reviewer agent verifies.

## Fixes to apply now (Codex scope)
- [ ] F1 (Medium) Unauthenticated server action `syncMspQuantity`. src/server/msp.ts:459 exports it
      from a "use server" module (=> public HTTP endpoint) with no identity check; only ever called
      internally by attachWorkspace/detachWorkspace. Remove `export` so it is module-private.
- [ ] F2 (Medium) Client-controllable IP fallback. src/server/rateLimit.ts:28 clientIp falls back to
      the left-most (client-supplied) x-forwarded-for entry. Trust only x-real-ip (Vercel-injected),
      else "unknown". Remove the duplicated inline IP derivation in src/app/api/auth/demo/route.ts
      and use the shared helper.
- [ ] F3 (Medium) Missing Content-Security-Policy. Add to next.config.js headers():
      default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com;
      style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;
      connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com;
      frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'.
      ('unsafe-inline' in script-src is required for App Router inline hydration; JSON-LD is data.)
      Verify the app renders and Vercel Analytics loads with no functionality-breaking CSP violations.
- [ ] F4 (Low) Tenant exports lack no-store. Add `Cache-Control: private, no-store` to csvResponse
      (src/server/csv.ts:16), the PDF response (export/report/route.ts), and the PowerShell response
      (export/remediation/route.ts). Leave the static DPA export's public,max-age=3600 as is.
- [ ] F5 (Low) escapeHtml misses single quotes. src/lib/html.ts:2 add .replaceAll("'", "&#39;").
- [ ] F6 (Low) Unescaped hrefs in billing email. src/server/email.ts wrap args.invoiceUrl (~432) and
      the ctaButton href (~306) in escapeHtml(...), matching welcomeEmail.ts.
- [ ] F7 (Low) HSTS lacks preload. next.config.js append `; preload` to Strict-Transport-Security.
- [ ] F8 (Low) .gitignore misses .env.* variants. Replace `.env` + `.env*.local` with `.env*` plus
      `!.env.example`.
- [ ] F9 (Low) Duplicated validateReturnTo. src/app/auth/sign-in/route.ts:9 import the shared
      validateReturnTo from ~/server/auth/session and delete the local copy.
- [ ] F10 (Low) connectAdobe echoes provider error text. src/server/actions.ts (~628) use the same
      generic message pattern as connectSaasConnector.
- [ ] F11 (Low) attachWorkspace TOCTOU on tenants.mspAccountId. src/server/msp.ts (~393) make the
      bind a guarded update (SET msp_account_id WHERE id = :tenant AND msp_account_id IS NULL) and
      fail if 0 rows changed.

## Follow-ups (F12-F14 DONE this session; F15 still open)
- [x] F12 AUTH_SECRET blast radius: added optional DATA_ENCRYPTION_KEY (src/env.js). crypto.ts derives
      the AES key from it when set, else AUTH_SECRET (byte-identical when unset, zero migration).
      decryptSecret tries the primary key then a legacy AUTH_SECRET-derived key so a rotation to a
      DISTINCT key is zero-downtime (old rows decrypt via fallback, re-encrypt lazily). Rotation test
      added. To actually reduce blast radius: set a distinct DATA_ENCRYPTION_KEY in prod env.
- [x] F13 Durable rate limiting: new rate_limits table + rateLimitDurable (Postgres atomic fixed-window
      upsert, fails open on DB error). Replaced the in-memory limiter on all abuse-prone paths
      (captureEmail, invite, resend, CSV trial, demo, sync); removed the dead in-memory limiter. Tests
      added. PROD: run npm run db:push (adds rate_limits); prod RLS script loops all public tables so
      the app_all policy auto-covers it on next run.
- [x] F14 Demo workspace write-guards: added isDemo guards to setFindingStatus, bulkSetFindingStatus,
      updatePrice, importPrices, setInactiveDays, setRenewalDate, setLeakAlerts, setMonthlyReport,
      setTrialReminders, setCurrency, triggerSync (shared DEMO_READONLY message).
- [ ] F15 Domain-JIT auto-join audit event (access.ts joins on email-domain match with no audit entry).

## Acceptance criteria
1. F1-F11 implemented exactly as scoped; every changed line traces to a listed item.
2. npm run test passes and npx tsc --noEmit is clean.
3. npm run build succeeds; app renders + Vercel Analytics loads under the CSP.
4. syncMspQuantity no longer exported; attach/detach still compile and call it.
5. No secrets committed; .gitignore blocks all .env* except .env.example.
6. Separate code-reviewer agent confirms each fix is correct with no regressions.

## Review section - DONE (uncommitted, awaiting owner commit)
- 4 parallel reviewers found no critical/high exploitable defects. Codex CLI (codex-cli 0.142.5,
  sandbox workspace-write) implemented F1-F11. Codex's own tsc/test run failed on a macOS keychain
  sandbox error (SecItemCopyMatching -50), so gates were re-run outside the sandbox.
- Gates GREEN: npx tsc --noEmit clean; vitest 322/322 passing; next build exit 0 (80 pages,
  middleware emitted). Live header check on `npm run start`: CSP, HSTS(+preload), X-Frame-Options,
  nosniff, Referrer-Policy, Permissions-Policy all served; homepage renders under the CSP.
- Independent feature-dev:code-reviewer verdict: all 11 fixes CORRECT and complete, zero new
  regressions. Specifically stress-tested clientIp caller compatibility, CSP vs inline scripts /
  Vercel Analytics / self-hosted geist fonts, attachWorkspace transaction atomicity + rollback,
  and that nothing external imports the now-private syncMspQuantity.
- Files changed (12): .gitignore, next.config.js, src/app/api/auth/demo/route.ts,
  src/app/api/export/remediation/route.ts, src/app/api/export/report/route.ts,
  src/app/auth/sign-in/route.ts, src/lib/html.ts, src/server/actions.ts, src/server/csv.ts,
  src/server/email.ts, src/server/msp.ts, src/server/rateLimit.ts.
- Not committed (repo workflow: owner commits). The 4 follow-ups above (AUTH_SECRET split, durable
  rate limiting, demo write-guards, JIT-join audit) remain open, needing a product/infra decision.

---

# Hardening + content wave (2026-07-02) - DONE (pushed 34757b0..ec8a4e4; live-verified)
# ms_connections_mode_columns_check applied to prod Supabase (project tomugclophxlmnzrrcxp)
# via MCP migration add_ms_connections_mode_columns_check on 2026-07-02; verified in
# pg_constraint; 2 existing rows, 0 violations pre-apply. No owner DB action remaining.

Owner asked to: clean up stale drizzle/*.sql; add msConnections mode CHECK; add
sync-vs-disconnect integration test; build per-rule waste explainer pages, more
comparison pages, and a case-study-style page (built honestly as a labeled demo
walkthrough; a real case study needs a real customer).

## Acceptance criteria
- [ ] drizzle/ generated SQL removed; docs state db:push is the migration workflow
- [ ] CHECK constraint: msConnections mode='byo' implies credential cols set,
      'managed' implies null; db:push applied locally; prod step documented
- [ ] Prod deploy: run npm run db:push against prod (DATABASE_URL set) to add
      ms_connections_mode_columns_check; additive only - all write paths
      (connectMicrosoftByo in actions.ts, managed callback, backfill script)
      already satisfy the invariant, so existing rows pass
- [ ] Integration test: disconnect/delete tenant while a sync run is mid-flight
- [ ] 6 waste-rule explainer pages grounded in lib/rules.ts + README
- [ ] 2 new comparison pages (M365 admin center, Excel tracking) - honest, grounded
- [ ] Demo-walkthrough report page, clearly labeled synthetic
- [ ] New pages wired into sitemap, llms.txt, footer
- [ ] check + test + build green; evaluation pass; commit + push

---

# App page-by-page review (2026-07-01) - DONE (uncommitted, awaiting owner commit)

Owner asked for an individual review of every page under /app (and auth pages),
beyond the earlier code-level dashboard review. Method: 3 agents, each reviewing
its pages BOTH in source and live-rendered in the demo workspace (dev server
localhost:63633, curl + demo session).

## Acceptance criteria
- [x] Every page reviewed with a per-page verdict: overview, findings, licenses,
      users/[id], ai-costs, shell/nav; settings + 9 connector pages; account,
      billing, msp, portfolio, connect, connect/csv, auth/sign-in + callback
- [x] Confirmed P1/P2 findings fixed (BP1, CP1, SP1, BP2, BP3) and P3s too
      (BP4, CP2, CP3, SP2 parity test); all 9 items shipped
- [x] check + test + build green after fixes (315 tests); reviewer evaluation of the
      fix diff: all 9 criteria pass, zero findings

## Review section (result)
- 1 P1: /app/account permanently broken for demo visitors (dead-end error with advice that
  can never work) - the worst possible page for a prospect evaluating via demo. Fixed with a
  demo-workspace card (billing-page pattern); live-verified.
- 4 P2 fixed: findings rule pills now compose with the Resolved view; Adobe failed-sync
  callout parity; onboarding permissions link now goes to /security for everyone; /app/msp
  owner-gated like billing.
- 4 P3 fixed: /app/msp flag-off explanatory card instead of silent redirect; licenses page
  filters shelfware-exempt sentinel SKUs like Overview; neutral loading skeleton; new
  CONNECTORS<->CONNECTOR_GUIDES parity test.
- Everything else verdict clean across all 22 pages (role gating, demo guards, entitlement
  states, plans figures, returnTo allowlist, attach/detach guards, guide links).

## Findings

### Settings + 9 connector pages (agent done; source-level, live curl unavailable to it)
- [ ] SP1 (P2): adobe/page.tsx:94-97 lacks the failed-sync callout SaasConnectorPage.tsx:155-162
      shows for every other connector; port the lastSyncStatus === "failed" block
- [ ] SP2 (test): assert every SaasProvider has both a CONNECTORS and CONNECTOR_GUIDES entry
- Rest verdict: clean (role gating mirrors server, demo guards consistent, guide links resolve,
  DangerZone copy matches actual teardown behavior)

### Core data pages + shell (agent done; source-level)
- [ ] CP1 (P2): findings/page.tsx rule pills computed from activeRows only; shown during
      show=resolved with wrong counts, and filterHref(rule) drops show=resolved (silent view
      exit). Fix: preserve showResolved in filterHref + recount pills from current status set,
      or hide pills in resolved view.
- [ ] CP2 (P3): licenses/page.tsx does not filter isShelfwareExempt SKUs; Overview does.
      Apply same filter (or document why not).
- [ ] CP3 (P3 polish): shared (dash)/loading.tsx is Overview-shaped for all routes; make neutral.
- Verdict: overview, licenses (post-fix), users/[id], ai-costs, shell/nav all clean.

### Account/billing/msp/connect/auth (agent done; BP1+CP1 live-confirmed by orchestrator)
- [ ] BP1 (P1): /app/account permanently broken for demo users (withAuth() null user; error
      copy suggests re-sign-in which never helps). Fix: demo-aware branch like billing/page.tsx.
- [ ] BP2 (P2): OnboardingEmptyState "See the read-only permissions first" duplicates the
      Microsoft tile href, gated on deployment-wide demoEnabled. Point at /security or remove.
- [ ] BP3 (P2): /app/msp shows create-form + billing actions to viewers/admins; billing page
      gates on owner. Server re-verifies (not a security hole) but UI should gate like billing.
- [ ] BP4 (P3): MspCard CTA chain dead-ends when mspEnabled() false (/app/msp silent redirect
      to /app). Show explanatory card instead of silent redirect.
- Verdict: plans figures consistent, entitlement state machine coherent, returnTo allowlist
  solid, portfolio attach/detach guarded, connect + csv pages clean.

## Fix wave (implementation)
- [ ] BP1, CP1, SP1, BP2, BP3 (bugs/P2) + CP2, CP3, BP4, SP2 (P3/polish/test)

---

# Growth features wave (2026-07-01) - DONE (uncommitted, awaiting owner commit)

Owner asked to build all three deferred recommendations.

## Acceptance criteria
- [x] /de/trust-center and /de/dpa server-render German content; hreflang alternates on all
      four pages (en/de/x-default); language switch navigates between URLs; German metadata
      (views simplified to server components; verified live: canonical + reciprocal alternates)
- [x] /roi standalone calculator page (restored RoiCalculator + roiMath + tests from git
      history) with SEO copy and CTA; /compare/powershell-audit comparison page grounded in
      real product capabilities; both linked from footer
- [x] Founder/MVP trust strip visible on home + security pages (text-only, no invented assets)
- [x] sitemap.ts + llms.txt updated for all new routes (/de/dpa low priority)
- [x] check + test + build green (311 tests, 80 static pages); independent reviewer pass:
      3 findings (dead #sample-tenant anchor on new pages, DE trust-center linking EN /dpa,
      breadcrumb referencing nonexistent /compare) - all three fixed and verified live in the
      dev server; all other criteria passed explicitly

## File ownership (parallel agents)
- Agent G: trust-center/*, dpa/*, new de/ routes. No sitemap/layout edits.
- Agent R: roi/, compare/, restored src/components/RoiCalculator+roiMath, (marketing)/layout.tsx footer
- Agent F: (marketing)/page.tsx + security/page.tsx only
- Orchestrator: sitemap.ts, llms.txt, gates, final review

---

# Full review pass 2 (2026-07-01) - DONE (uncommitted, awaiting owner commit)

Goal: completely review the codebase and all pages; fix bugs; improve what exists;
add high-value features. Prior review (2026-06-23) already implemented and merged.

## Acceptance criteria
- [x] Every area reviewed by a dedicated agent: server core, API routes, dashboard app,
      marketing pages, lib/config/schema
- [x] All confirmed P1/P2 bugs found by review are fixed
- [x] Top improvement/feature items implemented (selected by impact)
- [x] npm run check (lint + tsc), npm run test, npm run build all green (299/299 tests)
- [x] Separate code-reviewer evaluation pass on the final diff finds no new P1/P2 issues
      (all 12 criteria passed explicitly)

## Review section (result)
- Backend was clean: server core, API routes, lib/schema/config agents found zero P1/P2 bugs
  (prior 2026-06-23 hardening held). Dashboard: 1 P2 (PriceEditor). Marketing: 2 P1 content
  defects + P2/P3 stack. Everything actionable was fixed; see Wave F list above.
- Shipped: wos-session cookie disclosure, connector-list parity (home/msp/llms.txt),
  VAT copy fix, sitemap/noindex fix, dead-anchor fix, dash sweep, signInPath consistency,
  PriceEditor re-sync fix, fmtAgo clamp, /api/sync paywall+ratelimit+origin+audit,
  same-origin on 4 billing POSTs, bulk Reopen on findings, PriceAccuracyCard on findings,
  AI-spend 90-day gap healing (+2 new test files, 299 total).
- Renewal-card deep link (D3) intentionally NOT done: card figure spans all rules, a ?rule=
  filter would contradict the displayed number.
- Owner follow-ups: impressum HRB number (required before launch, DDG s.5); consider
  German-indexable /de trust-center+DPA with hreflang, comparison//roi content pages,
  founder/MVP trust strip on home+security.
- NOT committed (per repo workflow, owner commits).

## Plan
- [x] Baseline: check + test green on main (lint clean, tsc clean, 291/291 tests)
- [x] Wave R (parallel reviews): 5 agents done. Server core, API, lib/config: clean.
      Dashboard: 1 P2. Marketing: 2 P1 + several P2/P3.
- [x] Consolidate findings into fix list (P1 bugs, P2 correctness, P3 polish, features)
- [ ] Wave F (2 parallel impl agents, RUNNING):
      Agent M: cookies wos-session (M1) + spacing (M8), homepage connectors+JSON-LD (M2/M11),
      dead #request-scan anchor (M3), sitemap + noindex (M4), VAT copy (M5), dash sweep (M6),
      llms.txt count/pages (M9), MSP AI consoles (M10), signInPath consistency (M12)
      Agent B: PriceEditor dirty-state bug (D1), fmtAgo clamp (L1), /api/sync entitlement+
      rateLimit+origin+audit (A1/A2), isSameOrigin on billing POSTs (A3), bulk Reopen (D2),
      renewal deep link (D3), findings price nudge (D4), AI-spend gap healing (S1)
- SKIPPED (owner input needed): impressum HRB number (M7) - required before launch per DDG s.5
- DEFERRED (recommendations, not built): German-indexable /de pages + hreflang; comparison/ROI
  content pages; founder/MVP trust strip; msConnections CHECK constraint (L3); sync-vs-disconnect
  integration test (S2); drizzle/*.sql cleanup (L2)
- [ ] Final gate: check + test + build + independent code-reviewer pass
- [ ] Document review section here

## Findings

### API routes (agent done) - no P1/P2 bugs; improvements:
- [ ] A1 (P2-ish): POST /api/sync has no entitlement gate (expired trial can trigger costly Graph sync; exports gate 402). Confirm intent or gate it.
- [ ] A2: rateLimit() on POST /api/sync and /api/billing/checkout (auth/demo already has it)
- [ ] A3: apply isSameOrigin to all state-changing POSTs (billing checkout/portal/msp, sync) for consistency (SameSite=Lax already covers practical CSRF)

### Server core (agent done) - no P1/P2 bugs; improvements:
- [ ] S1: syncAiSpend fixed 7-day backfill window leaves a gap after >7-day provider outage; widen lookback when gap exceeds window
- [ ] S2: integration test for sync mid-flight vs tenant disconnect/delete (test-only)
- [ ] S3: msalApps cache + rateLimit buckets are per-instance in-memory (fine on Vercel today; note only)

### Dashboard app (agent done)
- [ ] D1 (P2 BUG): PriceEditor in src/components/workspace/PriceRow.tsx never re-syncs local value after save + router.refresh(); typing "14.9" leaves dirty=true vs canonical "14.90" -> Save re-enables while "Saved" shows. Fix: key={initial} at call sites in licenses/page.tsx (RenewalDateForm pattern) or re-sync-on-render.
- [ ] D2: bulk "Reopen selected" action on findings table (only Acknowledge exists)
- [ ] D3: renewal card on Overview should deep-link findings with ?rule= preset
- [ ] D4: "Set your actual prices" nudge missing on Findings page (present on Overview/Licenses)

### Lib/schema/config (agent done) - no P1/P2 bugs; improvements:
- [ ] L1: fmtAgo (src/lib/format.ts:55) no negative-duration guard; clamp to 0 ("just now")
- [ ] L2: stale drizzle/*.sql migration files predate current schema and mislead contributors (db:push is real workflow); delete or document as inert
- [ ] L3: msConnections mode='byo' column invariant not DB-enforced (single write path today; low urgency)

---

# Review implementation (2026-06-23) — branch: harden/review-implementation — IN PROGRESS

Implementing the full prioritized task list from the multi-agent review. Dependency-ordered
waves; verify (typecheck + tests) between waves; commit per wave. Baseline (main): tsc clean,
228/228 tests. Marketing/strategy content tasks (#2/#3/#16/#17) DEFERRED to the very end.

NOTE — #8 RLS is ALREADY in prod via idempotent scripts/db-*.sql (deny-all + licensemeter_app
app_all policy, loops every table). The review's "no RLS" flag was outdated (scanned only src/).
Action: verify coverage + document; NOT rewiring the connection layer to per-tenant GUC RLS.

## Wave 0 — Foundation — DONE (tsc + 234 tests green; db:push applied)
- [x] #22 unique idx subscriptions.stripeSubscriptionId/Customer; `>=0` checks on 5 money cols
- [x] #23 `lower(email)` expr index + lower() match in /api/unsubscribe
- [x] #11 crypto AAD `tenantId:provider:column` on all encrypt/decrypt sites + crypto.test.ts (6 tests)
- [x] #8 RLS verified: scripts/db-*.sql loop ALL public tables (pg_tables) -> new tables auto-covered; intentional app-layer isolation + deny-all backstop. No code change.

## Wave 1 — Billing integrity & data lifecycle — DONE (tsc + lint + 237 tests green)
- [x] #5 entitlement `incomplete` state (real branch + tests) -> re-pay CTA in BillingActions/Banner/Paywall
- [x] #15 collapsed dup portal buttons -> "Manage or cancel subscription"; portal route warns if config id unset
- [x] #6 teardownTenantBilling returns {subscriptionCancelFailed}; disconnectTenant ABORTS delete on cancel failure
- [x] #7 teardownTenantWorkosOrg (best-effort); #13 durable notifyOps audit (auditLog cascades)
- [x] #10 getOrCreateCustomer conditional update + re-read; #25 try/catch -> stripe_unavailable 502 (+client copy)
- [x] #27 delete warning now active/trialing/past_due; #30 sendWorkspaceDeleted to other admins; #14 fresh signup clears unsubscribedAt; #29 verified MspCard shows on 409

## Wave 2 — Connectors / sync / security — DONE (tsc + lint + 237 tests green)
- [x] #12 salesforce nextRecordsUrl origin re-check; #26 runSync STALE_RUN_MS 6->20min
- [x] #24 cronAuth helper (notifyOps on unset secret, secure default) + cron/sync notifyOps parity
- [x] #20 SaaS connector pages: SyncNowButton + ConnectPoller on first-sync-pending; guide-link consistent
- [x] P3: getAllPages MAX_PAGES cap; msalApps LRU+TTL; Adobe orgId charset+encodeURIComponent; grantedTid GUID check

## Wave 3 — UX / a11y — DONE (tsc + lint + 237 tests green)
- [x] #19 remediation export honors ?rule= (was hardcoded 6/13; real bug) -> isWasteRule allow-list
- [x] #18 SpendChart NOT dead (already rendered in ai-costs/page.tsx) -> only added a11y
- [x] #28 progressbar on UtilizationBar; sr-only data tables on charts; WorkspaceSwitcher disabled; MobileNav inert; nav aria-labels; faq dl labelledby; sidebar-soft contrast; opacity-faint text fixed; error page danger treatment
- [x] EmptyState primitive + applied to findings empty states

## Wave 4 — Tests — DONE (tsc + lint + 283 tests + build green)
- [x] #9 webhook money-path: 17 integration tests (in-mem PGlite + mocked stripe), no prod change
- [x] verifyEntraIdToken (issuer/aud/alg pinning, jose mocked) + isSameOrigin tests
- [x] priceIdFor<->planFromPriceId round-trip + parsePlanString rejection cases (34 tests total)

## Wave 5a — Marketing (implemented) — DONE (tsc + lint + 283 tests + build green)
- [x] #2 hero repositioned around cross-vendor offboarding leak (MS = connection method); demo figures only
- [x] #3 removed customer-count social-proof stat (deleted marketingStats.ts); trust rests on real signals; no founder
- [x] #21 finance front door: secondary "upload a license CSV" CTA into the existing zero-consent path
- [x] AI-connector distinction: "Connect via API" vs "CSV import" pills driven by connectors.ts `kind`
- [x] TRIAL_DAYS moved to client-safe plans.ts; "14-day" copy derived everywhere in marketing/components

## Wave 5b — MSP packaging (#16) — Phase 1 done + Phase 2 foundation (inert); #17 held
Decisions: EUR50/tenant flat + >1.000-seat guardrail; Phase 1 + start Phase 2; #17 hold.
- [x] #16 P1: pricing published on /msp + /pricing (EUR50/tenant, EUR500/yr, >1.000-seat guardrail), from plans.ts constants
- [x] #16 P2 foundation (INERT, flag-gated via mspEnabled()): mspAccounts table + tenants.mspAccountId;
      STRIPE_PRICE_MSP_TENANT env; pure mspEntitlementOf + tests; access.ts inherits entitlement when mspAccountId set
      (single-tenant path byte-identical, verified). 292 tests, tsc/lint/build green.
- [x] #16 P2 FULLY IMPLEMENTED (2026-06-23): MSP account lifecycle (create/attach/detach, owner-identity gated,
      one-account-per-owner DB-unique backstop), Stripe quantity subscription (checkout/portal routes + qty sync on
      attach/detach), webhook MSP branch (mirrors to mspAccounts, tenant path byte-identical), entitlement inheritance,
      /app/msp portfolio UI + nav. Live Stripe prices created (prod_Ul73xkc5hlFxy8: monthly price_1TlapF…, annual
      price_1TlapG…); env vars STRIPE_PRICE_MSP_TENANT_MONTHLY/_ANNUAL set locally (set in Vercel prod too).
      Independent review done; 5 findings fixed (owner-unique, webhook quantity ownership, mspEnabled guards,
      customer-match before cancel, fresh account read). tsc+lint+303 tests+build green.
- [ ] #17 expansion: RECOMMENDED an "AI Cost Visibility" add-on (held by owner; on record, not built).

## MSP deploy steps (owner)
- Set STRIPE_PRICE_MSP_TENANT_MONTHLY + STRIPE_PRICE_MSP_TENANT_ANNUAL in Vercel prod env (the live price ids above).
- Apply the schema to prod (db:push): mspAccounts new columns + owner-unique indexes + tenants.mspAccountId.
- The existing Stripe webhook endpoint already handles MSP events on the same URL (discriminated by metadata.mspAccountId) — no new endpoint needed.

## Status: branch harden/review-implementation — 9 commits, all gates green, NOT pushed.

## Final gate
- [ ] npm run check + test + build; separate code-reviewer pass

---

# Workspace-first onboarding (2026-06-22) — IN PROGRESS

Decouple sign-in from connecting a service. After WorkOS sign-in the user lands
on the dashboard (never a forced connect gate); an empty workspace shows a
polished onboarding empty state that nudges connecting the FIRST service (any
connector, not just Microsoft). Trial starts on first connect. Colleagues from a
verified corporate email domain auto-join the same workspace (app-level domain
JIT; WorkOS-native domain JIT needs DNS-verified domains so it does not fit
instant self-serve — reserve WorkOS Organizations for enterprise SSO later).

## Deliverables
- [ ] Auto-provision a workspace on first WorkOS sign-in (resolveWorkos: no
      membership -> create personal workspace + owner membership, return its ctx).
      Domain-JIT: verified corporate email -> join existing same-domain workspace
      that allows domain-join; consumer/unverified domain -> personal workspace.
- [ ] Remove the forced /app/connect redirect (auto-provision means ctx is never
      null for a signed-in user). /app/connect stays as the Microsoft setup page.
- [ ] Trial starts on FIRST connector connect, not sign-up: entitlement treats a
      workspace with no trialStartedAt as full-access "not started"; the connect
      actions (MS managed/BYO, scan, CSV, adobe, saas) stamp trialStartedAt once.
- [ ] Microsoft becomes a connector ADDED to the current workspace (admin-consent
      binds the granted tid to the workspace the user is in, not a new tenant),
      with the unique-tid steal guard preserved.
- [ ] Polished onboarding empty state on /app: connector grid (Microsoft featured,
      Adobe/Zoom/Atlassian/Salesforce/ChatGPT/Claude + CSV + sample-data), value
      prop, clear primary action. Shown when the workspace has no connector/data.
- [ ] Schema: tenants.domain (claimable domain) + allow_domain_join flag for JIT;
      apply to prod before deploy. Backfill domain for existing workspaces.
- [ ] Trial-abuse guardrails on the personal-workspace path (consumer-domain list,
      rate-limit provisioning).

## Acceptance criteria
- New user (gmail) signs in -> lands on /app dashboard empty state, NO forced
  connect gate, NO trial countdown yet. Connects any one service -> data appears,
  trial countdown begins (14 days from that moment).
- Second user at the same verified corporate domain signs in -> joins the SAME
  workspace as their colleague (not a new empty one). Consumer-domain users get
  separate personal workspaces.
- Connecting Microsoft adds it to the current workspace (no duplicate workspace);
  unique-tid steal guard still blocks claiming another workspace's tenant.
- Existing connected customers: unchanged (already have consentedAt/trialStartedAt).
- Gates green (lint/tsc/tests/build) + independent review; prod schema migrated.

## Decisions
- Domain-JIT mechanism: app-level verified-email-domain match (not WorkOS DNS
  domains) for instant self-serve. workos_org_id stays staged for future SSO.
- Trial anchor: trialStartedAt set on first connect; null = not-started = full.

## Status — DONE (pending PR), prod schema migrated
All deliverables implemented + gates green + independent review (fixes applied:
provisionWorkspace now transactional; allow_domain_join defaults off; BYO trial
stamp uses DB coalesce). Prod migrated: tenants.domain + allow_domain_join
(+ index, default off) via Supabase MCP (project tomugclophxlmnzrrcxp).

### Deferred (low-severity, noted by review)
- Consent callback resolves the current workspace from the WORKSPACE_COOKIE at
  callback time, not consent-start: a multi-workspace user who SWITCHES workspace
  mid-consent could bind Microsoft to the wrong (own) workspace. Fix later by
  storing tenant_id on the consent_states nonce. (New users have one workspace =
  no drift.)
- Instant scan stamps trialStartedAt at workspace creation rather than on scan
  success (other paths stamp on confirmed connect). Minor; retry-safe via coalesce.
- Domain backfill for existing prod workspaces intentionally skipped (they stay
  allow_domain_join=false / domain=null, so no surprise auto-joins).

---

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

### Phase A — DONE (commit 541bf43, 2026-06-22)

Flag-gated WorkOS login landed and verified. `AUTH_PROVIDER` (default `entra`) routes
`auth()` to the MSAL session reader or the WorkOS bridge. Identity lives in new columns
(`memberships.workos_user_id`, `tenants.workos_org_id`); the Entra `tid` stays the connector key
(no clobber). `resolveAccess` split into `resolveEntra` (unchanged) + `resolveWorkos` (match by
workos_user_id or migration-safe verified-email link).

- **Gates:** `tsc` clean · `next build` green · 223/223 tests · independent code-review (2 findings
  fixed: stale-invite resurrection in the email arm; CSV-trial guard against empty tid/oid) · dev
  smoke under `AUTH_PROVIDER=workos` boots + redirects correctly.
- **Default behavior unchanged:** with the flag unset, entra path is byte-identical.

**Deferred to Phase B/C (known dead-end):** a brand-new WorkOS user with no membership currently
reaches `/app/connect` but cannot complete onboarding — the admin-consent connect flow
(`/api/connect/start` + `callback`) still binds via `session.user.oid`, which is empty in workos
mode. Wiring WorkOS-user onboarding (managed admin-consent + the BYO path) is exactly Phase B/C.

**Live OAuth round-trip** (Google/MS → dashboard) still needs a manual browser pass with the flag
on; the structural smoke test (boot + redirect, no `/[object Object]`) passed.

### Phase B — DONE (2026-06-22)

WorkOS-mode managed onboarding now works end-to-end; the Phase A dead-end is closed. The
admin-consent flow is identity-agnostic: `consent_states` carries `workos_user_id` (and `oid`/`tid`
are now nullable, entra-only), `/api/connect/start` accepts either identity, and the callback binds
the membership by whichever the nonce holds — so a WorkOS user reaches their dashboard after consent
(resolveWorkos matches the new `workos_user_id`).

- **Gates:** `db:push` applied · `tsc` clean · `next build` green · 223/223 tests · code-review PASS
  on logic (entra path unchanged, dead-end closed, onConflict sound, guards correct).
- **Schema deploy:** this repo syncs schema via `drizzle-kit push` (the `0000–0006` SQL files are
  stale history — the billing work already drifted them). Changes here are **columns only on
  existing tables** → no new `app_all` RLS policy needed. Run `db:push` against prod **before**
  flipping `AUTH_PROVIDER=workos`; until then the new code is inert in prod (flag-gated).
- **Deferred:** WorkOS Organization creation + domain-JIT auto-join (workspace↔org mapping) — not
  required for onboarding to work (resolveWorkos keys on `workos_user_id`); layer in later. The
  `tenants.workos_org_id` column is staged and currently unused.

### Phase C — DONE (2026-06-22)

Dual-path Microsoft connector landed; `tenants.tid` is now nullable and the
Microsoft connection lives in its own `msConnections` table.

- **Schema:** `tenants.tid` nullable with a partial-unique index; new
  `ms_connections` table (`mode` managed|byo, `tid`, BYO columns
  `app_client_id`/`cred_type`/`secret_enc`/`cert_thumbprint`/`secret_expires_at`/
  `last_verified_at`/`last_verify_error`), `mode` check + a unique index on `tid`
  (one Microsoft tenant per workspace, the atomic backstop). `db:push` applied.
- **Token branching:** `MsCredential` (managed / byo-secret / byo-cert) drives
  `buildApp`/`acquireToken` in [msGraph.ts](src/server/graph/msGraph.ts); MSAL
  apps are cached by a credential fingerprint so a rotated BYO secret never
  reuses a stale client. `resolveMsCredential`/`msGraphClientForTenant`
  ([msConnection.ts](src/server/graph/msConnection.ts)) resolve the per-workspace
  credential (decrypting via the existing AUTH_SECRET AES-256-GCM helper) with a
  managed fallback to `tenant.tid` for pre-Phase-C rows; `runSync` uses it.
- **BYO path:** client secret AND certificate (paste PEM private key + cert;
  thumbprint derived server-side via `X509Certificate`) from launch, both stored
  AES-256-GCM in `secret_enc`. `connectMicrosoftByo` validates inputs, runs
  test-connection, then writes the connection + tid binding in one transaction
  (clean catch on the unique-tid steal). `disconnectMicrosoft` removes both in a
  transaction. Managed admin-consent callback now writes an `mode='managed'` row.
- **test-connection (roles claim):** `verifyMsCredential` acquires an app-only
  token, base64url-decodes the JWT `roles` claim, and returns a per-permission
  green/red checklist against [scopes.ts](src/lib/scopes.ts); the connect action
  blocks save (with the missing scopes) when consent is incomplete and maps
  AADSTS auth failures to clean, non-leaking messages.
- **UI:** [settings/microsoft](src/app/app/(dash)/settings/microsoft/page.tsx)
  tile with managed one-click as the default/recommended option and BYO behind an
  "Advanced — bring your own app registration" toggle
  ([MicrosoftConnectForm.tsx](src/components/workspace/MicrosoftConnectForm.tsx),
  with the cred-type switch + checklist). Microsoft added to the Settings
  connector list.
- **Lokka end-to-end verification (global Graph rule):** confirmed against the
  real "Ugur Koc Lab" tenant (tid ffc10f05-…) that an app-only client-credentials
  token's `roles` claim reflects granted application permissions —
  `get-auth-status` decoded roles = User.Read.All / AuditLog.Read.All /
  Reports.Read.All / Directory.Read.All, with LicenseAssignment.Read.All and
  ReportSettings.Read.All absent. Live probes proved the present→works /
  absent→403 contract: `GET /subscribedSkus` → 200 (Directory.Read.All present),
  `GET /admin/reportSettings` → 403 S2SUnauthorized (ReportSettings.Read.All
  absent). This is exactly what `verifyMsCredential` keys on.
- **Secret hygiene:** grep + review — secrets/keys stored only as
  `encryptSecret(...)`; audit detail carries only `{ mode, credType }`; no
  console/notifyOps logging of credentials; `verifyMsCredential` logs only
  `err.message`; the action returns only `{ ok, error?, checklist }`.
- **Gates:** `tsc` clean · `next lint` clean · 223/223 tests · `next build`
  exit 0 (71/71 pages, /app/settings/microsoft present) · independent
  `feature-dev:code-reviewer` pass (3 of 5 findings fixed: connect/disconnect now
  transactional + unique-tid backstop, secret-safe logging; the cert-`x5c` and
  "BYO tid differs" findings assessed as non-issues for standard cert auth /
  intended switch behavior).
- **Note (handoff to Phase D):** test-connection currently checks the roles claim
  only; the live Reports-API probe, secret-expiry warnings, graceful per-scope
  degradation at sync time, and nightly scheduled sync for both modes remain
  Phase D. `last_verify_error` column is staged but only written on success/clear
  so far.

### Phase D — DONE (2026-06-22)

Test-connection probe, secret lifecycle, and both-mode scheduled sync.

- **Live Reports probe:** `verifyMsCredential` now also calls one real Reports
  endpoint (`getOffice365ActiveUserDetail(period='D7')`) when Reports.Read.All is
  granted, returning `reportsProbe` (the token's roles claim can't reveal Reports
  quirks). A failed probe is surfaced as a non-blocking `warning` on connect, not
  a block. **Lokka-verified:** the probe call returns 200 (CSV stream) app-only
  on the real "Ugur Koc Lab" tenant.
- **Graceful degradation extended:** the app-only `MsGraphClient.listUsers` now
  degrades on 401/403 (e.g. revoked AuditLog.Read.All) the same way the non-P1
  path does — drops sign-in data and falls back to usage reports rather than
  failing the run. Reports/Copilot/reportSettings already degrade to warnings;
  subscribedSkus + the users list stay correctly fatal (test-connection blocks
  connect without those scopes anyway).
- **Secret lifecycle:** a successful sync clears `lastVerifyError` and stamps
  `lastVerifiedAt`; an app-only auth failure (`isAppAuthError`, AADSTS codes only
  — not the bare word "certificate", per review) writes a clean, non-leaking
  `lastVerifyError` marker without crashing the run (the nightly cron catches
  per-tenant). The connector page shows a pre-expiry amber warning (≤14 days), an
  expired/error red banner, and prompts a re-enter.
- **Nightly sync, both modes:** the existing cron gates on `tenants.consentedAt`,
  which both managed and BYO set, so both modes sync with no cron change.
- **Acceptance:** missing scope → specific red row + blocked connect; wrong
  secret → specific non-leaking error + `lastVerifyError`, no 500; expired-secret
  nightly run marks the connection and continues.

### Phase E — DONE (2026-06-22)

- **App-reg script:** [scripts/setup-byo-connector.ps1](scripts/setup-byo-connector.ps1)
  — customer-facing, creates a single-tenant read-only app with exactly the
  required permissions, **grants admin consent**, and prints Tenant/Client ID +
  secret (or registers a certificate with `-UseCertificate`).
- **Docs:** new `microsoft` guide at `/connectors/microsoft`
  ([connectorGuides.ts](src/lib/connectorGuides.ts)) covering managed one-click,
  BYO via script, the manual portal route, the exact permission set, and the
  least-privilege rationale; linked from the connector page's Advanced section.
- **No drift:** [scopes.test.ts](src/lib/scopes.test.ts) asserts the script's
  `$connectorRoles` equals `CONNECTOR_SCOPES` byte-for-byte (the in-app ScopeList
  already renders from the same source).

### Phase F — DONE (2026-06-22)

- **Backfill:** [scripts/backfill-ms-connections.ts](scripts/backfill-ms-connections.ts)
  inserts a `mode='managed'` row for every tenant with a tid and no row,
  idempotent (`onConflictDoNothing`, counts only real writes). No-op for behavior
  — `resolveMsCredential` already falls back to managed via `tenants.tid` — so no
  customer re-consents.
- **Feature flag:** `MS_BYO_ENABLED` + `byoConnectorEnabled()` ([env.js](src/env.js))
  gate both the BYO server action and the Advanced UI; managed is always
  available and unchanged when the flag is off. (WorkOS login stays gated by
  `AUTH_PROVIDER` from Phase A.)
- **DPA / subprocessors:** WorkOS added as a sub-processor in
  [dpa.ts](src/lib/dpa.ts) (EN + DE) and the /security subset, plus an
  encrypted-credential custody statement for BYO Graph secrets (EN + DE).
  **Follow-up:** the pre-signed bilingual DPA PDFs must be regenerated from
  dpa.ts and re-reviewed by counsel before publishing (see [[dpa-avv]]).
- **Gates:** tsc clean · lint clean · 224/224 tests (incl. no-drift) · build
  exit 0 (72 pages; /app/settings/microsoft + /connectors/microsoft present) ·
  independent code-review pass (3 findings fixed: regex false-positive, misleading
  P1 log line, backfill over-count).

### Verification pass (2026-06-22) — pre-PR review + fixes

Independent end-to-end verification of all phases before opening the PR to main.

- **Gates re-run green:** `next lint` clean · `tsc --noEmit` clean · 224/224 tests ·
  `next build` exit 0 (Middleware emitted, route table intact).
- **Graph contract re-verified live via Lokka** (real "Ugur Koc Lab" tenant,
  tid ffc10f05-…, app-only client_credentials): `get-auth-status` roles claim =
  the granted application permissions; `GET /reports/getOffice365ActiveUserDetail(period='D7')`
  → 200 (CSV/BOM) = the exact `probeReports` call; `GET /subscribedSkus` → 200
  (fatal directory read works); `GET /admin/reportSettings` → 403 S2SUnauthorized
  (ReportSettings.Read.All absent) = the absent→degrade contract. Confirms what
  `verifyMsCredential` and the graceful-degradation paths key on.
- **Independent `feature-dev:code-reviewer` pass.** Findings triaged and fixed:

  1. **(Critical, fixed) WorkOS-mode workspaces got zero emails.** The leak-alert
     ([runSync.ts](src/server/sync/runSync.ts)), weekly digest
     ([digest/route.ts](src/app/api/cron/digest/route.ts)) and monthly report
     ([report/route.ts](src/app/api/cron/report/route.ts)) recipient queries
     filtered `isNotNull(memberships.oid)` to mean "has signed in". In WorkOS mode
     the claimed-membership marker is `workosUserId`, not `oid`, so every owner/admin
     was excluded and `to` was empty. Changed all three to
     `or(isNotNull(oid), isNotNull(workosUserId))` — still excludes pending invites
     (neither set).
  2. **(Critical, fixed) Unconditional AuthKit middleware would 500 the site in
     entra mode.** [middleware.ts](src/middleware.ts) wired `authkitMiddleware()`
     on all non-static routes; `updateSessionMiddleware` throws on every request
     unless `WORKOS_COOKIE_PASSWORD` (≥32 chars) + a redirect URI are set. An
     entra-mode prod deploy without WorkOS env vars would have thrown on every
     page (it only passed dev smoke because `.env.local` carries WorkOS creds).
     Gated the middleware on `AUTH_PROVIDER`: entra mode now returns
     `NextResponse.next()` before touching AuthKit, restoring "flag-off = byte-
     identical entra path".
  3. **(Non-issue) Entra `auth()` not forwarding WorkOS JWT fields** — the entra
     and workos `auth()` read different cookies and are dispatched by flag; the
     entra cookie never carries WorkOS fields, so this is unreachable dead-code
     territory. Left as-is.
- **Repo hygiene:** dropped 17 tracked build/screenshot artifacts
  (`.playwright-cli/`, `output/`) that were accidentally committed and are already
  in `.gitignore`.

### WorkOS becomes the only sign-in (2026-06-22, post-review directive) — DONE

All boxes below implemented; gates green (lint/tsc/224 tests/build exit 0), dev
smoke confirmed the "Sign in" CTA → /auth/sign-in, the legacy /api/auth/signin
redirect, and the demo sample-tenant working under the WorkOS default. One
review bug fixed: the WorkOS sign-in route passed returnTo as `state`
(customState, dropped by the callback) instead of `returnTo` → fixed so the
pricing CTA lands on /app/billing.

User decision: **sign-in is WorkOS-only. No MSAL on the sign-in button. MSAL
stays only for the Microsoft connector (admin-consent / BYO) after sign-in.**
WorkOS is the default provider; entra is a flag-only opt-out. Instant-scan and
the demo sample-tenant are kept and reworked to run under a WorkOS session.

- [ ] `authProvider()` defaults to `workos` (entra only when `AUTH_PROVIDER=entra`).
- [ ] `middleware.ts` runs AuthKit unless `AUTH_PROVIDER=entra` (pass-through).
- [ ] Marketing sign-in button + CTAs (landing, pricing) gate on `signInEnabled()`
      and link to `signInPath()` (the active provider's route); button relabeled
      from "Sign in with Microsoft" to a neutral "Sign in" (WorkOS is multi-method).
- [ ] `/api/auth/signin` (entra MSAL login) redirects to `/auth/sign-in` in workos
      mode; MSAL login kept only for the entra opt-out.
- [ ] `auth()` dispatcher: workos by default, with a demo fallback (the sample
      tenant uses the entra-style session cookie even under workos).
- [ ] Sign-out works for WorkOS users AND the demo (clearSessionCookie expires the
      demo cookie too; signOutAction redirects on the non-redirecting entra path).
- [ ] Instant scan reworked for WorkOS: `/api/scan/start` + the scan callback bind
      the workspace by `workosUserId` (or entra `oid`), take the Microsoft identity
      from the delegated scan token's claims, and skip the entra identity-match in
      workos mode. `resolveScanTenant` re-parameterized (MS identity vs actor).
- [ ] Gates green (lint/tsc/tests/build) + independent review; PR updated.

### Pre-launch full-source audit + fixes (2026-06-22)

Ran a five-area parallel review (auth, onboarding, billing, sync/cron, data
lifecycle). Fixed the confirmed code bugs, the onboarding rework, and the
atomicity hardening. Gates green (lint/tsc/224 tests/build) + independent
re-review of the fixes (all six areas confirmed correct).

**WorkOS oid-parity (the recurring class — Entra `oid` wrongly assumed to mark a
claimed member):**
- [billingEmail.ts](src/server/billingEmail.ts) recipients: `or(oid, workosUserId)`
  — billing emails (trial reminder/expired, payment-failed, sub-confirmed, seat
  nudge) now reach WorkOS-only tenants. (Earlier fix had covered digest/leak/report
  but missed this file.)
- [actions.ts](src/server/actions.ts) addMember/resendInvite "already signed in"
  guards now check `oid || workosUserId` — a WorkOS member can no longer be
  re-roled via re-invite.

**Onboarding (WorkOS-default consequences):**
- CSV trial ([csv/actions.ts](src/app/app/connect/csv/actions.ts)) reworked to
  accept WorkOS users: resolves/creates the trial workspace by actor
  (`workosUserId`, `tid` null) instead of requiring a Microsoft tid; rate-limit
  keyed per-user for WorkOS; create wrapped in a transaction.
- Connect page ([connect/page.tsx](src/app/app/connect/page.tsx)) gates the
  "Grant admin consent" and "Run an instant scan" entries on
  `CONNECTOR_CLIENT_ID` / `AUTH_MICROSOFT_ENTRA_ID_ID` being configured — no more
  dead-end buttons.

**Data lifecycle / hygiene:**
- `disconnectMicrosoft` now purges `tenantUsers`/`tenantSkus`/`snapshots` in its
  transaction (Microsoft PII removed when consent is revoked; prices kept).
- `errText` ([runSync.ts](src/server/sync/runSync.ts)) logs only `err.message`
  (no full MSAL error object → no credential leakage to logs).

**Atomicity:**
- Managed consent callback ([connect/callback](src/app/api/connect/callback/route.ts)):
  nonce consumed atomically (`UPDATE … WHERE used_at IS NULL RETURNING`), and the
  tenant + msConnections + membership writes wrapped in one transaction.
- `resolveScanTenant` ([scan.ts](src/server/scan.ts)) create-branch and
  `diffFindings` ([runSync.ts](src/server/sync/runSync.ts)) wrapped in transactions.

**Config fail-fast:**
- [env.js](src/env.js): `WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/`WORKOS_COOKIE_PASSWORD`
  (≥32) are now REQUIRED when WorkOS is the live provider (the default), so a
  misconfigured deploy fails the build instead of 500-ing at runtime. Tests opt
  out via `SKIP_ENV_VALIDATION` in vitest.config.ts.

**Flagged to the user, not code-fixed (config/ops — handle at deploy):**
- Stripe webhook endpoint API version must match the SDK (`2026-05-27`) or
  `invoice.paid`/`payment_failed` silently no-op.
- In-memory rate limiter resets per serverless instance → captureEmail/demo need
  Vercel WAF or Redis for real protection.
- `AUTH_SECRET` rotation invalidates all stored connector secrets + sessions —
  needs an ops runbook.
- Lower-priority noted: `past_due` + null `paidUntil` edge case; first-sync
  consent-propagation retry can run long inside `after()`; `resolveWorkos`
  bulk-links only the active membership; PII tables (`seenSignins`,
  `consentStates`, `opsAlerts`) lack a TTL/erasure path.

### Rollback runbook

The whole feature is inert until flags flip; rollback is flag-only, no schema
revert needed (the new column/table are additive and unused by the entra path).

1. **BYO path:** unset `MS_BYO_ENABLED` (or set `false`). The Advanced UI and the
   `connectMicrosoftByo` action disappear; existing BYO connections keep syncing
   (resolveMsCredential still reads them). To fully revert a workspace, disconnect
   it (clears the row + tid) — managed re-consent restores it.
2. **WorkOS login:** unset `AUTH_PROVIDER` (back to `entra`); the MSAL login +
   tid-bound connect flow are byte-identical to pre-migration.
3. **Schema:** leave as-is. `tenants.tid` is nullable and `ms_connections` exists
   but the entra path never requires either; no destructive migration to undo. If
   a hard revert is ever required, drop `ms_connections` and re-add NOT NULL on
   `tenants.tid` only after confirming every tenant has a tid.
