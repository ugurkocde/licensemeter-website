import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { ALL_RULES, RULE_META } from "~/lib/rules";
import { db } from "~/server/db";
import {
  findings,
  priceBook,
  syncRuns,
  tenantSkus,
  tenantUsers,
  type TenantRow,
} from "~/server/db/schema";
import type { Entitlement } from "~/server/entitlement";
import { historyStartDay } from "~/server/history";
import { loadWasteHistory } from "~/server/historyStore";
import type { FindingStatus, WasteRuleId } from "~/server/types";
import { isShelfwareExempt } from "~/server/waste/engine";

/**
 * The read-only tools of the MCP endpoint. Every handler reads the workspace
 * from the verified token's context and filters each query by that workspace
 * id. No tool accepts a workspace or tenant id, and the argument schemas are
 * strict, so an unknown argument is refused instead of ignored.
 *
 * The figures follow the portal: the Overview aggregates for the summary, the
 * Findings list filters, the licenses CSV export for the inventory, and
 * loadWasteHistory for the trend.
 */

export type ToolContext = {
  tenant: TenantRow;
  entitlement: Entitlement;
  now: Date;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; openWorldHint: false };
};

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown> }
  /** Reported to the client as a tool execution error, not a protocol error. */
  | { ok: false; message: string };

type Tool = {
  definition: ToolDefinition;
  run: (args: unknown, ctx: ToolContext) => Promise<ToolOutcome>;
};

export const FINDINGS_LIMIT_MAX = 200;
const FINDINGS_LIMIT_DEFAULT = 50;
const FINDING_STATUSES = ["open", "acknowledged", "resolved"] as const;
const ACTIVE_STATUSES: FindingStatus[] = ["open", "acknowledged"];

const annotations = { readOnlyHint: true, openWorldHint: false } as const;

/** Cents to major units, the same two decimals the CSV exports print. */
const amount = (cents: number): number => Math.round(cents) / 100;

const invalid = (error: z.ZodError): ToolOutcome => ({
  ok: false,
  message: `Invalid arguments: ${error.issues
    .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
    .join("; ")}`,
});

const noArgs = z.object({}).strict();

// --- get_waste_summary -------------------------------------------------------

const getWasteSummary: Tool = {
  definition: {
    name: "get_waste_summary",
    title: "Waste summary",
    description:
      "Current monthly license waste of this workspace: the total, the split by category, the number of open findings, the currency and when data was last synced. Matches the Overview page.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations,
  },
  run: async (args, ctx) => {
    const parsed = noArgs.safeParse(args ?? {});
    if (!parsed.success) return invalid(parsed.error);
    const tenantId = ctx.tenant.id;
    // Imports never get syncRuns rows; their freshness is the import time.
    const isImported = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

    const [ruleAgg, lastRun, importedUser] = await Promise.all([
      db
        .select({
          rule: findings.rule,
          count: sql<number>`count(*)::int`,
          cents: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
        })
        .from(findings)
        .where(
          and(
            eq(findings.tenantId, tenantId),
            inArray(findings.status, ACTIVE_STATUSES),
          ),
        )
        .groupBy(findings.rule),
      db.query.syncRuns.findFirst({
        where: eq(syncRuns.tenantId, tenantId),
        orderBy: desc(syncRuns.startedAt),
        columns: { status: true, finishedAt: true },
      }),
      isImported
        ? db.query.tenantUsers.findFirst({
            where: eq(tenantUsers.tenantId, tenantId),
            orderBy: desc(tenantUsers.syncedAt),
            columns: { syncedAt: true },
          })
        : Promise.resolve(undefined),
    ]);

    const monthlyWasteCents = ruleAgg.reduce((sum, r) => sum + r.cents, 0);
    const lastSync = isImported
      ? (importedUser?.syncedAt ?? null)
      : (lastRun?.finishedAt ?? null);

    return {
      ok: true,
      data: {
        currency: ctx.tenant.currency,
        monthly_waste: amount(monthlyWasteCents),
        annualized_waste: amount(monthlyWasteCents * 12),
        open_findings: ruleAgg.reduce((sum, r) => sum + r.count, 0),
        by_category: [...ruleAgg]
          .sort((a, b) => b.cents - a.cents || b.count - a.count)
          .map((r) => ({
            category: r.rule,
            label: RULE_META[r.rule]?.label ?? r.rule,
            open_findings: r.count,
            monthly_waste: amount(r.cents),
          })),
        last_synced_at: lastSync?.toISOString() ?? null,
        last_sync_status: isImported ? "imported" : (lastRun?.status ?? null),
      },
    };
  },
};

// --- list_findings -----------------------------------------------------------

const listFindingsArgs = z
  .object({
    status: z.enum(FINDING_STATUSES).optional(),
    category: z.enum(ALL_RULES as [WasteRuleId, ...WasteRuleId[]]).optional(),
    limit: z.number().int().min(1).max(FINDINGS_LIMIT_MAX).optional(),
    include_users: z.boolean().optional(),
  })
  .strict();

type FindingRow = typeof findings.$inferSelect;

/**
 * A finding whose title and detail describe a product or a count, never a
 * person. Decided by an allowlist: anything not recognised here is treated as
 * naming a user.
 */
const isAggregateFinding = (f: FindingRow): boolean =>
  f.graphUserId === null &&
  typeof f.detail.upn !== "string" &&
  (f.rule === "shelfware" ||
    f.rule === "service_plans_disabled" ||
    f.detail.aggregate === true);

const affectedCount = (f: FindingRow): number => {
  for (const key of ["unassigned", "usersWithDisabledPlans", "inactiveCount"]) {
    const value = f.detail[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 1;
};

const listFindings: Tool = {
  definition: {
    name: "list_findings",
    title: "List findings",
    description: `Waste findings of this workspace, largest monthly amount first. Without a status filter it returns active findings (open and acknowledged), like the Findings page. At most ${FINDINGS_LIMIT_MAX} rows per call. Titles that name a person are replaced by the category label unless include_users is true.`,
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [...FINDING_STATUSES],
          description:
            "Only findings with this status. Default: open and acknowledged.",
        },
        category: {
          type: "string",
          enum: [...ALL_RULES],
          description: "Only findings of this detection rule.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: FINDINGS_LIMIT_MAX,
          default: FINDINGS_LIMIT_DEFAULT,
        },
        include_users: {
          type: "boolean",
          default: false,
          description:
            "Include the user principal name and the full title of per-user findings, as the findings CSV export does. Off by default so personal data only leaves the workspace on request.",
        },
      },
      additionalProperties: false,
    },
    annotations,
  },
  run: async (args, ctx) => {
    const parsed = listFindingsArgs.safeParse(args ?? {});
    if (!parsed.success) return invalid(parsed.error);
    const { status, category } = parsed.data;
    const limit = parsed.data.limit ?? FINDINGS_LIMIT_DEFAULT;
    const includeUsers = parsed.data.include_users === true;

    const where = and(
      eq(findings.tenantId, ctx.tenant.id),
      status
        ? eq(findings.status, status)
        : inArray(findings.status, ACTIVE_STATUSES),
      category ? eq(findings.rule, category) : undefined,
    );
    const [rows, totals] = await Promise.all([
      db.query.findings.findMany({
        where,
        orderBy: [
          desc(findings.monthlyImpactCents),
          desc(findings.firstSeenAt),
        ],
        limit,
      }),
      db
        .select({
          total: sql<number>`count(*)::int`,
          cents: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
        })
        .from(findings)
        .where(where)
        .then((r) => r[0] ?? { total: 0, cents: 0 }),
    ]);

    return {
      ok: true,
      data: {
        currency: ctx.tenant.currency,
        total_matching: totals.total,
        total_monthly_amount: amount(totals.cents),
        returned: rows.length,
        users_included: includeUsers,
        findings: rows.map((f) => {
          const aggregate = isAggregateFinding(f);
          const label = RULE_META[f.rule]?.label ?? f.rule;
          const upn = f.detail.upn;
          return {
            rule: f.rule,
            category_label: label,
            title: aggregate || includeUsers ? f.title : label,
            monthly_amount: amount(f.monthlyImpactCents),
            affected_count: affectedCount(f),
            status: f.status,
            first_seen: f.firstSeenAt.toISOString().slice(0, 10),
            last_seen: f.lastSeenAt.toISOString().slice(0, 10),
            ...(includeUsers && !aggregate && typeof upn === "string"
              ? { user: upn }
              : {}),
          };
        }),
      },
    };
  },
};

// --- get_waste_trend ---------------------------------------------------------

const wasteTrendArgs = z
  .object({ interval: z.enum(["daily", "monthly"]).optional() })
  .strict();

/** A daily read never returns more points than this, newest kept. */
const DAILY_POINTS_MAX = 400;

const getWasteTrend: Tool = {
  definition: {
    name: "get_waste_trend",
    title: "Waste trend",
    description:
      "Monthly license spend and waste over time, oldest first, limited to the history window of the workspace's plan. Each value is a monthly run rate on that day. The monthly interval returns the last recorded day of each calendar month.",
    inputSchema: {
      type: "object",
      properties: {
        interval: {
          type: "string",
          enum: ["daily", "monthly"],
          default: "monthly",
        },
      },
      additionalProperties: false,
    },
    annotations,
  },
  run: async (args, ctx) => {
    const parsed = wasteTrendArgs.safeParse(args ?? {});
    if (!parsed.success) return invalid(parsed.error);
    const interval = parsed.data.interval ?? "monthly";

    // Newest first, already cut to the plan's window.
    const { rows, cutOff } = await loadWasteHistory(
      ctx.tenant.id,
      ctx.entitlement,
      {
        now: ctx.now,
        limit: interval === "daily" ? DAILY_POINTS_MAX : undefined,
      },
    );

    const point = (s: (typeof rows)[number]) => ({
      monthly_spend: amount(s.totalMonthlySpendCents),
      monthly_waste: amount(s.totalMonthlyWasteCents),
      purchased_seats: s.purchasedSeats,
      assigned_seats: s.assignedSeats,
    });

    let series: Record<string, unknown>[];
    if (interval === "daily") {
      series = rows.map((s) => ({ day: s.day, ...point(s) }));
    } else {
      // Rows are newest first, so the first row seen per month is its last day.
      const seen = new Set<string>();
      series = [];
      for (const s of rows) {
        const month = s.day.slice(0, 7);
        if (seen.has(month)) continue;
        seen.add(month);
        series.push({ month, as_of: s.day, ...point(s) });
      }
    }
    series.reverse();

    return {
      ok: true,
      data: {
        currency: ctx.tenant.currency,
        interval,
        window_start: historyStartDay(ctx.entitlement, ctx.now),
        older_history_outside_plan_window: cutOff,
        points: series,
      },
    };
  },
};

// --- list_licenses -----------------------------------------------------------

const listLicenses: Tool = {
  definition: {
    name: "list_licenses",
    title: "List licenses",
    description:
      "Microsoft 365 license inventory of this workspace: per product the purchased, assigned and unused seats, the monthly price and the monthly cost of the unused seats. Matches the licenses CSV export.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations,
  },
  run: async (args, ctx) => {
    const parsed = noArgs.safeParse(args ?? {});
    if (!parsed.success) return invalid(parsed.error);
    const [skus, prices] = await Promise.all([
      db.query.tenantSkus.findMany({
        where: eq(tenantSkus.tenantId, ctx.tenant.id),
      }),
      db.query.priceBook.findMany({
        where: eq(priceBook.tenantId, ctx.tenant.id),
      }),
    ]);
    const priceBySku = new Map(
      prices.map((p) => [p.skuId, p.monthlyPriceCents]),
    );

    // The same exemption as Overview and the CSV export: free, viral and
    // capacity sentinel SKUs are not part of the inventory.
    const rows = skus
      .filter((s) => !isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled))
      .map((s) => {
        const price = priceBySku.get(s.skuId) ?? 0;
        // Over-assigned SKUs have no spare seats; clamp to 0 like the table.
        const unused = Math.max(0, s.prepaidEnabled - s.consumedUnits);
        return { sku: s, price, unused, unusedCents: unused * price };
      })
      .sort(
        (a, b) =>
          b.unusedCents - a.unusedCents ||
          (a.sku.displayName ?? a.sku.skuPartNumber).localeCompare(
            b.sku.displayName ?? b.sku.skuPartNumber,
          ),
      );

    return {
      ok: true,
      data: {
        currency: ctx.tenant.currency,
        total_monthly_cost_of_unused: amount(
          rows.reduce((sum, r) => sum + r.unusedCents, 0),
        ),
        licenses: rows.map(({ sku, price, unused, unusedCents }) => ({
          name: sku.displayName ?? sku.skuPartNumber,
          part_number: sku.skuPartNumber,
          purchased: sku.prepaidEnabled,
          assigned: sku.consumedUnits,
          unused,
          monthly_price: amount(price),
          monthly_spend: amount(sku.consumedUnits * price),
          monthly_cost_of_unused: amount(unusedCents),
        })),
      },
    };
  },
};

// --- registry ----------------------------------------------------------------

const TOOLS: readonly Tool[] = [
  getWasteSummary,
  listFindings,
  getWasteTrend,
  listLicenses,
];

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = TOOLS.map(
  (t) => t.definition,
);

export const hasTool = (name: string): boolean =>
  TOOLS.some((t) => t.definition.name === name);

/** Runs a tool for the token's workspace. Null when the tool does not exist. */
export const callTool = async (
  name: string,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome | null> => {
  const tool = TOOLS.find((t) => t.definition.name === name);
  return tool ? tool.run(args, ctx) : null;
};
