import type { AiSpendRow, SaasSeat } from "~/server/types";

const API_BASE = "https://api.openai.com";

type OpenAiApiUser = {
  email?: string;
  name?: string;
};

type OpenAiCostBucket = {
  /** Bucket start, unix seconds (UTC). */
  start_time?: number;
  results?: {
    /** USD dollars, not cents. */
    amount?: { value?: number; currency?: string };
    line_item?: string | null;
  }[];
};

/**
 * The org users endpoint exposes no status or activity signal; presence in
 * the list means membership, so every seat maps to active with a null signal.
 */
export const mapOpenAiUsers = (users: OpenAiApiUser[]): SaasSeat[] =>
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
 * Costs arrive as daily buckets whose results report USD dollars per line
 * item. Several results can share a line item, so dollar floats accumulate
 * per (day, category) and are rounded to cents once at the end, because
 * rounding each result separately drifts.
 */
export const mapOpenAiCostBuckets = (
  buckets: OpenAiCostBucket[],
): AiSpendRow[] => {
  const dollarsByDay = new Map<string, Map<string, number>>();
  for (const bucket of buckets) {
    if (bucket.start_time == null) continue;
    const day = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
    const byCategory = dollarsByDay.get(day) ?? new Map<string, number>();
    dollarsByDay.set(day, byCategory);
    for (const result of bucket.results ?? []) {
      const category = (result.line_item ?? "other").slice(0, 120);
      byCategory.set(
        category,
        (byCategory.get(category) ?? 0) + (result.amount?.value ?? 0),
      );
    }
  }
  const rows: AiSpendRow[] = [];
  for (const [day, byCategory] of dollarsByDay) {
    for (const [category, dollars] of byCategory) {
      rows.push({ day, category, amountCents: Math.round(dollars * 100) });
    }
  }
  return rows;
};

/**
 * OpenAI organization Admin API with an Admin API key that an organization
 * Owner creates under platform.openai.com > Settings > Organization > Admin
 * keys. Read-only: org members and daily cost totals, never request content.
 */
export class OpenAiAdminClient {
  constructor(private readonly cfg: { apiKey: string }) {}

  async getSeats(): Promise<SaasSeat[]> {
    const seats: SaasSeat[] = [];
    let lastId = "";
    for (let page = 0; page < 200; page++) {
      const params = new URLSearchParams({ limit: "100" });
      if (lastId) params.set("after", lastId);
      const res = await fetch(
        `${API_BASE}/v1/organization/users?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok)
        throw new Error(`OpenAI users request failed (HTTP ${res.status})`);
      const body = (await res.json()) as {
        data?: OpenAiApiUser[];
        has_more?: boolean;
        last_id?: string;
      };
      seats.push(...mapOpenAiUsers(body.data ?? []));
      if (!body.has_more || !body.last_id) break;
      lastId = body.last_id;
    }
    return seats;
  }

  async getSpend(sinceDay: string, deadline?: number): Promise<AiSpendRow[]> {
    const startTime = Math.floor(Date.parse(`${sinceDay}T00:00:00Z`) / 1000);
    const buckets: OpenAiCostBucket[] = [];
    let nextPage = "";
    for (let page = 0; page < 30; page++) {
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error("Sync deadline reached");
      }
      const params = new URLSearchParams({
        start_time: String(startTime),
        bucket_width: "1d",
        limit: "180",
        group_by: "line_item",
      });
      if (nextPage) params.set("page", nextPage);
      const res = await fetch(
        `${API_BASE}/v1/organization/costs?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
          signal: AbortSignal.timeout(
            deadline === undefined
              ? 30_000
              : Math.min(30_000, deadline - Date.now()),
          ),
        },
      );
      if (!res.ok)
        throw new Error(`OpenAI costs request failed (HTTP ${res.status})`);
      const body = (await res.json()) as {
        data?: OpenAiCostBucket[];
        has_more?: boolean;
        next_page?: string;
      };
      buckets.push(...(body.data ?? []));
      if (!body.has_more || !body.next_page) break;
      nextPage = body.next_page;
    }
    return mapOpenAiCostBuckets(buckets);
  }
}
