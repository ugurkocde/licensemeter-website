import { env } from "~/env";
import {
  applyPolarSubscription,
  POLAR_SUBSCRIPTION_EVENTS,
  polarSubscriptionSchema,
  polarWebhookSchema,
  verifyPolarSignature,
} from "~/server/billing/polar";

const MAX_BODY_BYTES = 256_000;

/**
 * Polar webhook (Standard Webhooks). Only a bad signature or a malformed body
 * answers 4xx; a duplicate, a stale or comped write and every event type this
 * app does not use answer 2xx so Polar stops redelivering them.
 */
export const POST = async (req: Request): Promise<Response> => {
  if (!env.POLAR_WEBHOOK_SECRET)
    return new Response("Webhook not configured", { status: 503 });
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES)
    return new Response("Payload too large", { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return new Response("Payload too large", { status: 413 });

  const verified = verifyPolarSignature(
    env.POLAR_WEBHOOK_SECRET,
    req.headers,
    raw,
  );
  if (!verified.ok) return new Response("Invalid signature", { status: 400 });

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return new Response("Malformed body", { status: 400 });
  }
  const envelope = polarWebhookSchema.safeParse(json);
  if (!envelope.success) return new Response("Malformed body", { status: 400 });
  const { type, timestamp, data } = envelope.data;

  if (!POLAR_SUBSCRIPTION_EVENTS.has(type)) {
    return Response.json({ received: true, result: "ignored" });
  }
  const subscription = polarSubscriptionSchema.safeParse(data);
  if (!subscription.success)
    return new Response("Malformed body", { status: 400 });

  // Let persistence errors return 5xx so Polar retries instead of losing the event.
  const outcome = await applyPolarSubscription(subscription.data, {
    // Verified above, and the same for every redelivery of one event.
    eventId: req.headers.get("webhook-id")!,
    type,
    occurredAt: new Date(timestamp),
  });
  return Response.json({ received: true, ...outcome });
};
