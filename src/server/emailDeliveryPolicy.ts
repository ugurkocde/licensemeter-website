import { z } from "zod";

import type { DeliveryStatus, EmailBlockReason } from "~/server/types";

/**
 * Rules for the provider's delivery webhooks: what a payload must look like,
 * which status an event means, and when an event may replace the status a
 * ledger row already has. Pure, no IO; ~/server/emailDeliveryEvents applies it.
 */

/** Tag that carries the ledger row id to the provider and back in webhooks. */
export const DELIVERY_TAG = "lm_delivery";

/** The part of a Resend webhook the ledger needs. Everything else is ignored. */
export const deliveryEvent = z.object({
  type: z.string(),
  created_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  data: z.object({
    email_id: z.string().min(1),
    to: z.array(z.string()).min(1),
    tags: z.record(z.string()).optional(),
  }),
});

const STATUS_BY_EVENT: Record<string, DeliveryStatus> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.suppressed": "suppressed",
  "email.complained": "complained",
};

/** Null for events the ledger does not track (opened, clicked, and so on). */
export const deliveryStatusForEvent = (type: string): DeliveryStatus | null =>
  Object.hasOwn(STATUS_BY_EVENT, type) ? STATUS_BY_EVENT[type]! : null;

export const isPermanentFailure = (
  status: DeliveryStatus,
): status is EmailBlockReason =>
  status === "bounced" || status === "suppressed" || status === "complained";

/** How far along a status is; decides between two events of the same instant. */
const PRIORITY: Record<DeliveryStatus, number> = {
  accepted: 1,
  delayed: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
  suppressed: 6,
  complained: 7,
};

/**
 * Webhooks arrive late, twice and out of order. A permanent failure always
 * wins over anything else and is never replaced by it, whatever the
 * timestamps say. Otherwise the newer event wins, a repeated event changes
 * nothing, and "accepted" never replaces a status that is further along.
 */
export const shouldApplyDeliveryEvent = (
  previous: DeliveryStatus | null,
  previousAt: Date | null,
  next: DeliveryStatus,
  nextAt: Date,
): boolean => {
  if (previous === null) return true;
  if (isPermanentFailure(previous) !== isPermanentFailure(next)) {
    return isPermanentFailure(next);
  }
  if (previousAt && nextAt < previousAt) return false;
  if (nextAt.getTime() === previousAt?.getTime()) {
    return PRIORITY[next] > PRIORITY[previous];
  }
  return next !== "accepted";
};
