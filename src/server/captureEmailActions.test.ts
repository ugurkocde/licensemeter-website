import { afterEach, expect, it, vi } from "vitest";

const returning = vi.fn();
const notifyOps = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: {
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning }) }),
    }),
  },
}));
vi.mock("~/server/exchangeRates", () => ({}));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/rateLimit", () => ({
  clientIp: () => "local",
  rateLimitDurable: async () => true,
}));

const { captureEmail } = await import("~/server/actions");

afterEach(() => vi.clearAllMocks());

it.each([true, false])(
  "logs only new signups at info level (inserted: %s)",
  async (inserted) => {
    returning.mockResolvedValue([{ inserted }]);
    const data = new FormData();
    data.set("email", "test@example.com");

    expect(await captureEmail(data)).toEqual({ ok: true });

    if (inserted) {
      expect(notifyOps).toHaveBeenCalledExactlyOnceWith(
        "new email signup from the landing page",
        { logLevel: "info" },
      );
    } else {
      expect(notifyOps).not.toHaveBeenCalled();
    }
  },
);
