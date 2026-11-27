"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { siteUrl } from "~/env";
import {
  apiAccess,
  apiFeatureAccess,
  type AccessContext,
} from "~/server/access";
import { audit } from "~/server/audit";
import { getBranding } from "~/server/billing/branding";
import { db } from "~/server/db";
import { reportRecipients } from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";
import { rateLimitDurable } from "~/server/rateLimit";
import { loadExecutiveSummary } from "~/server/report/executiveData";
import {
  MAX_RECIPIENTS_PER_KIND,
  recipientEmailSchema,
  recipientNameSchema,
  removeRecipient,
  sendRecipientVerification,
  upsertRecipient,
} from "~/server/report/recipients";
import {
  createShareLink,
  isShareMode,
  isShareTtl,
  MAX_ACTIVE_LINKS,
  revokeShareLink,
  SHARE_LABEL_MAX,
} from "~/server/report/shareLinks";

/**
 * Share links to the executive report and the finance recipients of its
 * monthly email. Creating either needs the executive report (Pro and MSP) and
 * an owner or admin; taking access away (revoking a link, removing a
 * recipient) needs the role only, so it keeps working after a downgrade. The
 * shared demo workspace can do neither: every visitor is an admin there.
 */

export type ShareActionResult =
  { ok: true; url: string; label: string } | { ok: false; error: string };

export type SimpleResult = { ok: boolean; error?: string };

type Gate = { ctx: AccessContext } | { error: string };

const DEMO_ERROR =
  "The demo workspace cannot share reports or email people outside it. Connect your own workspace to do this.";
const PLAN_ERROR = "Sharing the executive report is included in Pro.";

const createGate = async (): Promise<Gate> => {
  const access = await apiFeatureAccess("execReport", "admin");
  if (access.denied === "featureRequired") return { error: PLAN_ERROR };
  if (!access.ctx) return { error: "Not allowed" };
  if (access.ctx.tenant.isDemo || access.ctx.user.isDemo) {
    return { error: DEMO_ERROR };
  }
  return { ctx: access.ctx };
};

const removeGate = async (): Promise<Gate> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return { error: "Not allowed" };
  if (ctx.tenant.isDemo || ctx.user.isDemo) return { error: DEMO_ERROR };
  return { ctx };
};

const labelSchema = z.string().trim().min(1).max(SHARE_LABEL_MAX);
const idSchema = z.guid();

const revalidate = () => {
  revalidatePath("/app/reports/executive");
  revalidatePath("/app/settings");
};

export async function createShareLinkAction(
  formData: FormData,
): Promise<ShareActionResult> {
  const gated = await createGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;

  const label = labelSchema.safeParse(formData.get("label"));
  if (!label.success) {
    return {
      ok: false,
      error: `Name the link in up to ${SHARE_LABEL_MAX} characters, for example: CFO November review.`,
    };
  }
  const mode = formData.get("mode");
  const ttl = Number(formData.get("ttl"));
  if (!isShareMode(mode) || !isShareTtl(ttl)) {
    return {
      ok: false,
      error: "Pick a link type and how long it stays valid.",
    };
  }
  if (
    !(await rateLimitDurable(
      `share-link:${ctx.tenant.id}`,
      20,
      60 * 60 * 1000,
      "deny",
    ))
  ) {
    return {
      ok: false,
      error: "Too many links created this hour. Try again later.",
    };
  }

  const now = new Date();
  // A snapshot freezes what the report shows right now, marks included.
  const snapshot =
    mode === "snapshot"
      ? await withTenant(db, ctx.tenant.id, async () => {
          const [summary, branding] = await Promise.all([
            loadExecutiveSummary(ctx.tenant, ctx.entitlement, now),
            getBranding(ctx.tenant, ctx.entitlement),
          ]);
          return { version: 1 as const, summary, branding };
        })
      : undefined;
  const created = await createShareLink(
    {
      tenantId: ctx.tenant.id,
      label: label.data,
      mode,
      ttlDays: ttl,
      createdByKey: ctx.user.oid,
      snapshot,
    },
    now,
  );
  if (!created.ok) {
    return {
      ok: false,
      error: `A workspace can have ${MAX_ACTIVE_LINKS} active links. Revoke one first.`,
    };
  }
  await audit(ctx, "report_share_link_created", {
    linkId: created.link.id,
    label: created.link.label,
    mode: created.link.mode,
    prefix: created.link.tokenPrefix,
    expiresAt: created.link.expiresAt.toISOString(),
  });
  revalidate();
  return {
    ok: true,
    url: `${siteUrl()}/r/${created.token}`,
    label: created.link.label,
  };
}

export async function revokeShareLinkAction(
  linkId: string,
): Promise<SimpleResult> {
  const gated = await removeGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;
  const id = idSchema.safeParse(linkId);
  // The workspace id is part of the match, so an id from another workspace
  // reads the same as one that does not exist.
  const revoked = id.success
    ? await revokeShareLink(ctx.tenant.id, id.data)
    : null;
  if (!revoked) return { ok: false, error: "Link not found" };
  await audit(ctx, "report_share_link_revoked", {
    linkId: revoked.id,
    label: revoked.label,
    mode: revoked.mode,
    prefix: revoked.tokenPrefix,
  });
  revalidate();
  return { ok: true };
}

/** Confirmation emails per workspace and day; every one mails a stranger. */
const VERIFICATION_SENDS_PER_DAY = 5;

const requestVerification = async (
  ctx: AccessContext,
  email: string,
  name: string | null,
): Promise<SimpleResult> => {
  const allowed = await rateLimitDurable(
    `report-recipient:${ctx.tenant.id}`,
    VERIFICATION_SENDS_PER_DAY,
    24 * 60 * 60 * 1000,
    "deny",
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Too many confirmation emails today. Try again tomorrow.",
    };
  }
  const upserted = await upsertRecipient({
    tenantId: ctx.tenant.id,
    kind: "finance",
    email,
    name,
  });
  if (!upserted.ok) {
    return {
      ok: false,
      error: `A workspace can have ${MAX_RECIPIENTS_PER_KIND} finance recipients. Remove one first.`,
    };
  }
  if (!(await sendRecipientVerification(upserted.recipient, upserted.token))) {
    return {
      ok: false,
      error: "The confirmation email could not be sent to that address.",
    };
  }
  await audit(ctx, "report_recipient_requested", { kind: "finance", email });
  revalidate();
  return { ok: true };
};

export async function addFinanceRecipientAction(
  formData: FormData,
): Promise<SimpleResult> {
  const gated = await createGate();
  if ("error" in gated) {
    return {
      ok: false,
      error:
        gated.error === PLAN_ERROR
          ? "The monthly executive report to finance is included in Pro."
          : gated.error,
    };
  }
  const email = recipientEmailSchema.safeParse(formData.get("email"));
  if (!email.success)
    return { ok: false, error: "Enter a valid email address" };
  const name = recipientNameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return { ok: false, error: "The name is too long" };
  return requestVerification(gated.ctx, email.data, name.data);
}

/** Sends a recipient's confirmation link again; the older link stops working. */
export async function resendFinanceRecipientAction(
  recipientId: string,
): Promise<SimpleResult> {
  const gated = await createGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;
  const id = idSchema.safeParse(recipientId);
  const row = id.success
    ? await db.query.reportRecipients.findFirst({
        where: and(
          eq(reportRecipients.tenantId, ctx.tenant.id),
          eq(reportRecipients.id, id.data),
          eq(reportRecipients.kind, "finance"),
        ),
      })
    : undefined;
  if (!row) return { ok: false, error: "Recipient not found" };
  return requestVerification(ctx, row.email, null);
}

export async function removeFinanceRecipientAction(
  recipientId: string,
): Promise<SimpleResult> {
  const gated = await removeGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;
  const id = idSchema.safeParse(recipientId);
  const removed = id.success
    ? await removeRecipient(ctx.tenant.id, id.data)
    : null;
  if (!removed) return { ok: false, error: "Recipient not found" };
  await audit(ctx, "report_recipient_removed", {
    kind: removed.kind,
    email: removed.email,
  });
  revalidate();
  return { ok: true };
}
