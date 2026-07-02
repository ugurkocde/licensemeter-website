"use server";

import { X509Certificate } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import {
  apiAccess,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import {
  adobeConnections,
  adobeUsers,
  aiSpendDaily,
  emailSignups,
  findings,
  memberships,
  msConnections,
  priceBook,
  saasConnections,
  saasSeats,
  snapshots,
  tenants,
  tenantSkus,
  tenantUsers,
} from "~/server/db/schema";
import {
  parsePrices,
  parsePriceValue,
} from "~/app/app/(dash)/licenses/parsePrices";
import { UmapiClient } from "~/server/adobe/client";
import { verifyMsCredential, type MsCredential } from "~/server/graph/msGraph";
import {
  buildSaasClient,
  isImportProvider,
  isSaasProvider,
} from "~/server/saas/registry";
import { parseMembers } from "~/server/saas/parseMembers";
import { normalizeSalesforceOrgRef } from "~/server/saas/salesforce";
import { connectorSpec } from "~/lib/connectors";
import { workspaceLabel } from "~/lib/format";
import { encryptSecret, secretAad } from "~/server/crypto";
import { emailEnabled, inviteHtml, sendEmail } from "~/server/email";
import { notifyOps } from "~/server/ops";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import { maybeSendWelcome } from "~/server/welcome";
import { sendWorkspaceDeleted, workspaceAdminEmails } from "~/server/billingEmail";
import { teardownTenantWorkosOrg } from "~/server/auth/workos";
import { billingEnabled, byoConnectorEnabled, siteUrl } from "~/env";
import { teardownTenantBilling } from "~/server/stripe";
import { runAnalysis, runSync } from "~/server/sync/runSync";
import type { MembershipRole } from "~/server/types";

export type ActionResult = { ok: boolean; error?: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (): ActionResult => ({ ok: true });

const revalidateApp = () => revalidatePath("/app", "layout");

/**
 * Start the 14-day trial on first connector connect. Idempotent: stamps
 * trialStartedAt only when still null, so the clock begins the moment the
 * workspace gets its first service and reconnecting never resets it. An empty
 * (never-connected) workspace keeps trialStartedAt null = full access.
 */
const startTrialOnFirstConnect = async (tenantId: string): Promise<void> => {
  await db
    .update(tenants)
    .set({ trialStartedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), isNull(tenants.trialStartedAt)));
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Shared refusal for the public demo workspace: every anonymous visitor is an
 * owner of one shared demo tenant, so the mutating settings/price/finding/sync
 * actions below must not let a visitor vandalize shared state (member/connector
 * actions already refuse this way).
 */
const DEMO_READONLY =
  "The demo workspace is read-only. Connect your own workspace to change this.";

/** Acknowledge / reopen a finding. */
export const setFindingStatus = async (
  findingId: string,
  status: "open" | "acknowledged",
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);

  const updated = await db
    .update(findings)
    .set({ status })
    .where(and(eq(findings.id, findingId), eq(findings.tenantId, ctx.tenant.id)))
    .returning({ id: findings.id });
  if (updated.length === 0) return fail("Finding not found");
  await audit(ctx, "finding_status_changed", { findingId, status });
  revalidateApp();
  return ok();
};

/** Bulk acknowledge/reopen from the findings table checkboxes. */
export const bulkSetFindingStatus = async (
  formData: FormData,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);

  const status = formData.get("status") === "open" ? "open" : "acknowledged";
  const ids = formData
    .getAll("id")
    .filter((v): v is string => typeof v === "string")
    .slice(0, 500);
  if (ids.length === 0) return fail("Nothing selected");

  const updated = await db
    .update(findings)
    .set({ status })
    .where(and(inArray(findings.id, ids), eq(findings.tenantId, ctx.tenant.id)))
    .returning({ id: findings.id });
  await audit(ctx, "findings_bulk_updated", { count: updated.length, status });
  revalidateApp();
  return ok();
};

/** Update a price book entry (euros/dollars as decimal string) and re-run analysis. */
export const updatePrice = async (
  skuId: string,
  price: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);

  // Strict parse (shared with the bulk import): "14.90" or German "14,90",
  // 0..100000. Saving 0 keeps marking the row as unpriced, exactly as before.
  const cents = parsePriceValue(price);
  if (cents === null) {
    return fail("Enter a price like 12,50 or 14.90");
  }

  const updated = await db
    .update(priceBook)
    .set({ monthlyPriceCents: cents, source: "custom", updatedAt: new Date() })
    .where(and(eq(priceBook.tenantId, ctx.tenant.id), eq(priceBook.skuId, skuId)))
    .returning({ skuId: priceBook.skuId });
  if (updated.length === 0) return fail("Unknown SKU");

  await audit(ctx, "price_updated", { skuId, monthlyPriceCents: cents });
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

export type ImportPricesResult = ActionResult & {
  /** Price book rows written. */
  applied: number;
  /** Keys that matched nothing in this workspace (deduplicated, in order). */
  skipped: string[];
  /** Lines that could not be parsed at all. */
  invalid: number;
};

/**
 * Bulk price import from pasted CSV lines (key,monthly price). Keys may be an
 * M365 skuId or skuPartNumber, or a connector key like adobe:<product> /
 * zoom:<product>; unknown keys are skipped, never an error. Matching rows are
 * upserted as source "custom" and the analysis re-runs once.
 */
export const importPrices = async (
  formData: FormData,
): Promise<ImportPricesResult> => {
  const none = (r: ActionResult): ImportPricesResult => ({
    ...r,
    applied: 0,
    skipped: [],
    invalid: 0,
  });
  const ctx = await apiAccess("admin");
  if (!ctx) return none(fail("Not allowed"));
  if (ctx.tenant.isDemo) return none(fail(DEMO_READONLY));

  const raw = formData.get("csv");
  const text = typeof raw === "string" ? raw : "";
  if (text.trim() === "") return none(fail("Paste at least one line"));
  if (text.length > 200_000) return none(fail("Paste is too large"));

  const { rows, invalid } = parsePrices(text);

  // Resolve keys case-insensitively to the canonical price book skuId:
  // existing price book keys (GUIDs and provider:product) plus the tenant's
  // SKU part numbers. Two reads, one write, no per-row queries.
  const [bookRows, skuRows] = await Promise.all([
    db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, ctx.tenant.id),
      columns: { skuId: true },
    }),
    db.query.tenantSkus.findMany({
      where: eq(tenantSkus.tenantId, ctx.tenant.id),
      columns: { skuId: true, skuPartNumber: true },
    }),
  ]);
  const canonical = new Map<string, string>();
  for (const r of bookRows) canonical.set(r.skuId.toLowerCase(), r.skuId);
  for (const s of skuRows) {
    canonical.set(s.skuId.toLowerCase(), s.skuId);
    canonical.set(s.skuPartNumber.toLowerCase(), s.skuId);
  }

  const skipped: string[] = [];
  const seenSkipped = new Set<string>();
  const bySku = new Map<string, number>(); // dedupe: last line per key wins
  for (const row of rows) {
    const skuId = canonical.get(row.key.toLowerCase());
    if (!skuId) {
      if (!seenSkipped.has(row.key)) {
        seenSkipped.add(row.key);
        skipped.push(row.key);
      }
      continue;
    }
    bySku.set(skuId, row.cents);
  }

  if (bySku.size === 0) {
    return {
      // Trailing period: the form appends the skipped/unparsed sentences.
      ...fail("No lines matched a product in this workspace."),
      applied: 0,
      skipped,
      invalid: invalid.length,
    };
  }

  await db
    .insert(priceBook)
    .values(
      [...bySku.entries()].map(([skuId, cents]) => ({
        tenantId: ctx.tenant.id,
        skuId,
        monthlyPriceCents: cents,
        source: "custom" as const,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [priceBook.tenantId, priceBook.skuId],
      set: {
        monthlyPriceCents: sql`excluded.monthly_price_cents`,
        source: sql`excluded.source`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  await audit(ctx, "prices_imported", {
    applied: bySku.size,
    skipped: skipped.length,
    invalid: invalid.length,
  });
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return { ok: true, applied: bySku.size, skipped, invalid: invalid.length };
};

/** Invite a member by email/UPN; they get access on their first sign-in. */
export const addMember = async (formData: FormData): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) {
    return fail(
      "The demo workspace keeps its members fixed. Connect your own tenant to manage people.",
    );
  }

  const emailRaw = formData.get("email");
  const roleRaw = formData.get("role");
  const email =
    typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const role = (
    typeof roleRaw === "string" ? roleRaw : "viewer"
  ) as MembershipRole;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Invalid email");
  if (!["viewer", "admin", "owner"].includes(role)) return fail("Invalid role");
  if (role === "owner" && ctx.membership.role !== "owner") {
    return fail("Only owners can add owners");
  }
  if (!(await rateLimitDurable(`invite:${ctx.tenant.id}`, 20, 60 * 60 * 1000))) {
    return fail("Too many invites this hour, please try again later");
  }

  // An invite must never change the role of someone who has already signed
  // in (that would bypass the owner-removal rule below); only an UNCLAIMED
  // invite may be re-sent with a corrected role, restarting its expiry.
  // Case-insensitive match: trial-created memberships can store mixed case.
  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.tenantId, ctx.tenant.id),
      eq(sql`lower(${memberships.email})`, email),
    ),
  });
  // Claimed via either provider (entra oid / workos workosUserId) means the
  // person has signed in; an invite must not re-role a signed-in member.
  if (existing?.oid || existing?.workosUserId) {
    return fail("That address is already a member of this workspace");
  }
  if (existing?.role === "owner" && ctx.membership.role !== "owner") {
    return fail("Only owners can change an owner invite");
  }
  if (existing) {
    await db
      .update(memberships)
      .set({ role, createdAt: new Date() })
      .where(eq(memberships.id, existing.id));
  } else {
    // onConflictDoNothing: a concurrent identical invite wins harmlessly.
    await db
      .insert(memberships)
      .values({ tenantId: ctx.tenant.id, email, role })
      .onConflictDoNothing();
  }
  await audit(ctx, "member_added", { email, role });

  // Invite email: never from the public demo workspace (open-relay risk),
  // and never a reason for the invite itself to fail.
  if (!ctx.tenant.isDemo && emailEnabled()) {
    try {
      await sendEmail({
        to: [email],
        subject: `${ctx.user.name || ctx.membership.email} invited you to LicenseMeter (${ctx.tenant.name ?? "workspace"})`,
        html: inviteHtml({
          inviterName: ctx.user.name || ctx.membership.email,
          tenantName: workspaceLabel(ctx.tenant),
          role,
          appUrl: siteUrl(),
        }),
      });
    } catch (err) {
      console.error("[invite] email failed", err);
    }
  }

  revalidateApp();
  return ok();
};

/** Resend a pending invite: resets the 14-day expiry and re-sends the email. */
export const resendInvite = async (
  membershipId: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) {
    return fail(
      "The demo workspace keeps its members fixed. Connect your own tenant to manage people.",
    );
  }

  const target = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.id, membershipId),
      eq(memberships.tenantId, ctx.tenant.id),
    ),
  });
  if (!target) return fail("Invite not found");
  if (target.oid || target.workosUserId)
    return fail("This member has already signed in");
  if (!(await rateLimitDurable(`resend:${ctx.tenant.id}`, 10, 60 * 60 * 1000))) {
    return fail("Too many resends this hour");
  }

  await db
    .update(memberships)
    .set({ createdAt: new Date() })
    .where(eq(memberships.id, target.id));
  await audit(ctx, "invite_resent", { email: target.email });

  if (!ctx.tenant.isDemo && emailEnabled()) {
    try {
      await sendEmail({
        to: [target.email],
        subject: `${ctx.user.name || ctx.membership.email} invited you to LicenseMeter (${ctx.tenant.name ?? "workspace"})`,
        html: inviteHtml({
          inviterName: ctx.user.name || ctx.membership.email,
          tenantName: workspaceLabel(ctx.tenant),
          role: target.role,
          appUrl: siteUrl(),
        }),
      });
    } catch (err) {
      console.error("[invite] resend email failed", err);
    }
  }
  revalidateApp();
  return ok();
};

export const removeMember = async (
  membershipId: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) {
    return fail(
      "The demo workspace keeps its members fixed. Connect your own tenant to manage people.",
    );
  }

  const target = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.id, membershipId),
      eq(memberships.tenantId, ctx.tenant.id),
    ),
  });
  if (!target) return fail("Member not found");
  if (target.role === "owner" && ctx.membership.role !== "owner") {
    return fail("Only owners can remove owners");
  }
  if (target.id === ctx.membership.id) return fail("You cannot remove yourself");

  await db.delete(memberships).where(eq(memberships.id, target.id));
  await audit(ctx, "member_removed", { email: target.email, role: target.role });
  revalidateApp();
  return ok();
};

/**
 * Change an existing member's (or pending invite's) role in place: the separate,
 * guarded path that addMember's "already a member" block deliberately leaves out.
 * Granting or revoking owner stays owner-only, and you cannot change your own
 * role. Together these keep at least one owner without counting rows: demoting an
 * owner requires being a DIFFERENT owner, so the actor always remains one.
 */
export const changeMemberRole = async (
  membershipId: string,
  newRole: MembershipRole,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) {
    return fail(
      "The demo workspace keeps its members fixed. Connect your own tenant to manage people.",
    );
  }
  if (!["viewer", "admin", "owner"].includes(newRole)) {
    return fail("Invalid role");
  }

  const target = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.id, membershipId),
      eq(memberships.tenantId, ctx.tenant.id),
    ),
  });
  if (!target) return fail("Member not found");
  if (target.id === ctx.membership.id) {
    return fail("You cannot change your own role");
  }
  // Granting OR revoking ownership is owner-only (mirrors addMember/removeMember).
  if (
    (newRole === "owner" || target.role === "owner") &&
    ctx.membership.role !== "owner"
  ) {
    return fail("Only owners can change the owner role");
  }
  if (target.role === newRole) return ok();

  await db
    .update(memberships)
    .set({ role: newRole })
    .where(eq(memberships.id, target.id));
  await audit(ctx, "member_role_changed", {
    email: target.email,
    from: target.role,
    to: newRole,
  });
  revalidateApp();
  return ok();
};

/** Per-workspace inactivity threshold (days) for the inactive-users rule. */
export const setInactiveDays = async (
  formData: FormData,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  const raw = formData.get("days");
  const days = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(days) || days < 7 || days > 365) {
    return fail("Threshold must be between 7 and 365 days");
  }
  await db
    .update(tenants)
    .set({ inactiveDays: days })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "threshold_changed", { inactiveDays: days });
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

/** Microsoft agreement renewal date; an empty submit clears it. */
export const setRenewalDate = async (
  formData: FormData,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  const raw = formData.get("date");
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value !== "") {
    // Date.parse rejects impossible components in ISO date strings.
    const year = Number(value.slice(0, 4));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      year < 2000 ||
      year > 2100
    ) {
      return fail("Invalid date");
    }
  }
  await db
    .update(tenants)
    .set({ renewalDate: value === "" ? null : value })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "renewal_date_changed", {
    renewalDate: value === "" ? null : value,
  });
  revalidateApp();
  return ok();
};

/** Email alerts when a sync finds new offboarding leaks. */
export const setLeakAlerts = async (
  enabled: boolean,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  await db
    .update(tenants)
    .set({ leakAlerts: enabled === true })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "leak_alerts_changed", { enabled: enabled === true });
  revalidateApp();
  return ok();
};

/** Monthly PDF waste report emailed to workspace owners/admins. */
export const setMonthlyReport = async (
  enabled: boolean,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  await db
    .update(tenants)
    .set({ monthlyReport: enabled === true })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "monthly_report_changed", { enabled: enabled === true });
  revalidateApp();
  return ok();
};

export const setTrialReminders = async (
  enabled: boolean,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  await db
    .update(tenants)
    .set({ trialReminders: enabled === true })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "trial_reminders_changed", { enabled: enabled === true });
  revalidateApp();
  return ok();
};

export const setCurrency = async (currency: string): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  if (!["EUR", "USD", "GBP", "CHF"].includes(currency)) {
    return fail("Unsupported currency");
  }
  await db
    .update(tenants)
    .set({ currency })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "currency_changed", { currency });
  revalidateApp();
  return ok();
};

/** Manual sync trigger from the Overview page. */
export const triggerSync = async (): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail(DEMO_READONLY);
  if (!ctx.entitlement.active)
    return fail("Your trial has ended. Upgrade to run a sync.");
  await audit(ctx, "sync_triggered", {});
  const result = await runSync(ctx.tenant.id);
  revalidateApp();
  return result.status === "failed" ? fail("Sync failed; see sync history") : ok();
};

/** Connect the Adobe Admin Console (UMAPI server-to-server credentials). */
export const connectAdobe = async (
  formData: FormData,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail("The demo workspace ships with demo Adobe data");

  const read = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const orgId = read("orgId");
  const clientId = read("clientId");
  const clientSecret = read("clientSecret");
  if (!orgId || !clientId || !clientSecret) return fail("All three fields are required");
  if ([orgId, clientId, clientSecret].some((v) => v.length > 200)) {
    return fail("Credential value too long");
  }

  // Validate against Adobe before storing anything.
  try {
    await new UmapiClient({ orgId, clientId, clientSecret }).getUsers();
  } catch {
    return fail(
      "Adobe rejected the credentials. Check the values and try again",
    );
  }

  const adobeAad = secretAad(ctx.tenant.id, "adobe", "clientSecretEnc");
  await db
    .insert(adobeConnections)
    .values({
      tenantId: ctx.tenant.id,
      orgId,
      clientId,
      clientSecretEnc: encryptSecret(clientSecret, adobeAad),
    })
    .onConflictDoUpdate({
      target: adobeConnections.tenantId,
      set: {
        orgId,
        clientId,
        clientSecretEnc: encryptSecret(clientSecret, adobeAad),
        lastSyncStatus: null,
        lastSyncAt: null,
      },
    });
  await audit(ctx, "adobe_connected", { orgId });
  await startTrialOnFirstConnect(ctx.tenant.id);
  // Sync after the response, not inline; see connectSaasConnector.
  after(() => runSync(ctx.tenant.id));
  revalidateApp();
  return ok();
};

/** Remove the Adobe connection and its data; findings auto-resolve. */
export const disconnectAdobe = async (): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail("The demo workspace ships with demo Adobe data");

  await db
    .delete(adobeConnections)
    .where(eq(adobeConnections.tenantId, ctx.tenant.id));
  await db.delete(adobeUsers).where(eq(adobeUsers.tenantId, ctx.tenant.id));
  await audit(ctx, "adobe_disconnected", {});
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

/** Connect a SaaS connector (Zoom / Atlassian / Salesforce). */
export const connectSaasConnector = async (
  formData: FormData,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo)
    return fail("The demo workspace ships with demo connector data");

  const read = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const providerRaw = read("provider");
  if (!isSaasProvider(providerRaw)) return fail("Unknown connector");
  const provider = providerRaw;
  const spec = connectorSpec(provider);
  if (spec.kind === "import")
    return fail("This connector takes a member CSV import, not credentials");

  const values: Record<string, string> = {};
  for (const field of spec.fields) {
    const v = read(field.name);
    if (!v) return fail(`${field.label} is required`);
    if (v.length > 1000) return fail(`${field.label} is too long`);
    values[field.name] = v;
  }
  // AI connectors authenticate with a bare admin key; the org reference is a
  // fixed sentinel because neither provider exposes a cheap org-id lookup.
  let orgRef = values.orgRef ?? "admin";
  if (provider === "salesforce") {
    const origin = normalizeSalesforceOrgRef(orgRef);
    if (!origin)
      return fail(
        "The instance URL must be your Salesforce My Domain, for example https://<domain>.my.salesforce.com or https://<domain>.sandbox.my.salesforce.com",
      );
    orgRef = origin;
  }
  const clientId = values.clientId ?? null;
  const secret = values.secret!;

  // Validate against the provider before storing anything. Full error goes
  // to the server log only, because provider error bodies can echo submitted
  // credentials, so the browser gets a generic message.
  try {
    const client = await buildSaasClient(provider, {
      orgRef,
      clientId,
      secret,
    });
    await client.getSeats();
  } catch (err) {
    console.error(`[saas connect] ${provider}:`, err);
    return fail(
      `${spec.label} rejected the credentials. Check the values and try again`,
    );
  }

  const saasAad = secretAad(ctx.tenant.id, provider, "secretEnc");
  await db
    .insert(saasConnections)
    .values({
      tenantId: ctx.tenant.id,
      provider,
      orgRef,
      clientId,
      secretEnc: encryptSecret(secret, saasAad),
    })
    .onConflictDoUpdate({
      target: [saasConnections.tenantId, saasConnections.provider],
      set: {
        orgRef,
        clientId,
        secretEnc: encryptSecret(secret, saasAad),
        lastSyncStatus: null,
        lastSyncAt: null,
      },
    });
  await audit(ctx, "connector_connected", { provider, orgRef });
  await startTrialOnFirstConnect(ctx.tenant.id);
  // Credentials were validated above; the first sync (a full Graph pull plus
  // every connector) runs after the response rather than blocking it, so the
  // connect button is not held pending for the whole sync and cannot outlive
  // the function timeout. The page shows "first sync pending" until it lands.
  after(() => runSync(ctx.tenant.id));
  revalidateApp();
  return ok();
};

/** Remove a SaaS connection and its seats; findings auto-resolve. */
export const disconnectSaasConnector = async (
  providerRaw: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo)
    return fail("The demo workspace ships with demo connector data");
  if (!isSaasProvider(providerRaw)) return fail("Unknown connector");
  const provider = providerRaw;

  await db
    .delete(saasConnections)
    .where(
      and(
        eq(saasConnections.tenantId, ctx.tenant.id),
        eq(saasConnections.provider, provider),
      ),
    );
  await db
    .delete(saasSeats)
    .where(
      and(
        eq(saasSeats.tenantId, ctx.tenant.id),
        eq(saasSeats.provider, provider),
      ),
    );
  await db
    .delete(aiSpendDaily)
    .where(
      and(
        eq(aiSpendDaily.tenantId, ctx.tenant.id),
        eq(aiSpendDaily.provider, provider),
      ),
    );
  await audit(ctx, "connector_disconnected", { provider });
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

/** GUID shape for tenant/app ids (lenient case). */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MsConnectResult =
  | {
      ok: true;
      /** Non-blocking note, e.g. the live Reports API probe did not respond. */
      warning?: string;
    }
  | {
      ok: false;
      error: string;
      /** Per-permission red/green rows when consent is incomplete. */
      checklist?: { scope: string; granted: boolean }[];
    };

/**
 * BYO Microsoft connector: validate the customer's own Entra app registration
 * credentials (client secret OR certificate), test-connection via the token's
 * roles claim, and store them encrypted. The secret / certificate private key
 * is never logged, returned, or echoed; only a clean message reaches the client.
 */
export const connectMicrosoftByo = async (
  formData: FormData,
): Promise<MsConnectResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return { ok: false, error: "Not allowed" };
  if (!byoConnectorEnabled())
    return { ok: false, error: "The bring-your-own connector path is not enabled." };
  if (ctx.tenant.isDemo)
    return { ok: false, error: "The demo workspace ships with demo Microsoft data" };

  const read = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const tid = read("tid");
  const appClientId = read("appClientId");
  const credType = read("credType");
  if (!tid || !appClientId)
    return { ok: false, error: "Tenant ID and Application ID are required" };
  if (!GUID.test(tid) || !GUID.test(appClientId))
    return { ok: false, error: "Tenant ID and Application ID must be GUIDs" };
  if (credType !== "secret" && credType !== "cert")
    return { ok: false, error: "Choose a credential type" };

  // A given Microsoft tenant belongs to exactly one workspace (the partial-
  // unique tid index); refuse to silently steal it from another workspace.
  const tidOwner = await db.query.tenants.findFirst({
    where: eq(tenants.tid, tid),
  });
  if (tidOwner && tidOwner.id !== ctx.tenant.id)
    return {
      ok: false,
      error: "That Microsoft tenant is already connected to another workspace.",
    };

  let cred: MsCredential;
  let secretEnc: string;
  let certThumbprint: string | null = null;
  let secretExpiresAt: Date | null = null;

  if (credType === "secret") {
    const secret = read("secret");
    if (!secret) return { ok: false, error: "Client secret is required" };
    if (secret.length > 1000)
      return { ok: false, error: "Client secret is too long" };
    const expiry = read("secretExpiresAt");
    if (expiry) {
      const d = new Date(expiry);
      if (!Number.isNaN(d.getTime())) secretExpiresAt = d;
    }
    cred = { mode: "byo", credType: "secret", tid, clientId: appClientId, secret };
    secretEnc = encryptSecret(
      secret,
      secretAad(ctx.tenant.id, "microsoft", "secretEnc"),
    );
  } else {
    const privateKey = read("privateKey");
    const certPem = read("cert");
    if (!privateKey || !certPem)
      return {
        ok: false,
        error: "Both the private key and the certificate (PEM) are required",
      };
    try {
      const x = new X509Certificate(certPem);
      certThumbprint = x.fingerprint.replace(/:/g, "").toLowerCase();
      const validTo = new Date(x.validTo);
      // Treat the cert's own expiry as the credential expiry for warnings.
      if (!Number.isNaN(validTo.getTime())) secretExpiresAt = validTo;
    } catch {
      return { ok: false, error: "The certificate (PEM) could not be parsed" };
    }
    cred = {
      mode: "byo",
      credType: "cert",
      tid,
      clientId: appClientId,
      privateKey,
      thumbprint: certThumbprint,
    };
    secretEnc = encryptSecret(
      privateKey,
      secretAad(ctx.tenant.id, "microsoft", "secretEnc"),
    );
  }

  // Test-connection: acquire an app-only token and inspect its roles claim.
  const verify = await verifyMsCredential(cred);
  if (!verify.ok) return { ok: false, error: verify.error };
  if (!verify.complete) {
    const missing = verify.checklist
      .filter((c) => !c.granted)
      .map((c) => c.scope)
      .join(", ");
    return {
      ok: false,
      error: `Admin consent is missing for: ${missing}. Grant these application permissions and retry.`,
      checklist: verify.checklist,
    };
  }

  const now = new Date();
  // The connection row and the tid binding move together: a partial write could
  // leave a stale binding that re-enables sync. The unique indexes on
  // ms_connections.tid / tenants.tid are the atomic backstop behind the
  // application-level steal guard above (a concurrent connect to the same tid
  // loses the race here rather than corrupting state).
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(msConnections)
        .values({
          tenantId: ctx.tenant.id,
          mode: "byo",
          tid,
          appClientId,
          credType,
          secretEnc,
          certThumbprint,
          secretExpiresAt,
          lastVerifiedAt: now,
          lastVerifyError: null,
        })
        .onConflictDoUpdate({
          target: msConnections.tenantId,
          set: {
            mode: "byo",
            tid,
            appClientId,
            credType,
            secretEnc,
            certThumbprint,
            secretExpiresAt,
            lastVerifiedAt: now,
            lastVerifyError: null,
          },
        });

      // Bind the Microsoft tenant to the workspace so tid-scoped paths resolve.
      // consentedAt / trialStartedAt are stamped once, never reset on reconnect
      // (coalesce is atomic DB-side, not dependent on a possibly-stale ctx read).
      await tx
        .update(tenants)
        .set({
          tid,
          consentedAt: sql`coalesce(${tenants.consentedAt}, now())`,
          trialStartedAt: sql`coalesce(${tenants.trialStartedAt}, now())`,
        })
        .where(eq(tenants.id, ctx.tenant.id));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/tid_idx|unique/i.test(message)) {
      return {
        ok: false,
        error:
          "That Microsoft tenant is already connected to another workspace.",
      };
    }
    throw err;
  }

  await audit(ctx, "microsoft_connected", { mode: "byo", credType });
  // First sync runs after the response, like the other connectors.
  after(() => runSync(ctx.tenant.id));
  revalidateApp();
  const warning =
    verify.reportsProbe && !verify.reportsProbe.ok
      ? "Connected, but a live test of the usage Reports API did not respond. Usage-based inactivity findings may be limited until it does."
      : undefined;
  return { ok: true, warning };
};

/** Remove the Microsoft connection; the workspace reverts to not-connected. */
export const disconnectMicrosoft = async (): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo)
    return fail("The demo workspace ships with demo Microsoft data");

  // Remove the connection, release the tid binding, and purge the Microsoft
  // dataset together. The user/SKU/snapshot rows are the Graph-sourced data the
  // consent authorized; revoking the connection must remove that PII rather than
  // leave it (mirrors disconnectAdobe/disconnectSaasConnector clearing their
  // data). Customer-entered prices (priceBook) are deliberately kept. A partial
  // delete that left tenants.tid set would let the managed fallback in
  // resolveMsCredential silently re-enable sync. Findings auto-resolve on the
  // next analysis.
  await db.transaction(async (tx) => {
    await tx
      .delete(msConnections)
      .where(eq(msConnections.tenantId, ctx.tenant.id));
    await tx.delete(tenantUsers).where(eq(tenantUsers.tenantId, ctx.tenant.id));
    await tx.delete(tenantSkus).where(eq(tenantSkus.tenantId, ctx.tenant.id));
    await tx.delete(snapshots).where(eq(snapshots.tenantId, ctx.tenant.id));
    await tx
      .update(tenants)
      .set({ tid: null, consentedAt: null })
      .where(eq(tenants.id, ctx.tenant.id));
  });
  await audit(ctx, "microsoft_disconnected", {});
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

export type ImportSeatsResult = ActionResult & {
  /** Seats written for the provider. */
  imported: number;
  /** Lines that could not be parsed into a member. */
  invalid: number;
};

/**
 * Replace a CSV-import connector's seat snapshot (chatgpt/claude) with the
 * pasted member table. The new snapshot fully replaces the previous one; the
 * analysis re-runs so findings appear or auto-resolve immediately.
 */
export const importSeats = async (
  formData: FormData,
): Promise<ImportSeatsResult> => {
  const none = (r: ActionResult): ImportSeatsResult => ({
    ...r,
    imported: 0,
    invalid: 0,
  });
  const ctx = await apiAccess("admin");
  if (!ctx) return none(fail("Not allowed"));
  if (ctx.tenant.isDemo)
    return none(fail("The demo workspace ships with demo connector data"));

  const providerValue = formData.get("provider");
  const providerRaw =
    typeof providerValue === "string" ? providerValue.trim() : "";
  if (!isSaasProvider(providerRaw) || !isImportProvider(providerRaw))
    return none(fail("Unknown connector"));
  const provider = providerRaw;
  const spec = connectorSpec(provider);

  const raw = formData.get("csv");
  const text = typeof raw === "string" ? raw : "";
  if (text.trim() === "") return none(fail("Paste the member table first"));
  if (text.length > 1_000_000)
    return none(fail("Paste is too large. Split the export and import it in parts"));

  const parsed = parseMembers(text);
  if ("error" in parsed) return none(fail(parsed.error));
  if (parsed.rows.length === 0)
    return none(
      fail("No member rows recognized. Paste the table including its header row"),
    );

  const now = new Date();
  const rows = parsed.rows.map((m) => ({
    tenantId: ctx.tenant.id,
    provider,
    email: m.email,
    displayName: m.displayName,
    status: m.status,
    products: m.products ?? [spec.label],
    lastActiveAt: m.lastActiveAt,
    syncedAt: now,
  }));

  await db
    .delete(saasSeats)
    .where(
      and(
        eq(saasSeats.tenantId, ctx.tenant.id),
        eq(saasSeats.provider, provider),
      ),
    );
  for (const batch of chunk(rows, 250)) {
    await db.insert(saasSeats).values(batch);
  }

  // Prefill price keys for the imported products so they appear on the
  // licenses page; admins enter real per-seat prices there.
  const products = [...new Set(rows.flatMap((r) => r.products))];
  if (products.length > 0) {
    await db
      .insert(priceBook)
      .values(
        products.map((p) => ({
          tenantId: ctx.tenant.id,
          skuId: `${provider}:${p}`,
          monthlyPriceCents: 0,
          source: "default" as const,
        })),
      )
      .onConflictDoNothing();
  }

  await audit(ctx, "seats_imported", {
    provider,
    imported: rows.length,
    invalid: parsed.invalid.length,
  });
  await startTrialOnFirstConnect(ctx.tenant.id);
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return { ok: true, imported: rows.length, invalid: parsed.invalid.length };
};

/** Remove an import connector's seat snapshot; findings auto-resolve. */
export const clearImportedSeats = async (
  providerRaw: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo)
    return fail("The demo workspace ships with demo connector data");
  if (!isSaasProvider(providerRaw) || !isImportProvider(providerRaw))
    return fail("Unknown connector");
  const provider = providerRaw;

  await db
    .delete(saasSeats)
    .where(
      and(
        eq(saasSeats.tenantId, ctx.tenant.id),
        eq(saasSeats.provider, provider),
      ),
    );
  await audit(ctx, "seats_import_cleared", { provider });
  await runAnalysis(ctx.tenant.id);
  revalidateApp();
  return ok();
};

/** Switch the active workspace (MSP/multi-tenant users). */
export const switchWorkspace = async (
  tenantId: string,
): Promise<ActionResult> => {
  const ctx = await apiAccess("viewer");
  if (!ctx) return fail("Not allowed");
  const target = ctx.workspaces.find((w) => w.id === tenantId);
  if (!target) return fail("Unknown workspace");
  (await cookies()).set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());
  await audit(ctx, "workspace_switched", { to: target.name });
  revalidateApp();
  return ok();
};

/**
 * Public email capture from the landing page (no auth, just visitors).
 * Honeypot field + format check + unique constraint keep junk out.
 */
export const captureEmail = async (
  formData: FormData,
): Promise<ActionResult> => {
  if (formData.get("website")) return ok(); // honeypot: pretend success to bots
  const ip = clientIp(await headers());
  if (!(await rateLimitDurable(`capture:${ip}`, 5, 60 * 60 * 1000))) {
    return fail("Too many attempts, please try again later");
  }
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("Please enter a valid email address");
  }
  // On a repeat signup, clear any prior unsubscribe so a fresh sign-up actually
  // re-subscribes (the unsubscribe page tells users to "sign up again"): without
  // this, unsubscribedAt stays set and maybeSendWelcome early-returns forever.
  // The xmax=0 trick distinguishes a genuine INSERT from an UPDATE so the ops
  // ping still fires only for brand-new addresses.
  const [row] = await db
    .insert(emailSignups)
    .values({ email, source: "landing" })
    .onConflictDoUpdate({
      target: emailSignups.email,
      set: { unsubscribedAt: null },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  if (row?.inserted) {
    void notifyOps(`new email signup from the landing page: ${email}`);
  }
  // Duplicates go through the same send path: the welcomeSentAt stamp makes
  // it a no-op once delivered, so resubmitting the form is the natural retry
  // after a transient send failure. Rows captured before the welcome email
  // existed are only mailed if the person resubmits (intended). Clearing
  // unsubscribedAt above lets maybeSendWelcome proceed for re-subscribers.
  // after() lets the form respond immediately while the send still completes
  // before the serverless function freezes.
  after(() => maybeSendWelcome(email));
  return ok();
};

/** Deletes the workspace and all synced data (cascade). Owner only. */
export const disconnectTenant = async (): Promise<ActionResult> => {
  const ctx = await apiAccess("owner");
  if (!ctx) return fail("Not allowed");
  if (ctx.tenant.isDemo) return fail("The demo workspace cannot be disconnected");

  // Cancel the Stripe subscription and erase the Stripe customer BEFORE the
  // local delete, while we still hold the ids. A failed subscription cancel is
  // a billing-continuation risk: ABORT so the row reconcileTenantSubscription
  // needs to retry is not lost and the card stops being charged on retry. A
  // customer-PII-delete failure stays best-effort (invoices are retained
  // anyway) and does not block. The late customer.subscription.deleted webhook
  // no-ops once the tenant row is gone.
  if (billingEnabled()) {
    const { subscriptionCancelFailed } = await teardownTenantBilling(ctx.tenant);
    if (subscriptionCancelFailed) {
      return fail(
        "We couldn't cancel your Stripe subscription right now — your workspace was NOT deleted so you won't keep being billed. Please try again in a minute or contact support.",
      );
    }
  }

  const actor = ctx.membership.name ?? ctx.membership.email;
  // Resolve the OTHER admins/owners NOW, while the memberships still exist (they
  // cascade-delete with the tenant). Exclude the actor — they triggered it. The
  // send itself is deferred to after() and best-effort: a failure must not block
  // the deletion.
  if (emailEnabled()) {
    const actorEmail = ctx.membership.email.toLowerCase();
    const others = (await workspaceAdminEmails(ctx.tenant.id)).filter(
      (email) => email.toLowerCase() !== actorEmail,
    );
    const tenant = ctx.tenant;
    after(() =>
      sendWorkspaceDeleted(tenant, actor, others).catch(() => null),
    );
  }

  // Durable audit: the in-table auditLog row cascade-deletes WITH the tenant
  // (schema FK onDelete:"cascade"), so an audit() row would be wiped and is
  // useless here. notifyOps is the durable, off-table signal of the deletion.
  void notifyOps(
    `workspace deleted: ${ctx.tenant.id} "${workspaceLabel(ctx.tenant)}" by ${actor}`,
  );

  // Erase the WorkOS Organization + its IdP/Directory records (GDPR). Only set
  // under workos auth. Best-effort and non-throwing: unlike a live subscription
  // there is no ongoing charge, so a WorkOS outage must not block local delete.
  if (ctx.tenant.workosOrgId) {
    await teardownTenantWorkosOrg(ctx.tenant.workosOrgId);
  }

  await db.delete(tenants).where(eq(tenants.id, ctx.tenant.id));
  revalidatePath("/", "layout");
  redirect("/");
};
