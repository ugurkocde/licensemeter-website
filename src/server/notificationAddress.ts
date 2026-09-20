import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { siteUrl } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { SUPPORT_EMAIL } from "~/lib/support";
import { db } from "~/server/db";
import {
  auditLog,
  notificationAddresses,
  tenants,
  type NotificationAddressRow,
} from "~/server/db/schema";
import { notificationAddressHtml, sendEmail } from "~/server/email";
import type { EmailJob } from "~/server/emailPeriods";

/**
 * The workspace's one shared notification address: a team mailbox that gets
 * the workspace email in addition to the owners and admins. Nobody signs in
 * for it, so the address proves itself by email: a request stores only the
 * sha256 of a random token, the confirm page spends it once, and the address
 * that is already verified keeps its mail the whole time.
 */

/** A verification link is good for this long, then it is dead. */
export const TOKEN_TTL_HOURS = 24;
const TOKEN_TTL_MS = TOKEN_TTL_HOURS * 60 * 60 * 1000;

/** The three workspace emails the shared address has its own switch for. */
export type SharedEmailJob = EmailJob | "leak";

/** What an admin may type in. Stored trimmed and lowercased. */
export const sharedAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

/** Shape of the confirm link; the HMAC-free token is checked against the hash. */
export const verificationInput = z.object({
  workspace: z.string().uuid(),
  token: z.string().regex(/^[0-9a-f]{64}$/),
});

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const loadSharedAddress = async (
  tenantId: string,
): Promise<NotificationAddressRow | null> =>
  (await db.query.notificationAddresses.findFirst({
    where: eq(notificationAddresses.tenantId, tenantId),
  })) ?? null;

/**
 * The verified shared address when it takes this job's email, otherwise null.
 * A pending address is never returned: it has not proved itself yet.
 */
export const sharedRecipient = async (
  tenantId: string,
  job: SharedEmailJob,
): Promise<string | null> => {
  const row = await loadSharedAddress(tenantId);
  if (!row?.email || !row.verifiedAt) return null;
  const wanted =
    job === "digest"
      ? row.digest
      : job === "report"
        ? row.report
        : row.leakAlerts;
  return wanted ? row.email.trim() : null;
};

/**
 * Store one pending request and mail the link. Replacing a request voids the
 * older link, because a row holds exactly one token hash. Returns false when
 * the mail did not go out, and then clears only the request this call wrote,
 * so a newer request made meanwhile survives.
 */
export const requestVerification = async (
  tenantId: string,
  email: string,
): Promise<boolean> => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const pending = {
    pendingEmail: email,
    tokenHash,
    tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    updatedAt: new Date(),
  };
  await db
    .insert(notificationAddresses)
    .values({ tenantId, ...pending })
    .onConflictDoUpdate({
      target: notificationAddresses.tenantId,
      set: pending,
    });

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { name: true, tid: true },
  });
  const tenantName = tenant ? workspaceLabel(tenant) : "your workspace";
  try {
    const sent = await sendEmail({
      to: [email],
      replyTo: SUPPORT_EMAIL,
      subject: `Confirm that ${tenantName} may email this address`,
      html: notificationAddressHtml({
        tenantName,
        confirmUrl: `${siteUrl()}/api/notifications/verify?workspace=${tenantId}&token=${token}`,
        appUrl: siteUrl(),
        hours: TOKEN_TTL_HOURS,
      }),
    });
    if (!sent) throw new Error("email is not configured");
    return true;
  } catch (err) {
    console.error("[notification-address] verification email failed", err);
    await db
      .update(notificationAddresses)
      .set({
        pendingEmail: null,
        tokenHash: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationAddresses.tenantId, tenantId),
          eq(notificationAddresses.tokenHash, tokenHash),
        ),
      );
    return false;
  }
};

/**
 * Spend a confirmation link: one transaction on the locked row, so two POSTs
 * with the same token cannot both win. Returns false for anything that does
 * not match an unexpired pending request, which also covers a second use.
 */
export const confirmAddress = async (
  tenantId: string,
  token: string,
): Promise<boolean> => {
  if (!verificationInput.safeParse({ workspace: tenantId, token }).success) {
    return false;
  }
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(notificationAddresses)
      .where(
        and(
          eq(notificationAddresses.tenantId, tenantId),
          eq(notificationAddresses.tokenHash, hashToken(token)),
          gt(notificationAddresses.tokenExpiresAt, new Date()),
        ),
      )
      .for("update");
    if (!pending?.pendingEmail) return false;
    const now = new Date();
    await tx
      .update(notificationAddresses)
      .set({
        email: pending.pendingEmail,
        verifiedAt: now,
        pendingEmail: null,
        tokenHash: null,
        tokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(notificationAddresses.tenantId, tenantId));
    // Confirmed by whoever reads that mailbox, not by a signed-in member. The
    // token stays out of the row: only the address it proved is recorded.
    await tx.insert(auditLog).values({
      tenantId,
      actorOid: "notification-address",
      actorEmail: pending.pendingEmail,
      action: "notification_address_verified",
    });
    return true;
  });
};

/** Turn one of the three emails on or off for the shared address. */
export const setSharedJob = async (
  tenantId: string,
  job: SharedEmailJob,
  enabled: boolean,
): Promise<void> => {
  await db
    .update(notificationAddresses)
    .set({
      ...(job === "digest"
        ? { digest: enabled }
        : job === "report"
          ? { report: enabled }
          : { leakAlerts: enabled }),
      updatedAt: new Date(),
    })
    .where(eq(notificationAddresses.tenantId, tenantId));
};

/** Drop the address and any pending request; the link dies with the row. */
export const removeSharedAddress = async (tenantId: string): Promise<void> => {
  await db
    .delete(notificationAddresses)
    .where(eq(notificationAddresses.tenantId, tenantId));
};
