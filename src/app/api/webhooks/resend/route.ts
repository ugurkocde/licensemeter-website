import { Webhook } from "svix";

import { env } from "~/env";
import { applyDeliveryEvent } from "~/server/emailDeliveryEvents";

/** Resend's delivery events are a few KB; anything near this is not Resend. */
const MAX_BODY_BYTES = 100_000;

/**
 * Reads at most MAX_BODY_BYTES, streaming, so an oversized body cannot be
 * buffered into memory before it is rejected. Returns null when too large.
 * content-length is only a cheap early exit; a chunked or lying request is
 * still capped while reading.
 */
const readCapped = async (req: Request): Promise<string | null> => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
};

/**
 * Resend delivery webhook (signed with Svix). Only a bad signature answers
 * 4xx; event types this app does not track and payloads it cannot read answer
 * 2xx so Resend stops redelivering them.
 */
export const POST = async (req: Request): Promise<Response> => {
  if (!env.RESEND_WEBHOOK_SECRET)
    return new Response("Webhook not configured", { status: 503 });
  const raw = await readCapped(req);
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
