import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Resend webhook must bound the body while reading it, not after. A
 * chunked request (or one with an absent/understated content-length) must not
 * be buffered into memory before it is rejected.
 */

let secret: string | undefined = "whsec_test";
const applyDeliveryEvent = vi.fn(() => Promise.resolve());
const verify = vi.fn(() => ({}));

vi.mock("~/env", () => ({
  env: {
    get RESEND_WEBHOOK_SECRET() {
      return secret;
    },
  },
}));
vi.mock("~/server/emailDeliveryEvents", () => ({ applyDeliveryEvent }));
vi.mock("svix", () => ({
  Webhook: class {
    verify(...args: unknown[]) {
      return verify(...args);
    }
  },
}));

const { POST } = await import("./route");

const request = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: string });

const oversizedStream = (state: { pulls: number }) =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulls += 1;
      if (state.pulls > 50) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(10_000));
    },
  });

beforeEach(() => {
  secret = "whsec_test";
  verify.mockClear();
  applyDeliveryEvent.mockClear();
});

describe("Resend webhook body cap", () => {
  it("stops reading a chunked body once it exceeds the cap", async () => {
    const state = { pulls: 0 };
    const res = await POST(request(oversizedStream(state)));
    expect(res.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
    // The old code buffered the whole body (50 pulls) before checking.
    expect(state.pulls).toBeLessThan(20);
  });

  it("rejects an over-cap body that understates content-length", async () => {
    const state = { pulls: 0 };
    const res = await POST(
      request(oversizedStream(state), { "content-length": "10" }),
    );
    expect(res.status).toBe(413);
    expect(state.pulls).toBeLessThan(20);
  });

  it("verifies and applies a small body", async () => {
    const res = await POST(
      request(JSON.stringify({ type: "email.delivered" }), {
        "content-type": "application/json",
        "svix-id": "id",
        "svix-timestamp": "1",
        "svix-signature": "sig",
      }),
    );
    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalled();
    expect(applyDeliveryEvent).toHaveBeenCalled();
  });

  it("answers 503 when the webhook secret is not configured", async () => {
    secret = undefined;
    const res = await POST(request("{}"));
    expect(res.status).toBe(503);
  });
});
