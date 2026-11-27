import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { env, siteUrl } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { SUPPORT_EMAIL } from "~/lib/support";
import { db } from "~/server/db";
import {
  auditLog,
  reportRecipients,
  tenants,
  type ReportRecipientRow,
} from "~/server/db/schema";
import { reportRecipientVerifyHtml, sendEmail } from "~/server/email";
import type { ReportRecipientKind } from "~/server/types";
import { makeRecipientUnsubToken } from "~/server/unsubToken";

/**
 * People outside the workspace who receive a scheduled report by email, such
 * as the CFO getting the monthly executive report. Nobody signs in for them,
 * so an address proves itself by email, like the shared notification
 * address: a request stores only the sha256 of a random token, the confirm
 * page spends it once, and nothing is sent to the address before that. Each
 * address has its own one-click unsubscribe that only ever touches its own
 * row. At most MAX_RECIPIENTS_PER_KIND per workspace and kind.
 *
 * Only kind "finance" has a product surface; "client" is reserved.
 */

export const MAX_RECIPIENTS_PER_KIND = 5;
/** A confirmation link is good for this long. Finance mailboxes are slow. */
export const RECIPIENT_TOKEN_TTL_HOURS = 72;
const TOKEN_TTL_MS = RECIPIENT_TOKEN_TTL_HOURS * 60 * 60 * 1000;
export const RECIPIENT_NAME_MAX = 80;

export const recipientEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export const recipientNameSchema = z
  .string()
  .trim()
  .max(RECIPIENT_NAME_MAX)
  .transform((v) => (v === "" ? null : v));

/** Shape of the confirm link; the token is checked against the stored hash. */
export const recipientVerificationInput = z.object({
  r: z.guid(),
  token: z.string().regex(/^[0-9a-f]{64}$/),
});

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export type RecipientState = "pending" | "verified" | "unsubscribed";

/** Where a recipient stands, for the Settings list. */
export const recipientState = (
  row: Pick<ReportRecipientRow, "verifiedAt" | "unsubscribedAt">,
): RecipientState =>
  row.unsubscribedAt ? "unsubscribed" : row.verifiedAt ? "verified" : "pending";

export const listRecipients = (
  tenantId: string,
  kind: ReportRecipientKind,
): Promise<ReportRecipientRow[]> =>
  db
    .select()
    .from(reportRecipients)
    .where(
      and(
        eq(reportRecipients.tenantId, tenantId),
        eq(reportRecipients.kind, kind),
      ),
    )
    .orderBy(asc(reportRecipients.createdAt));

/** Confirmed addresses that have not unsubscribed: the ones that get mail. */
export const deliverableRecipients = (
  tenantId: string,
  kind: ReportRecipientKind,
): Promise<Pick<ReportRecipientRow, "id" | "email" | "name">[]> =>
  db
    .select({
      id: reportRecipients.id,
      email: reportRecipients.email,
      name: reportRecipients.name,
    })
    .from(reportRecipients)
    .where(
      and(
        eq(reportRecipients.tenantId, tenantId),
        eq(reportRecipients.kind, kind),
        isNotNull(reportRecipients.verifiedAt),
        isNull(reportRecipients.unsubscribedAt),
      ),
    )
    .orderBy(asc(reportRecipients.createdAt));

/** The token-signed one-click unsubscribe link of one recipient. */
export const recipientUnsubscribeUrl = (
  recipientId: string,
  kind: ReportRecipientKind,
): string => {
  const t = makeRecipientUnsubToken(recipientId, kind, env.AUTH_SECRET);
  return `${siteUrl()}/api/unsubscribe?r=${recipientId}&k=${kind}&t=${t}`;
};

export type UpsertRecipientResult =
  | { ok: true; recipient: ReportRecipientRow; token: string }
  | { ok: false; error: "limit" };

/**
 * Adds an address, or files a fresh confirmation for one that is already on
 * the list (replacing its older link). The workspace row is locked for the
 * count and the write, so two concurrent requests cannot pass the cap. A
 * confirmed address that is asked again stays confirmed; an unsubscribed one
 * stays unsubscribed until somebody there confirms the new link.
 */
export const upsertRecipient = async (
  input: {
    tenantId: string;
    kind: ReportRecipientKind;
    email: string;
    name: string | null;
  },
  now: Date = new Date(),
): Promise<UpsertRecipientResult> => {
  const token = randomBytes(32).toString("hex");
  const pending = {
    verifyTokenHash: hashToken(token),
    verifyExpiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
    updatedAt: now,
  };
  return db.transaction(async (tx) => {
    await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    const [existing] = await tx
      .select({ id: reportRecipients.id })
      .from(reportRecipients)
      .where(
        and(
          eq(reportRecipients.tenantId, input.tenantId),
          eq(reportRecipients.kind, input.kind),
          eq(reportRecipients.email, input.email),
        ),
      );
    if (existing) {
      const [recipient] = await tx
        .update(reportRecipients)
        .set({
          ...pending,
          ...(input.name !== null ? { name: input.name } : {}),
        })
        .where(eq(reportRecipients.id, existing.id))
        .returning();
      return { ok: true, recipient: recipient!, token } as const;
    }
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(reportRecipients)
      .where(
        and(
          eq(reportRecipients.tenantId, input.tenantId),
          eq(reportRecipients.kind, input.kind),
        ),
      );
    if ((count?.count ?? 0) >= MAX_RECIPIENTS_PER_KIND) {
      return { ok: false, error: "limit" } as const;
    }
    const [recipient] = await tx
      .insert(reportRecipients)
      .values({
        tenantId: input.tenantId,
        kind: input.kind,
        email: input.email,
        name: input.name,
        createdAt: now,
        ...pending,
      })
      .returning();
    return { ok: true, recipient: recipient!, token } as const;
  });
};

/**
 * Mails the confirmation link of a request upsertRecipient just filed.
 * Returns false when the mail did not go out, and then clears only the token
 * this request wrote, so a newer request made meanwhile survives.
 */
export const sendRecipientVerification = async (
  recipient: Pick<ReportRecipientRow, "id" | "tenantId" | "email">,
  token: string,
): Promise<boolean> => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, recipient.tenantId),
    columns: { name: true, tid: true },
  });
  const tenantName = tenant ? workspaceLabel(tenant) : "a workspace";
  try {
    const sent = await sendEmail({
      to: [recipient.email],
      replyTo: SUPPORT_EMAIL,
      subject: `Confirm the monthly executive report from ${tenantName}`,
      html: reportRecipientVerifyHtml({
        tenantName,
        confirmUrl: `${siteUrl()}/api/reports/recipients/verify?r=${recipient.id}&token=${token}`,
        appUrl: siteUrl(),
        hours: RECIPIENT_TOKEN_TTL_HOURS,
      }),
    });
    if (!sent) throw new Error("email is not configured");
    return true;
  } catch (err) {
    console.error("[report-recipient] verification email failed", err);
    await db
      .update(reportRecipients)
      .set({ verifyTokenHash: null, verifyExpiresAt: null })
      .where(
        and(
          eq(reportRecipients.id, recipient.id),
          eq(reportRecipients.verifyTokenHash, hashToken(token)),
        ),
      );
    return false;
  }
};

/**
 * Spends a confirmation link: one transaction on the locked row, so two POSTs
 * with the same token cannot both win. Confirming also clears an earlier
 * unsubscribe, because the person reading the mailbox just asked for the
 * report again. False for anything that does not match an unexpired request.
 */
export const confirmRecipient = async (
  recipientId: string,
  token: string,
  now: Date = new Date(),
): Promise<boolean> => {
  if (
    !recipientVerificationInput.safeParse({ r: recipientId, token }).success
  ) {
    return false;
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reportRecipients)
      .where(
        and(
          eq(reportRecipients.id, recipientId),
          eq(reportRecipients.verifyTokenHash, hashToken(token)),
          gt(reportRecipients.verifyExpiresAt, now),
        ),
      )
      .for("update");
    if (!row) return false;
    await tx
      .update(reportRecipients)
      .set({
        verifiedAt: now,
        unsubscribedAt: null,
        verifyTokenHash: null,
        verifyExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(reportRecipients.id, recipientId));
    // Confirmed by whoever reads that mailbox, not by a signed-in member.
    await tx.insert(auditLog).values({
      tenantId: row.tenantId,
      actorOid: "report-recipient",
      actorEmail: row.email,
      action: "report_recipient_verified",
      detail: { kind: row.kind },
    });
    return true;
  });
};

/**
 * One-click unsubscribe of one recipient. Only ever writes unsubscribed_at on
 * that row. Idempotent; zero rows for a removed recipient is the same answer.
 */
export const unsubscribeRecipient = async (
  recipientId: string,
  kind: ReportRecipientKind,
  now: Date = new Date(),
): Promise<void> => {
  await db
    .update(reportRecipients)
    .set({ unsubscribedAt: now, updatedAt: now })
    .where(
      and(
        eq(reportRecipients.id, recipientId),
        eq(reportRecipients.kind, kind),
        isNull(reportRecipients.unsubscribedAt),
      ),
    );
};

/** Removes a recipient of this workspace; its links die with the row. */
export const removeRecipient = async (
  tenantId: string,
  recipientId: string,
): Promise<ReportRecipientRow | null> => {
  const [row] = await db
    .delete(reportRecipients)
    .where(
      and(
        eq(reportRecipients.tenantId, tenantId),
        eq(reportRecipients.id, recipientId),
      ),
    )
    .returning();
  return row ?? null;
};

/** Workspace name for the confirm and unsubscribe pages. */
export const recipientWorkspaceName = async (
  recipientId: string,
): Promise<string> => {
  const [row] = await db
    .select({ name: tenants.name, tid: tenants.tid })
    .from(reportRecipients)
    .innerJoin(tenants, eq(tenants.id, reportRecipients.tenantId))
    .where(eq(reportRecipients.id, recipientId))
    .limit(1);
  return row ? workspaceLabel(row) : "this workspace";
};
