import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AnthropicAdminClient,
  mapAnthropicCostBuckets,
  mapAnthropicUsers,
  nextUtcDayBoundary,
} from "~/server/saas/anthropicAdmin";
import {
  mapOpenAiCostBuckets,
  mapOpenAiUsers,
} from "~/server/saas/openaiAdmin";

const unixSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const fetchUrl = (input: string | URL | Request): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapOpenAiUsers", () => {
  it("maps org members and skips entries without an email", () => {
    const seats = mapOpenAiUsers([
      { email: "a@x.com", name: "A" },
      { name: "No Email" },
      { email: "b@x.com" },
    ]);
    expect(seats).toHaveLength(2);
    expect(seats[0]).toEqual({
      email: "a@x.com",
      displayName: "A",
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    });
    expect(seats[1]!.displayName).toBeNull();
  });

  it("marks every member active with no activity signal", () => {
    const seats = mapOpenAiUsers([{ email: "a@x.com" }]);
    expect(seats[0]!.status).toBe("active");
    expect(seats[0]!.products).toEqual(["Console member"]);
    expect(seats[0]!.lastActiveAt).toBeNull();
  });
});

describe("mapOpenAiCostBuckets", () => {
  it("accumulates dollar floats per line item and rounds to cents once", () => {
    const rows = mapOpenAiCostBuckets([
      {
        start_time: unixSeconds("2026-06-01T00:00:00Z"),
        results: [
          { amount: { value: 0.1, currency: "usd" }, line_item: "gpt-5" },
          { amount: { value: 0.2, currency: "usd" }, line_item: "gpt-5" },
        ],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "gpt-5", amountCents: 30 },
    ]);
  });

  it("maps a null line item to the other category", () => {
    const rows = mapOpenAiCostBuckets([
      {
        start_time: unixSeconds("2026-06-01T00:00:00Z"),
        results: [{ amount: { value: 1.5, currency: "usd" }, line_item: null }],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "other", amountCents: 150 },
    ]);
  });

  it("derives the UTC day from unix seconds across a midnight boundary", () => {
    const rows = mapOpenAiCostBuckets([
      {
        start_time: unixSeconds("2026-05-31T23:59:59Z"),
        results: [{ amount: { value: 1, currency: "usd" }, line_item: "gpt-5" }],
      },
      {
        start_time: unixSeconds("2026-06-01T00:00:00Z"),
        results: [{ amount: { value: 2, currency: "usd" }, line_item: "gpt-5" }],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-05-31", category: "gpt-5", amountCents: 100 },
      { day: "2026-06-01", category: "gpt-5", amountCents: 200 },
    ]);
  });

  it("keeps the same line item on different days as separate rows", () => {
    const rows = mapOpenAiCostBuckets([
      {
        start_time: unixSeconds("2026-06-01T00:00:00Z"),
        results: [{ amount: { value: 0.5, currency: "usd" }, line_item: "gpt-5" }],
      },
      {
        start_time: unixSeconds("2026-06-02T00:00:00Z"),
        results: [{ amount: { value: 0.5, currency: "usd" }, line_item: "gpt-5" }],
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.day)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(rows.every((r) => r.amountCents === 50)).toBe(true);
  });
});

describe("mapAnthropicUsers", () => {
  it("maps org members and skips entries without an email", () => {
    const seats = mapAnthropicUsers([
      { email: "a@x.com", name: "A" },
      { name: "No Email" },
      { email: "b@x.com" },
    ]);
    expect(seats).toHaveLength(2);
    expect(seats[0]).toEqual({
      email: "a@x.com",
      displayName: "A",
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    });
    expect(seats[1]!.displayName).toBeNull();
  });
});

describe("mapAnthropicCostBuckets", () => {
  it("stores Anthropic lowest-unit USD amounts as cents without dollar conversion", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-06-01T00:00:00Z",
        results: [
          { amount: "123.45", description: "Claude Sonnet usage", currency: "USD" },
        ],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "Claude Sonnet usage", amountCents: 123 },
    ]);
  });

  it("accumulates decimal cent amounts per description and rounds once", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-06-01T00:00:00Z",
        results: [
          { amount: "123.45", description: "Claude Sonnet usage", currency: "USD" },
          { amount: "76.55", description: "Claude Sonnet usage", currency: "USD" },
        ],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "Claude Sonnet usage", amountCents: 200 },
    ]);
  });

  it("maps a null description to the other category", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-06-01T00:00:00Z",
        results: [{ amount: "10", description: null, currency: "USD" }],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "other", amountCents: 10 },
    ]);
  });

  it("accepts missing currency as USD and skips explicit non-USD amounts", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-06-01T00:00:00Z",
        results: [
          { amount: "1", description: "USD", currency: "USD" },
          { amount: "1", description: "EUR", currency: "EUR" },
          { amount: "2", description: "Missing currency" },
        ],
      },
    ]);
    expect(rows).toEqual([
      { day: "2026-06-01", category: "USD", amountCents: 1 },
      { day: "2026-06-01", category: "Missing currency", amountCents: 2 },
    ]);
  });

  it("slices the bucket day from the starting_at timestamp", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-05-31T23:00:00Z",
        results: [{ amount: "5", description: "x", currency: "USD" }],
      },
    ]);
    expect(rows[0]!.day).toBe("2026-05-31");
  });

  it("truncates categories to 120 characters", () => {
    const rows = mapAnthropicCostBuckets([
      {
        starting_at: "2026-06-01T00:00:00Z",
        results: [{ amount: "5", description: "x".repeat(130), currency: "USD" }],
      },
    ]);
    expect(rows[0]!.category).toBe("x".repeat(120));
  });
});

describe("AnthropicAdminClient", () => {
  it("uses the next UTC day boundary so the current daily bucket is included", () => {
    expect(nextUtcDayBoundary(new Date("2026-06-19T12:34:56.000Z"))).toBe(
      "2026-06-20T00:00:00.000Z",
    );
    expect(nextUtcDayBoundary(new Date("2026-06-19T23:59:59.000Z"))).toBe(
      "2026-06-20T00:00:00.000Z",
    );
  });

  it("requests a bounded cost window and keeps pagination parameters", async () => {
    const calls: string[] = [];
    let nowCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl = fetchUrl(input);
        calls.push(requestUrl);
        const url = new URL(requestUrl);
        expect(url.pathname).toBe("/v1/organizations/cost_report");
        if (!url.searchParams.get("page")) {
          return Response.json({
            data: [
              {
                starting_at: "2026-06-01T00:00:00Z",
                results: [
                  { amount: "1.25", description: "Claude", currency: "USD" },
                ],
              },
            ],
            has_more: true,
            next_page: "page-2",
          });
        }
        return Response.json({
          data: [
            {
              starting_at: "2026-06-01T00:00:00Z",
              results: [
                { amount: "0.75", description: "Claude", currency: "USD" },
              ],
            },
          ],
          has_more: false,
        });
      }),
    );

    const rows = await new AnthropicAdminClient({
      apiKey: "admin-key",
      now: () => {
        nowCalls += 1;
        return new Date(
          nowCalls === 1
            ? "2026-06-19T12:34:56.000Z"
            : "2026-06-19T12:35:56.000Z",
        );
      },
    }).getSpend("2026-06-01");

    expect(rows).toEqual([
      { day: "2026-06-01", category: "Claude", amountCents: 2 },
    ]);
    expect(calls).toHaveLength(2);
    const first = new URL(calls[0]!);
    const second = new URL(calls[1]!);
    expect(first.searchParams.get("starting_at")).toBe("2026-06-01T00:00:00Z");
    expect(first.searchParams.get("ending_at")).toBe("2026-06-20T00:00:00.000Z");
    expect(second.searchParams.get("ending_at")).toBe("2026-06-20T00:00:00.000Z");
    expect(second.searchParams.get("page")).toBe("page-2");
    expect(nowCalls).toBe(1);
  });
});
