import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema. The app fails the build on invalid env.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),

    /**
     * Postgres connection string for production (Neon/Supabase EU etc.).
     * When unset, the app falls back to an embedded PGlite database under
     * .pglite/, development and demo only.
     */
    DATABASE_URL: z.string().url().optional(),

    /**
     * Session cookie signing secret. Generate with `openssl rand -base64 32`.
     * Production (incl. Vercel preview builds, which run NODE_ENV=production)
     * requires >=32 chars; local dev allows a shorter throwaway value.
     */
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(32)
        : z.string().min(10),

    /**
     * Sign-in app registration (delegated, multi-tenant, openid/profile/email only).
     * Optional so the demo mode works without any Entra setup.
     */
    AUTH_MICROSOFT_ENTRA_ID_ID: z.string().optional(),
    AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().optional(),

    /**
     * Connector app registration (application permissions, granted per customer
     * tenant via the admin-consent flow). Read-only Graph scopes only.
     */
    CONNECTOR_CLIENT_ID: z.string().optional(),
    CONNECTOR_CLIENT_SECRET: z.string().optional(),

    /**
     * Shared secret protecting /api/cron/* routes (Vercel Cron sends it as a
     * Bearer token). Required on Vercel builds so a deploy cannot silently
     * ship an unscheduled (or unprotected) cron; the route also fails closed
     * (401) when unset.
     */
    CRON_SECRET: process.env.VERCEL
      ? z.string().min(16)
      : z.string().min(16).optional(),

    /** "true" enables the demo workspace (fixture tenant, credentials-free entry). */
    DEMO_MODE: z.enum(["true", "false"]).optional(),

    /**
     * Incoming-webhook URL (Teams/Slack compatible) for operational alerts:
     * failed syncs, cron errors. Optional; alerts log to console without it.
     */
    ALERT_WEBHOOK_URL: z.string().url().optional(),

    /** Ops alerts by email (requires RESEND_API_KEY + EMAIL_FROM). */
    ALERT_EMAIL: z.string().email().optional(),

    /** Resend API key for the weekly digest. Optional; digest skips without it. */
    RESEND_API_KEY: z.string().optional(),
    /** From address for outgoing mail, e.g. "LicenseMeter <digest@licensemeter.com>". */
    EMAIL_FROM: z.string().optional(),

    /**
     * Public base URL, used to build the admin-consent redirect URI.
     * Required on Vercel builds: without it the consent flow would send a
     * relative redirect_uri, which Microsoft rejects.
     */
    APP_BASE_URL: process.env.VERCEL
      ? z.string().url()
      : z.string().url().optional(),

    /**
     * Stripe billing. All optional and gated behind billingEnabled(): without
     * STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET the whole billing subsystem is
     * a no-op and every workspace keeps full access (safe incremental rollout).
     */
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    /** Pinned Customer Portal configuration id (from scripts/setup-stripe-portal.ts). */
    STRIPE_PORTAL_CONFIGURATION_ID: z.string().optional(),
    /** Recurring Price ids per tier+interval (from scripts/setup-stripe.ts). */
    STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
    STRIPE_PRICE_STARTER_ANNUAL: z.string().optional(),
    STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional(),
    STRIPE_PRICE_GROWTH_ANNUAL: z.string().optional(),
    STRIPE_PRICE_SCALE_MONTHLY: z.string().optional(),
    STRIPE_PRICE_SCALE_ANNUAL: z.string().optional(),
    /**
     * "true" turns on Stripe Tax (automatic_tax) + VAT-id collection + the
     * VAT-aware pricing copy. Off at launch; flip on once VAT-registered. No
     * code change required.
     */
    STRIPE_TAX_ENABLED: z.enum(["true", "false"]).optional(),
  },

  client: {},

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    CONNECTOR_CLIENT_ID: process.env.CONNECTOR_CLIENT_ID,
    CONNECTOR_CLIENT_SECRET: process.env.CONNECTOR_CLIENT_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    DEMO_MODE: process.env.DEMO_MODE,
    APP_BASE_URL: process.env.APP_BASE_URL,
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
    ALERT_EMAIL: process.env.ALERT_EMAIL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PORTAL_CONFIGURATION_ID: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    STRIPE_PRICE_STARTER_MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    STRIPE_PRICE_STARTER_ANNUAL: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    STRIPE_PRICE_GROWTH_MONTHLY: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    STRIPE_PRICE_GROWTH_ANNUAL: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    STRIPE_PRICE_SCALE_MONTHLY: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    STRIPE_PRICE_SCALE_ANNUAL: process.env.STRIPE_PRICE_SCALE_ANNUAL,
    STRIPE_TAX_ENABLED: process.env.STRIPE_TAX_ENABLED,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const isDemoMode = () => env.DEMO_MODE === "true";

/**
 * Master billing flag. When false the entire Stripe subsystem no-ops and
 * entitlementOf grants full access to everyone, so nothing locks until Stripe
 * is configured (mirrors how emailEnabled() gates outgoing mail).
 */
export const billingEnabled = () =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

/**
 * Whether to collect VAT via Stripe Tax. Off at launch (sell flat prices, no
 * VAT shown); flip STRIPE_TAX_ENABLED=true once VAT-registered.
 */
export const taxEnabled = () => env.STRIPE_TAX_ENABLED === "true";

/**
 * Like appBaseUrl but never throws, for sitemap/OG metadata where a localhost
 * fallback during local production builds is harmless.
 */
export const siteUrl = () => env.APP_BASE_URL ?? "http://localhost:3000";

export const appBaseUrl = () => {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  if (env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL must be set in production");
  }
  return "http://localhost:3000";
};
