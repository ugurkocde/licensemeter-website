import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// WorkOS is the default sign-in; entra is the flag-only opt-out. Mirrors
// authProvider() below, but evaluated here so the WorkOS credentials become
// REQUIRED whenever WorkOS is the live provider — a misconfigured production
// deploy then fails the build instead of 500-ing every page at runtime (the
// AuthKit middleware throws without a >=32-char cookie password).
const workosLogin = process.env.AUTH_PROVIDER !== "entra";

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
     * Dedicated key for encrypting stored connector credentials at rest
     * (crypto.ts). Optional: when unset the encryption key falls back to
     * AUTH_SECRET so existing deployments and ciphertext keep working with no
     * migration. Set a DISTINCT value to separate the data-at-rest key from the
     * session/token signing secret, so a leak of one no longer compromises the
     * other and AUTH_SECRET can be rotated without invalidating stored secrets.
     * Rotating to a new distinct value requires re-encrypting existing rows;
     * crypto.ts keeps an AUTH_SECRET decrypt fallback to make that lazy.
     */
    DATA_ENCRYPTION_KEY:
      process.env.NODE_ENV === "production"
        ? z.string().min(32).optional()
        : z.string().min(10).optional(),

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
     * Which login stack is live. Defaults to "workos" (AuthKit multi-method
     * sign-in); "entra" is a flag-only opt-out that restores the original MSAL
     * sign-in. The connector (app-only Graph access) is unaffected either way —
     * it keys on the Entra tenant id stored on the tenant row, not on the login.
     */
    AUTH_PROVIDER: z.enum(["entra", "workos"]).optional(),

    /**
     * Gates the "bring your own app registration" Microsoft connector path.
     * Off by default: the managed one-click admin-consent path is unchanged and
     * always available. Flip MS_BYO_ENABLED=true to expose the BYO form.
     */
    MS_BYO_ENABLED: z.enum(["true", "false"]).optional(),

    /**
     * WorkOS AuthKit credentials, read by @workos-inc/authkit-nextjs. Required
     * when WorkOS is the live provider (the default) so a deploy missing them
     * fails fast; optional under the entra opt-out. The cookie password must be
     * >=32 chars (AuthKit seals the session with it). NEXT_PUBLIC_WORKOS_REDIRECT_URI
     * is consumed by the SDK directly from process.env and is not validated here.
     */
    WORKOS_API_KEY: workosLogin ? z.string().min(1) : z.string().optional(),
    WORKOS_CLIENT_ID: workosLogin ? z.string().min(1) : z.string().optional(),
    WORKOS_COOKIE_PASSWORD: workosLogin
      ? z.string().min(32)
      : z.string().min(32).optional(),

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
     * Quantity Price ids for the MSP per-tenant subscription (unit = one connected
     * client tenant), per interval. Optional and gated behind mspEnabled(): until
     * the owner sets at least the monthly price the MSP packaging is fully inert.
     * Set later from scripts/setup-stripe.ts.
     */
    STRIPE_PRICE_MSP_TENANT_MONTHLY: z.string().optional(),
    STRIPE_PRICE_MSP_TENANT_ANNUAL: z.string().optional(),
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
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
    AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    CONNECTOR_CLIENT_ID: process.env.CONNECTOR_CLIENT_ID,
    CONNECTOR_CLIENT_SECRET: process.env.CONNECTOR_CLIENT_SECRET,
    AUTH_PROVIDER: process.env.AUTH_PROVIDER,
    MS_BYO_ENABLED: process.env.MS_BYO_ENABLED,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
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
    STRIPE_PRICE_MSP_TENANT_MONTHLY: process.env.STRIPE_PRICE_MSP_TENANT_MONTHLY,
    STRIPE_PRICE_MSP_TENANT_ANNUAL: process.env.STRIPE_PRICE_MSP_TENANT_ANNUAL,
    STRIPE_TAX_ENABLED: process.env.STRIPE_TAX_ENABLED,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const isDemoMode = () => env.DEMO_MODE === "true";

/**
 * Active login stack. Defaults to "workos": sign-in is WorkOS-only (AuthKit
 * multi-method). "entra" is a flag-only opt-out (AUTH_PROVIDER=entra) that
 * restores the original MSAL sign-in. MSAL otherwise lives only in the
 * Microsoft connector (admin-consent / BYO), never in user sign-in. The
 * connector / Graph access is independent of this flag.
 */
export const authProvider = () =>
  env.AUTH_PROVIDER === "entra" ? "entra" : "workos";

/**
 * Whether sign-in is available, for wiring the marketing CTAs: WorkOS needs a
 * client id; the entra opt-out needs the Entra app id. Hides the sign-in button
 * on a deployment that has configured neither.
 */
export const signInEnabled = () =>
  authProvider() === "workos"
    ? Boolean(env.WORKOS_CLIENT_ID)
    : Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);

/** Sign-in entry path for the active provider (WorkOS AuthKit by default). */
export const signInPath = () =>
  authProvider() === "workos" ? "/auth/sign-in" : "/api/auth/signin";

/**
 * Whether the bring-your-own Microsoft app-registration path is exposed. On by
 * default (the Advanced option on the Microsoft connector page); set
 * MS_BYO_ENABLED=false to hide it and offer managed one-click only.
 */
export const byoConnectorEnabled = () => env.MS_BYO_ENABLED !== "false";

/**
 * Master billing flag. When false the entire Stripe subsystem no-ops and
 * entitlementOf grants full access to everyone, so nothing locks until Stripe
 * is configured (mirrors how emailEnabled() gates outgoing mail).
 */
export const billingEnabled = () =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

/**
 * Whether MSP quantity-billing is live. Requires billing to be on AND the MSP
 * quantity Price id to be set, so the whole MSP subsystem (account billing,
 * entitlement inheritance) stays inert until the owner configures the price —
 * mirrors how billingEnabled() gates the per-workspace Stripe path.
 */
export const mspEnabled = () =>
  billingEnabled() && Boolean(env.STRIPE_PRICE_MSP_TENANT_MONTHLY);

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
