import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema. The app fails the build on invalid env.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    SELF_HOSTED: z.enum(["true", "false"]).optional(),
    CRISP_WEBSITE_ID: z.string().uuid().optional(),
    SUPPORT_TO_EMAIL: z.string().email().optional(),

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
     * Optional so the demo mode works without any Entra setup. For email-based
     * linking the registration should emit the optional ID token claims email
     * and xms_edov; without them every email reads as not proven.
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
     * Gates the "bring your own app registration" Microsoft connector path.
     * On by default, next to the managed one-click admin-consent path. Set
     * MS_BYO_ENABLED=false to hide the BYO form and offer managed only.
     */
    MS_BYO_ENABLED: z.enum(["true", "false"]).optional(),
    /**
     * Paid hosted plans. Off by default, which gives every workspace the full
     * feature set (self-hosting). The hosted service sets BILLING_ENABLED=true
     * so workspaces without an entitlement row are on Free.
     */
    BILLING_ENABLED: z.enum(["true", "false"]).optional(),
    /** Polar (card payments, merchant of record). All optional; see polarEnabled(). */
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
    POLAR_PRODUCT_PRO_MONTH: z.string().optional(),
    POLAR_PRODUCT_PRO_YEAR: z.string().optional(),
    POLAR_PRODUCT_MSP_MONTH: z.string().optional(),
    POLAR_PRODUCT_MSP_YEAR: z.string().optional(),
    /**
     * Microsoft Marketplace transactable SaaS offer. The Entra app registered in
     * Partner Center for the SaaS Fulfillment API; see marketplaceEnabled().
     */
    MARKETPLACE_TENANT_ID: z.string().optional(),
    MARKETPLACE_CLIENT_ID: z.string().optional(),
    MARKETPLACE_CLIENT_SECRET: z.string().optional(),
    /** Public listing URL the portal links to for "buy on your Microsoft invoice". */
    MARKETPLACE_OFFER_URL: z.string().url().optional(),
    /** Plan ids as defined in Partner Center. Default to "pro" and "msp". */
    MARKETPLACE_PLAN_PRO: z.string().optional(),
    MARKETPLACE_PLAN_MSP: z.string().optional(),

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
  },

  client: {},

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SELF_HOSTED: process.env.SELF_HOSTED,
    CRISP_WEBSITE_ID: process.env.CRISP_WEBSITE_ID,
    SUPPORT_TO_EMAIL: process.env.SUPPORT_TO_EMAIL,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
    AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    CONNECTOR_CLIENT_ID: process.env.CONNECTOR_CLIENT_ID,
    CONNECTOR_CLIENT_SECRET: process.env.CONNECTOR_CLIENT_SECRET,
    MS_BYO_ENABLED: process.env.MS_BYO_ENABLED,
    BILLING_ENABLED: process.env.BILLING_ENABLED,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_SERVER: process.env.POLAR_SERVER,
    POLAR_PRODUCT_PRO_MONTH: process.env.POLAR_PRODUCT_PRO_MONTH,
    POLAR_PRODUCT_PRO_YEAR: process.env.POLAR_PRODUCT_PRO_YEAR,
    POLAR_PRODUCT_MSP_MONTH: process.env.POLAR_PRODUCT_MSP_MONTH,
    POLAR_PRODUCT_MSP_YEAR: process.env.POLAR_PRODUCT_MSP_YEAR,
    MARKETPLACE_TENANT_ID: process.env.MARKETPLACE_TENANT_ID,
    MARKETPLACE_CLIENT_ID: process.env.MARKETPLACE_CLIENT_ID,
    MARKETPLACE_CLIENT_SECRET: process.env.MARKETPLACE_CLIENT_SECRET,
    MARKETPLACE_OFFER_URL: process.env.MARKETPLACE_OFFER_URL,
    MARKETPLACE_PLAN_PRO: process.env.MARKETPLACE_PLAN_PRO,
    MARKETPLACE_PLAN_MSP: process.env.MARKETPLACE_PLAN_MSP,
    CRON_SECRET: process.env.CRON_SECRET,
    DEMO_MODE: process.env.DEMO_MODE,
    APP_BASE_URL: process.env.APP_BASE_URL,
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
    ALERT_EMAIL: process.env.ALERT_EMAIL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const isDemoMode = () => env.DEMO_MODE === "true";

/**
 * Whether sign-in is available, for wiring the marketing CTAs: the Entra
 * sign-in app registration is configured. Hides the sign-in button on a
 * deployment that has not set it up (demo-only installs).
 */
export const signInEnabled = () =>
  Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID && env.AUTH_MICROSOFT_ENTRA_ID_SECRET);

/** The sign-in page; its button starts the Microsoft flow at /api/auth/signin. */
export const signInPath = () => "/sign-in";

/**
 * Whether the bring-your-own Microsoft app-registration path is exposed. On by
 * default (the Advanced option on the Microsoft connector page); set
 * MS_BYO_ENABLED=false to hide it and offer managed one-click only.
 */
export const byoConnectorEnabled = () => env.MS_BYO_ENABLED !== "false";

/**
 * Whether paid hosted plans are in force. Off by default: a self-hosted install
 * gets every feature without an entitlement row.
 */
export const billingEnabled = () => env.BILLING_ENABLED === "true";

/** Card checkout through Polar is offered only when billing is on and Polar is configured. */
export const polarEnabled = () =>
  billingEnabled() &&
  Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET);

/** The Marketplace landing page and webhook work only with the fulfillment app configured. */
export const marketplaceEnabled = () =>
  billingEnabled() &&
  Boolean(
    env.MARKETPLACE_TENANT_ID &&
    env.MARKETPLACE_CLIENT_ID &&
    env.MARKETPLACE_CLIENT_SECRET,
  );

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
