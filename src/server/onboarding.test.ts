import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { enabled: true, selfHosted: undefined as string | undefined };
const sendEmail = vi.fn((_mail: unknown) => Promise.resolve(true));
const notifyOps = vi.fn((_message: string, _opts?: unknown) =>
  Promise.resolve(),
);

vi.mock("~/env", () => ({
  env: {
    get SELF_HOSTED() {
      return state.selfHosted;
    },
  },
  siteUrl: () => "https://licensemeter.com",
}));
vi.mock("~/server/email", () => ({
  emailEnabled: () => state.enabled,
  sendEmail: (mail: unknown) => sendEmail(mail),
}));
vi.mock("~/server/ops", () => ({
  notifyOps: (message: string, opts?: unknown) => notifyOps(message, opts),
}));

const { sendOnboardingEmail } = await import("~/server/onboarding");

const WHO = {
  oid: "oid-anna",
  email: "anna@contoso.com",
  name: "Anna Schmidt",
};

beforeEach(() => {
  state.enabled = true;
  state.selfHosted = undefined;
  sendEmail.mockClear();
  notifyOps.mockClear();
});

describe("sendOnboardingEmail", () => {
  it("sends one founder-voiced mail keyed to the person", async () => {
    await sendOnboardingEmail(WHO);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({
      to: ["anna@contoso.com"],
      from: "Ugur from LicenseMeter <hello@licensemeter.com>",
      replyTo: "support@ugurlabs.com",
      idempotencyKey: "onboarding:oid-anna",
    });
  });

  it("stays silent without mail configuration", async () => {
    state.enabled = false;
    await sendOnboardingEmail(WHO);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stays silent on a self-hosted installation", async () => {
    state.selfHosted = "true";
    await sendOnboardingEmail(WHO);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws: a failed send alerts ops instead", async () => {
    sendEmail.mockRejectedValueOnce(new Error("Resend responded 500"));
    await expect(sendOnboardingEmail(WHO)).resolves.toBeUndefined();
    expect(notifyOps).toHaveBeenCalledTimes(1);
    expect(notifyOps.mock.calls[0]![0]).toContain("Resend responded 500");
  });
});
