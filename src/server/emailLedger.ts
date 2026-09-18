import { createHash } from "node:crypto";

import { and, eq, lt, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { emailDeliveries } from "~/server/db/schema";
import type { EmailJob } from "~/server/emailPeriods";

/**
 * Delivery ledger for the scheduled emails. Every send is claimed first:
 * one row per (tenant, job, period, recipient), guarded by a unique index, so
 * two overlapping runs can never both win the same recipient and a repeated
 * run only reaches people who have not received this period's email yet.
 */

/** A failed delivery is retried by later runs until it has failed this often. */
export const MAX_ATTEMPTS = 3;
/** A claim this old belongs to a run that crashed or was cut off mid-send. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;
/** Ledger rows older than this are deleted by the monthly report run. */
export const LEDGER_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;

export type DeliveryKey = {
  tenantId: string;
  job: EmailJob;
  periodKey: string;
  /** Any casing; the ledger stores and compares the lowercased address. */
  recipient: string;
};

export type ClaimResult =
  | { won: true; id: string }
  /** Lost: the status of the row that blocks this claim. */
  | { won: false; status: "sent" | "claimed" | "failed" };

const normalize = (recipient: string): string => recipient.trim().toLowerCase();

/**
 * Try to become the one sender for this delivery. Wins when no row exists,
 * when the previous attempt failed fewer than MAX_ATTEMPTS times, or when a
 * previous claim went stale. A sent row is never claimed again. The whole
 * decision is a single INSERT ... ON CONFLICT DO UPDATE ... WHERE statement,
 * so concurrent runs are serialized by the unique index.
 */
export const claimDelivery = async (
  key: DeliveryKey,
  now: Date = new Date(),
): Promise<ClaimResult> => {
  const recipient = normalize(key.recipient);
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const [won] = await db
    .insert(emailDeliveries)
    .values({
      tenantId: key.tenantId,
      job: key.job,
      periodKey: key.periodKey,
      recipient,
      status: "claimed",
      claimedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        emailDeliveries.tenantId,
        emailDeliveries.job,
        emailDeliveries.periodKey,
        emailDeliveries.recipient,
      ],
      set: { status: "claimed", claimedAt: now, error: null },
      setWhere: or(
        and(
          eq(emailDeliveries.status, "failed"),
          lt(emailDeliveries.attempts, MAX_ATTEMPTS),
        ),
        and(
          eq(emailDeliveries.status, "claimed"),
          lt(emailDeliveries.claimedAt, staleBefore),
        ),
      ),
    })
    .returning({ id: emailDeliveries.id });
  if (won) return { won: true, id: won.id };

  const blocking = await db.query.emailDeliveries.findFirst({
    where: and(
      eq(emailDeliveries.tenantId, key.tenantId),
      eq(emailDeliveries.job, key.job),
      eq(emailDeliveries.periodKey, key.periodKey),
      eq(emailDeliveries.recipient, recipient),
    ),
    columns: { status: true },
  });
  // The row can only be missing if the tenant was deleted in between; report
  // it as held so the caller sends nothing.
  return { won: false, status: blocking?.status ?? "claimed" };
};

/** The claimed delivery went out. */
export const completeDelivery = async (
  id: string,
  now: Date = new Date(),
): Promise<void> => {
  await db
    .update(emailDeliveries)
    .set({ status: "sent", sentAt: now, error: null })
    .where(eq(emailDeliveries.id, id));
};

/** Keep the stored reason short and free of addresses or response bodies. */
const shortError = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err))
    .replace(/[^\s@]+@[^\s@]+/g, "[address]")
    .slice(0, 200);

/** The claimed delivery failed; later runs may retry it up to MAX_ATTEMPTS. */
export const failDelivery = async (id: string, err: unknown): Promise<void> => {
  await db
    .update(emailDeliveries)
    .set({
      status: "failed",
      attempts: sql`${emailDeliveries.attempts} + 1`,
      error: shortError(err),
    })
    .where(eq(emailDeliveries.id, id));
};

/**
 * Deterministic provider-side idempotency key for one delivery: the second
 * layer behind the ledger, for a run that crashed after the provider accepted
 * the email but before the row was marked sent.
 */
export const deliveryIdempotencyKey = (key: DeliveryKey): string =>
  `licensemeter-${key.job}-${createHash("sha256")
    .update(
      [key.tenantId, key.job, key.periodKey, normalize(key.recipient)].join(
        "\n",
      ),
    )
    .digest("hex")}`;

/** Housekeeping: drop rows past the retention window. Returns the row count. */
export const pruneDeliveries = async (
  now: Date = new Date(),
): Promise<number> => {
  const deleted = await db
    .delete(emailDeliveries)
    .where(
      lt(
        emailDeliveries.createdAt,
        new Date(now.getTime() - LEDGER_RETENTION_MS),
      ),
    )
    .returning({ id: emailDeliveries.id });
  return deleted.length;
};
