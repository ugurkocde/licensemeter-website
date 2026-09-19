import { eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/server/db";
import { emailBlocks, emailDeliveries } from "~/server/db/schema";
import {
  DELIVERY_TAG,
  deliveryEvent,
  deliveryStatusForEvent,
  isPermanentFailure,
  shouldApplyDeliveryEvent,
} from "~/server/emailDeliveryPolicy";

/**
 * Apply one delivery webhook to the ledger. Call only after the signature was
 * verified. Payloads that are malformed, of an untracked type or about a
 * message the ledger does not know are dropped without an error, so the
 * provider is never told to retry them; a database error does throw. The row
 * lock makes duplicate and concurrent events safe.
 */
export const applyDeliveryEvent = async (input: unknown): Promise<void> => {
  const parsed = deliveryEvent.safeParse(input);
  if (!parsed.success) return;
  const { type, created_at, data } = parsed.data;
  const status = deliveryStatusForEvent(type);
  if (!status) return;
  // The tag covers an event that arrives before the provider id was stored.
  const tagged = z.string().uuid().safeParse(data.tags?.[DELIVERY_TAG]);

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(emailDeliveries)
      .where(
        or(
          eq(emailDeliveries.providerId, data.email_id),
          tagged.success ? eq(emailDeliveries.id, tagged.data) : undefined,
        ),
      )
      .for("update");
    // The provider id is the stronger match, should the two ever disagree.
    const row =
      rows.find((r) => r.providerId === data.email_id) ??
      rows.find((r) => r.providerId === null);
    if (
      !row ||
      !data.to.some((to) => to.trim().toLowerCase() === row.recipient)
    ) {
      return;
    }

    // A permanent failure always blocks future mail, even when its event is
    // late and no longer changes the row.
    if (isPermanentFailure(status)) {
      await tx
        .insert(emailBlocks)
        .values({
          tenantId: row.tenantId,
          email: row.recipient,
          reason: status,
        })
        .onConflictDoNothing();
    }
    const eventAt = new Date(created_at);
    if (
      !shouldApplyDeliveryEvent(
        row.deliveryStatus,
        row.deliveryEventAt,
        status,
        eventAt,
      )
    ) {
      return;
    }
    await tx
      .update(emailDeliveries)
      .set({
        deliveryStatus: status,
        deliveryEventAt: eventAt,
        providerId: data.email_id,
      })
      .where(eq(emailDeliveries.id, row.id));
  });
};
