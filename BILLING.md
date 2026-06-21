# Billing (Stripe) — operations runbook

LicenseMeter billing: a no-card 14-day trial, a soft paywall at expiry, Stripe
Checkout + Customer Portal, monthly and annual pricing, and EU VAT via Stripe
Tax. Everything is **feature-flagged off** until the `STRIPE_*` env vars are set,
so the app behaves exactly as before until you switch billing on.

## Model

- **No-card trial.** A 14-day trial starts when a tenant first connects
  (immutable `tenants.trialStartedAt`). No payment details required.
- **Subscribe now.** An owner can subscribe during the trial; the remaining free
  days are preserved (card on file, billed only at the original trial end, then
  auto-converts). After the trial it bills immediately.
- **Soft lock.** When the trial ends with no subscription, the dashboard stays
  viewable but exports, nightly sync, alerts, and finding detail are gated behind
  an upgrade paywall.
- **Per tenant.** One Microsoft 365 tenant = one workspace = one subscription.
  Owners manage billing. Demo workspaces are never billed.

Plans: Starter EUR 79 / Growth EUR 199 / Scale EUR 499 per month (and 10x for
annual = two months free). Over 2,500 seats is not self-serve (MSP / contact
sales).

## How it is gated

- `billingEnabled()` (`src/env.js`) is true only when **both**
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. When false, the
  entitlement engine grants full access to everyone (nothing locks).
- `taxEnabled()` is true only when `STRIPE_TAX_ENABLED="true"`. Off at launch:
  prices are flat with no VAT shown. On: Stripe Tax + VAT-ID collection + EU
  reverse charge.

## Environment variables (server only)

| Var | Description |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…`. Billing no-ops without it. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…`. Per endpoint; differs local / preview / prod. |
| `STRIPE_PORTAL_CONFIGURATION_ID` | `bpc_…` from the portal setup script. |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_ANNUAL` | Starter price ids. |
| `STRIPE_PRICE_GROWTH_MONTHLY` / `_ANNUAL` | Growth price ids. |
| `STRIPE_PRICE_SCALE_MONTHLY` / `_ANNUAL` | Scale price ids. |
| `STRIPE_TAX_ENABLED` | `"true"` once VAT-registered. Off at launch. |

## Setup (test mode first)

1. Get Stripe **test** keys (`sk_test_…`).
2. Create the catalog (idempotent):
   ```sh
   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe.ts
   ```
   Paste the six printed `STRIPE_PRICE_*` ids into your env.
3. Create the Customer Portal configuration:
   ```sh
   STRIPE_SECRET_KEY=sk_test_... \
   STRIPE_PRICE_STARTER_MONTHLY=price_... STRIPE_PRICE_STARTER_ANNUAL=price_... \
   STRIPE_PRICE_GROWTH_MONTHLY=price_...  STRIPE_PRICE_GROWTH_ANNUAL=price_... \
   STRIPE_PRICE_SCALE_MONTHLY=price_...   STRIPE_PRICE_SCALE_ANNUAL=price_... \
   APP_BASE_URL=https://licensemeter.com \
   npx tsx scripts/setup-stripe-portal.ts
   ```
   Paste `STRIPE_PORTAL_CONFIGURATION_ID` into your env.
4. Forward webhooks locally and capture the signing secret:
   ```sh
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
   Use the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET`.

## Verify (test mode)

Test cards: success `4242 4242 4242 4242`; 3DS `4000 0027 6000 3184`; failing
renewal `4000 0000 0000 0341`.

1. **Trial + soft lock** — connect a tenant, confirm full access; set
   `trial_started_at` back 14 days, confirm exports/sync return 402 and the
   paywall banner shows; dashboard still loads.
2. **billingEnabled off** — unset `STRIPE_*`, confirm nothing locks; re-set,
   gating resumes.
3. **Checkout** — owner subscribes with `4242…`; `stripe listen` shows
   `checkout.session.completed` + `customer.subscription.created`; DB
   `tenants.subscription_status='active'`, `paid_until` set, `subscriptions` row
   present; access restored.
4. **Subscribe now during trial** — confirm the Checkout session carries a
   `trial_end` (status `trialing`, no immediate charge), then auto-charges at the
   original trial end.
5. **Webhook idempotency** — `stripe events resend <id>`: no double-write.
6. **Dunning** — failing renewal card, advance the test clock: `payment_failed`
   email with `hosted_invoice_url`; access retained during the grace window;
   fix card -> active.
7. **Cancel + resubscribe** — cancel in the Portal; at period end the billing
   page offers Checkout again (reusing the customer).
8. **GDPR disconnect** — disconnect a paid test tenant; the Stripe subscription
   is cancelled and the customer deleted before the local delete; the late
   `customer.subscription.deleted` webhook no-ops.
9. **Unsubscribe** — a trial-reminder one-click unsubscribe sets
   `trial_reminders=false`; payment-failed / trial-expired / confirmation mail
   still sends.

## Go live — Phase 1 (no VAT)

1. Re-run `setup-stripe.ts` and `setup-stripe-portal.ts` with **live** keys.
2. Set the live `STRIPE_*` vars on Vercel; keep `STRIPE_TAX_ENABLED=false`.
3. In the Stripe Dashboard:
   - Register the live webhook endpoint `https://<domain>/api/billing/webhook`
     for events: `checkout.session.completed`,
     `customer.subscription.created|updated|deleted`, `invoice.paid`,
     `invoice.payment_failed`. Set `STRIPE_WEBHOOK_SECRET` to its signing secret.
   - Set subscription status after retries to **canceled**.
   - Enable customer invoice / receipt emails.
4. Update the privacy policy / DPA / subprocessor list to name Stripe (US
   transfer; Stripe retains invoices for tax-law retention even after customer
   deletion).
5. The production Supabase schema is already migrated
   (`drizzle/0006_billing.sql`) and the pre-existing live tenant is grandfathered
   via `comped_at`, so it never locks.

> Tax note: charging/showing VAT before VAT registration is not permitted
> (German §14c UStG). Launch with `STRIPE_TAX_ENABLED=false`. Confirm the
> retroactive-VAT question with a Steuerberater before go-live.

## Go live — Phase 2 (when VAT-registered)

Enable Stripe Tax in the Dashboard, set the DE origin address and registration
(test and live), then set `STRIPE_TAX_ENABLED=true`. No code change.

## Operational notes

- **Source of truth** is the webhook, which writes the `subscriptions` table and
  the cached `tenants.subscription_status` / `paid_until`. A daily cron
  (`/api/cron/trial-reminders`) also reconciles against Stripe to heal any missed
  webhook, and sends trial reminders.
- **Local dev** uses an embedded PGlite database when `DATABASE_URL` is unset.
  After any `schema.ts` change, run `npm run db:push` (stop the dev server first;
  PGlite is single-writer). Production points at Supabase.
- **New DB tables** need the `app_all` RLS policy for the least-privilege app
  role: re-run `scripts/db-enable-rls-deny-all.sql` and
  `scripts/db-app-role-grants-and-policies.sql` as a privileged role.
