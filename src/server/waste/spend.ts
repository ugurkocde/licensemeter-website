import { CONNECTORS, CONNECTOR_LABELS } from "~/lib/connectors";
import type {
  AdobeUser,
  SaasProvider,
  SaasSeat,
  WasteRuleId,
} from "~/server/types";
import { isShelfwareExempt, paidSeatsOf, type WasteSku } from "./engine";

export type SeatSource = "microsoft" | "adobe" | SaasProvider;

export const billsPerSeat = (provider: SaasProvider) =>
  !CONNECTORS.find((connector) => connector.provider === provider)?.unpriced;

export const vendorLabel = (source: SeatSource) =>
  source === "microsoft"
    ? "Microsoft"
    : source === "adobe"
      ? "Adobe"
      : CONNECTOR_LABELS[source];

export const findingSource = (finding: {
  rule: WasteRuleId;
  detail: Record<string, unknown>;
}): SeatSource => {
  if (finding.rule.startsWith("adobe_")) return "adobe";
  if (finding.rule.startsWith("saas_")) {
    const provider = CONNECTORS.find(
      ({ provider }) => provider === finding.detail.provider,
    )?.provider;
    if (provider) return provider;
  }
  return "microsoft";
};

type Price = {
  skuId: string;
  monthlyPriceCents: number;
  source?: "custom" | "default";
};
type Inventory = {
  skus: readonly WasteSku[];
  adobe: readonly Pick<AdobeUser, "products" | "status">[];
  saas: ReadonlyMap<
    SaasProvider,
    readonly Pick<SaasSeat, "products" | "status">[]
  >;
};

/** Where a provider only exposes active entitlements, those are its purchased-seat baseline. */
export function licenseSpend(
  { skus, adobe, saas }: Inventory,
  prices: readonly Price[],
) {
  const bySku = new Map(prices.map((price) => [price.skuId, price]));
  const seats = new Map<
    string,
    { count: number; vendor: SeatSource; name: string }
  >();
  const add = (
    key: string,
    count: number,
    vendor: SeatSource,
    name: string,
  ) => {
    if (count > 0)
      seats.set(key, {
        count: count + (seats.get(key)?.count ?? 0),
        vendor,
        name,
      });
  };
  for (const sku of skus) {
    if (!isShelfwareExempt(sku.skuPartNumber, sku.skuId)) {
      add(sku.skuId, paidSeatsOf(sku), "microsoft", sku.skuPartNumber);
    }
  }
  const addProducts = (vendor: SeatSource, rows: Inventory["adobe"]) => {
    for (const row of rows) {
      if (row.status !== "active") continue;
      for (const product of new Set(row.products))
        add(`${vendor}:${product}`, 1, vendor, product);
    }
  };
  addProducts("adobe", adobe);
  for (const [provider, rows] of saas) {
    if (billsPerSeat(provider)) addProducts(provider, rows);
  }
  const rows = [...seats].map(([skuId, { count, vendor, name }]) => {
    const price = bySku.get(skuId);
    const priceCents = Math.max(0, price?.monthlyPriceCents ?? 0);
    return {
      skuId,
      vendor,
      name,
      seats: count,
      priceCents,
      source: price?.source,
      cents: count * priceCents,
    };
  });
  return { rows, totalCents: rows.reduce((sum, row) => sum + row.cents, 0) };
}

export function priceConfidence(spend: ReturnType<typeof licenseSpend>) {
  const customCents = spend.rows.reduce(
    (sum, row) => sum + (row.source === "custom" ? row.cents : 0),
    0,
  );
  return {
    customPercent: spend.totalCents
      ? Math.round((customCents * 100) / spend.totalCents)
      : 0,
    estimatePercent: spend.totalCents
      ? 100 - Math.round((customCents * 100) / spend.totalCents)
      : 0,
    unpricedSeats: spend.rows.reduce(
      (sum, row) => sum + (row.priceCents === 0 ? row.seats : 0),
      0,
    ),
  };
}

export function groupSaasSeats<T extends { provider: SaasProvider }>(
  rows: readonly T[],
) {
  const groups = new Map<SaasProvider, T[]>();
  for (const row of rows) {
    const group = groups.get(row.provider) ?? [];
    group.push(row);
    groups.set(row.provider, group);
  }
  return groups;
}

/** Stored analyses can predate the purchased-seat accounting rules. */
export const comparableWaste = (wasteCents: number, spendCents: number) =>
  Math.min(wasteCents, spendCents);
