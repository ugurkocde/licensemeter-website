import { sendEmailWithReceipt, type EmailArgs } from "~/server/email";
import { DELIVERY_TAG } from "~/server/emailDeliveryPolicy";
import {
  claimDelivery,
  completeDelivery,
  deliveryIdempotencyKey,
  failDelivery,
  isBlocked,
  type DeliveryKey,
} from "~/server/emailLedger";

/** Named like the JobTotals counters, so a job can count an outcome directly. */
export type DeliveryOutcome =
  "sent" | "failed" | "skippedAlreadySent" | "skippedBlocked";

/**
 * One ledger-tracked message to one recipient: skip a blocked address, claim,
 * send, record. Shared by the scheduled emails and the leak alert. The message
 * is only asked for after a won claim. A send failure is recorded on the row
 * and reported as "failed", never thrown.
 */
export const deliverOnce = async (
  key: DeliveryKey,
  message: () => Promise<Omit<EmailArgs, "to" | "tags" | "idempotencyKey">>,
): Promise<DeliveryOutcome> => {
  if (await isBlocked(key.tenantId, key.recipient)) return "skippedBlocked";
  const claim = await claimDelivery(key);
  if (!claim.won) {
    // "failed" here means the retries are used up; "claimed" means another
    // run is sending to this person right now.
    return claim.status === "failed" ? "failed" : "skippedAlreadySent";
  }
  try {
    const receipt = await sendEmailWithReceipt({
      ...(await message()),
      to: [key.recipient],
      // The row id travels with the message, so a delivery webhook that beats
      // the provider id into the ledger still finds its row.
      tags: [{ name: DELIVERY_TAG, value: claim.id }],
      idempotencyKey: deliveryIdempotencyKey(key),
    });
    if (!receipt) throw new Error("email is not configured");
    await completeDelivery(claim.id, receipt.id);
    return "sent";
  } catch (err) {
    await failDelivery(claim.id, err).catch((ledgerErr: unknown) => {
      console.error("[email] ledger update failed", ledgerErr);
    });
    return "failed";
  }
};
