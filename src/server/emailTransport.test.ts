import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The Resend call itself: what goes out and what counts as a receipt. */

const testEnv: Record<string, string | undefined> = {};
vi.mock("~/env", () => ({ env: testEnv }));

const { sendEmail, sendEmailWithReceipt } = await import("~/server/email");

const fetchMock = vi.fn<typeof fetch>();
const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    }),
  );
const MAIL = { to: ["anna@contoso.test"], subject: "Hello", html: "<p>Hi</p>" };

beforeEach(() => {
  testEnv.RESEND_API_KEY = "re_test_key";
  testEnv.EMAIL_FROM = "LicenseMeter <digest@licensemeter.test>";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmailWithReceipt", () => {
  it("returns the provider's message id and forwards the tags", async () => {
    respond({ id: "re_abc" });
    const tags = [{ name: "lm_delivery", value: "row-1" }];
    expect(await sendEmailWithReceipt({ ...MAIL, tags })).toEqual({
      id: "re_abc",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ tags });
  });

  it("sends no tags field when none are given", async () => {
    respond({ id: "re_abc" });
    await sendEmailWithReceipt(MAIL);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("tags");
  });

  it("returns null without sending when email is not configured", async () => {
    testEnv.RESEND_API_KEY = undefined;
    expect(await sendEmailWithReceipt(MAIL)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx answer without echoing the response body", async () => {
    respond({ message: "invalid to: anna@contoso.test" }, 422);
    await expect(sendEmailWithReceipt(MAIL)).rejects.toThrow(
      /^Resend responded 422$/,
    );
  });

  it("throws when a 2xx answer carries no string id", async () => {
    for (const body of [{}, { id: 42 }, { id: "" }, "not json"]) {
      respond(body);
      await expect(sendEmailWithReceipt(MAIL)).rejects.toThrow("no message id");
    }
  });
});

describe("sendEmail", () => {
  it("still answers with a boolean", async () => {
    respond({ id: "re_abc" });
    expect(await sendEmail(MAIL)).toBe(true);
    testEnv.EMAIL_FROM = undefined;
    expect(await sendEmail(MAIL)).toBe(false);
  });
});
