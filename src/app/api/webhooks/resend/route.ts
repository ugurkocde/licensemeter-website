import { Webhook } from "svix";

import { env } from "~/env";
import { applyDeliveryEvent } from "~/server/emailDeliveryEvents";
import { readCapped } from "~/server/httpBody";

/** Resend's delivery events are a few KB; anything near this is not Resend. */
const MAX_BODY_BYTES = 100_000;

/**
 * Resend delivery webhook (signed with Svix). Only a bad signature answers
 * 4xx; event types this app does not track and payloads it cannot read answer
 * 2xx so Resend stops redelivering them.
 */
export const POST = async (req: Request): Promise<Response> => {
  if (!env.RESEND_WEBHOOK_SECRET)
    return new Response("Webhook not configured", { status: 503 });
  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) return new Response("Payload too large", { status: 413 });
  try {
    new Webhook(env.RESEND_WEBHOOK_SECRET).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(raw) as unknown;
  } catch {
    // Signed but unreadable: a retry would bring the same bytes again.
    event = null;
  }

  // Let persistence errors return 5xx so Resend retries instead of losing the event.
  await applyDeliveryEvent(event);
  return Response.json({ received: true });
};
