import type { DeliveryStatus, EmailBlockReason } from "~/server/types";

/** Plain words for the delivery ledger, shown under Settings, Email delivery. */

export const EMAIL_JOB_LABELS: Record<"digest" | "report" | "leak", string> = {
  digest: "Weekly digest",
  report: "Monthly report",
  leak: "Leak alert",
};

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  accepted: "Accepted by the mail provider",
  delivered: "Delivered",
  delayed: "Delayed, the mail provider keeps trying",
  failed: "The mail provider could not send it",
  bounced: "Bounced",
  suppressed: "Held back by the mail provider",
  complained: "Marked as spam",
};

/**
 * One line for a ledger row. What the provider reported wins; without a report
 * the line falls back to our own send attempt.
 */
export const deliveryLabel = (row: {
  status: "claimed" | "sent" | "failed";
  deliveryStatus: DeliveryStatus | null;
}): string => {
  if (row.deliveryStatus) return DELIVERY_STATUS_LABELS[row.deliveryStatus];
  if (row.status === "sent") return "Sent";
  return row.status === "failed" ? "Not sent" : "Sending";
};

export const BLOCK_REASON_LABELS: Record<EmailBlockReason, string> = {
  bounced: "The address bounced",
  suppressed: "The mail provider holds back mail to this address",
  complained: "The recipient marked an email as spam",
};
