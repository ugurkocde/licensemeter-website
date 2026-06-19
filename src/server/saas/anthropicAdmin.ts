import type { AiSpendRow, SaasSeat } from "~/server/types";

const API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicApiUser = {
  email?: string;
  name?: string;
};

type AnthropicCostBucket = {
  /** Bucket start, ISO timestamp (UTC). */
  starting_at?: string;
  results?: {
    /** Decimal string in the currency's lowest unit, e.g. USD cents. */
    amount?: string | number;
    description?: string | null;
    currency?: string;
  }[];
};

export const nextUtcDayBoundary = (date: Date): string => {
  const boundary = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
  );
  return boundary.toISOString();
};

/**
 * The org users endpoint exposes no status or activity signal; presence in
 * the list means membership, so every seat maps to active with a null signal.
 */
export const mapAnthropicUsers = (users: AnthropicApiUser[]): SaasSeat[] =>
  users
    .filter((u) => u.email)
    .map((u) => ({
      email: u.email!,
      displayName: u.name ?? null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    }));

/**
 * The cost report buckets by day and groups by description, with amounts as
 * decimal strings already in the currency's lowest unit. Several token types
 * share a description, so cent floats accumulate per (day, category) and are
 * rounded once at the end, because rounding each result separately drifts.
 */
export const mapAnthropicCostBuckets = (
  buckets: AnthropicCostBucket[],
): AiSpendRow[] => {
  const centsByDay = new Map<string, Map<string, number>>();
  for (const bucket of buckets) {
    if (!bucket.starting_at) continue;
    const day = bucket.starting_at.slice(0, 10);
    const byCategory = centsByDay.get(day) ?? new Map<string, number>();
    centsByDay.set(day, byCategory);
    for (const result of bucket.results ?? []) {
      const currency = result.currency?.toUpperCase();
      // Missing currency is accepted as USD for Anthropic cost rows; only an
      // explicit non-USD value is skipped so currencies are never mixed.
      if (currency && currency !== "USD") continue;
      const cents = Number(result.amount);
      if (!Number.isFinite(cents)) continue;
      const category = (result.description ?? "other").slice(0, 120);
      byCategory.set(category, (byCategory.get(category) ?? 0) + cents);
    }
  }
  const rows: AiSpendRow[] = [];
  for (const [day, byCategory] of centsByDay) {
    for (const [category, cents] of byCategory) {
      rows.push({ day, category, amountCents: Math.round(cents) });
    }
  }
  return rows;
};

/**
 * Anthropic Admin API with an Admin API key that an organization admin
 * creates in the Claude Console under Settings > Admin keys. Read-only: org
 * members and the daily cost report, never request content.
 */
export class AnthropicAdminClient {
  constructor(private readonly cfg: { apiKey: string; now?: () => Date }) {}

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.cfg.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  async getSeats(): Promise<SaasSeat[]> {
    const seats: SaasSeat[] = [];
    let lastId = "";
    for (let page = 0; page < 200; page++) {
      const params = new URLSearchParams({ limit: "100" });
      if (lastId) params.set("after_id", lastId);
      const res = await fetch(
        `${API_BASE}/v1/organizations/users?${params.toString()}`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok)
        throw new Error(`Anthropic users request failed (HTTP ${res.status})`);
      const body = (await res.json()) as {
        data?: AnthropicApiUser[];
        has_more?: boolean;
        last_id?: string;
      };
      seats.push(...mapAnthropicUsers(body.data ?? []));
      if (!body.has_more || !body.last_id) break;
      lastId = body.last_id;
    }
    return seats;
  }

  async getSpend(sinceDay: string): Promise<AiSpendRow[]> {
    const buckets: AnthropicCostBucket[] = [];
    const endingAt = nextUtcDayBoundary(this.cfg.now?.() ?? new Date());
    let nextPage = "";
    for (let page = 0; page < 30; page++) {
      const params = new URLSearchParams({
        starting_at: `${sinceDay}T00:00:00Z`,
        ending_at: endingAt,
        bucket_width: "1d",
        "group_by[]": "description",
        limit: "31",
      });
      if (nextPage) params.set("page", nextPage);
      const res = await fetch(
        `${API_BASE}/v1/organizations/cost_report?${params.toString()}`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok)
        throw new Error(
          `Anthropic cost report request failed (HTTP ${res.status})`,
        );
      const body = (await res.json()) as {
        data?: AnthropicCostBucket[];
        has_more?: boolean;
        next_page?: string;
      };
      buckets.push(...(body.data ?? []));
      if (!body.has_more || !body.next_page) break;
      nextPage = body.next_page;
    }
    return mapAnthropicCostBuckets(buckets);
  }
}
