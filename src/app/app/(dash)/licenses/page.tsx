import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { PackageOpen } from "lucide-react";

import { ImportPricesForm } from "./ImportPricesForm";
import { EmptyState } from "~/components/workspace/EmptyState";
import { PriceEditor } from "~/components/workspace/PriceRow";
import { PriceAccuracyCard } from "~/components/workspace/PriceAccuracyCard";
import { ButtonAnchor, Pill, buttonClass } from "~/components/ui";
import { CONNECTORS } from "~/lib/connectors";
import { fmtMoney, fmtNumber } from "~/lib/format";
import { calculatePriceCoverage } from "~/lib/priceCoverage";
import { adobePriceKey } from "~/server/adobe/analyze";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { isShelfwareExempt } from "~/server/waste/engine";
import { saasPriceKey } from "~/server/saas/analyze";
import {
  adobeUsers,
  priceBook,
  saasSeats,
  tenantSkus,
} from "~/server/db/schema";

export const metadata: Metadata = { title: "Licenses & prices" };

type PriceRow = typeof priceBook.$inferSelect;

const PriceSourcePill = ({ price }: { price: PriceRow | undefined }) => {
  if (!price || price.monthlyPriceCents === 0) {
    return <Pill tone="gold">Set a price</Pill>;
  }
  return price.source === "custom" ? (
    <Pill tone="moss">Your price</Pill>
  ) : (
    <Pill tone="slate">List estimate</Pill>
  );
};

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const query =
    typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 100) : "";
  const requestedFilter = typeof sp.pricing === "string" ? sp.pricing : "all";
  const pricingFilter = ["all", "unpriced", "estimate", "custom"].includes(
    requestedFilter,
  )
    ? requestedFilter
    : "all";
  const isAdmin = hasRole(ctx, "admin");
  const currency = ctx.tenant.currency;
  // Imported workspaces (consentedAt null, never the demo) have no sync button,
  // so do not tell them to run one.
  const isImported = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;
  const emptyMessage = isImported
    ? "No license data yet. Upload a fresh export to update this workspace."
    : "No license data yet. Run a sync.";

  const [skus, prices, adobeSeats, saasSeatRows] = await Promise.all([
    db.query.tenantSkus.findMany({
      where: eq(tenantSkus.tenantId, ctx.tenant.id),
    }),
    db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, ctx.tenant.id),
    }),
    // Only the product arrays are needed to tally seat counts; don't pull the
    // full per-user rows.
    db.query.adobeUsers.findMany({
      where: eq(adobeUsers.tenantId, ctx.tenant.id),
      columns: { products: true },
    }),
    db.query.saasSeats.findMany({
      where: eq(saasSeats.tenantId, ctx.tenant.id),
      columns: { provider: true, products: true },
    }),
  ]);
  const priceRows = new Map(prices.map((p) => [p.skuId, p]));

  const allAdobeProducts = [
    ...adobeSeats
      .flatMap((u) => u.products)
      .reduce(
        (m, product) => m.set(product, (m.get(product) ?? 0) + 1),
        new Map<string, number>(),
      ),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  // Unpriced connectors (AI consoles) bill API usage, not seats. No price rows.
  const allSaasSections = CONNECTORS.filter((c) => !c.unpriced)
    .map(({ provider, label }) => ({
      provider,
      label,
      products: [
        ...saasSeatRows
          .filter((s) => s.provider === provider)
          .flatMap((s) => s.products)
          .reduce(
            (m, product) => m.set(product, (m.get(product) ?? 0) + 1),
            new Map<string, number>(),
          ),
      ].sort((a, b) => a[0].localeCompare(b[0])),
    }))
    .filter((section) => section.products.length > 0);
  // Drop Microsoft free/viral/capacity sentinel SKUs (WINDOWS_STORE's 1,000,000
  // prepaid units, FLOW_FREE, etc.) so this table matches Overview's inventory
  // and the licenses CSV export, which both apply the same exemption.
  const realSkus = skus.filter(
    (s) => !isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled),
  );
  const allSorted = [...realSkus].sort((a, b) =>
    (a.displayName ?? a.skuPartNumber).localeCompare(
      b.displayName ?? b.skuPartNumber,
    ),
  );

  // Over-assigned SKUs (assigned > purchased) have no spare seats; clamp to 0.
  const unassignedOf = (s: (typeof allSorted)[number]) =>
    Math.max(0, s.prepaidEnabled - s.consumedUnits);
  const totals = allSorted.reduce(
    (acc, s) => {
      const cents = priceRows.get(s.skuId)?.monthlyPriceCents ?? 0;
      return {
        purchased: acc.purchased + s.prepaidEnabled,
        assigned: acc.assigned + s.consumedUnits,
        unassigned: acc.unassigned + unassignedOf(s),
        spendCents: acc.spendCents + s.consumedUnits * cents,
      };
    },
    { purchased: 0, assigned: 0, unassigned: 0, spendCents: 0 },
  );

  const coverageProducts = [
    ...allSorted.map((s) => ({
      seats: s.consumedUnits,
      priceCents: priceRows.get(s.skuId)?.monthlyPriceCents ?? 0,
      source: priceRows.get(s.skuId)?.source,
    })),
    ...allAdobeProducts.map(([product, count]) => ({
      seats: count,
      priceCents: priceRows.get(adobePriceKey(product))?.monthlyPriceCents ?? 0,
      source: priceRows.get(adobePriceKey(product))?.source,
    })),
    ...allSaasSections.flatMap(({ provider, products }) =>
      products.map(([product, count]) => ({
        seats: count,
        priceCents:
          priceRows.get(saasPriceKey(provider, product))?.monthlyPriceCents ??
          0,
        source: priceRows.get(saasPriceKey(provider, product))?.source,
      })),
    ),
  ];
  const priceCoverage = calculatePriceCoverage(coverageProducts);
  const matchesPrice = (price: PriceRow | undefined) =>
    pricingFilter === "all" ||
    (pricingFilter === "unpriced" &&
      (!price || price.monthlyPriceCents === 0)) ||
    (pricingFilter === "estimate" &&
      Boolean(
        price && price.monthlyPriceCents > 0 && price.source === "default",
      )) ||
    (pricingFilter === "custom" &&
      Boolean(
        price && price.monthlyPriceCents > 0 && price.source === "custom",
      ));
  const matchesQuery = (...values: string[]) =>
    !query || values.some((value) => value.toLowerCase().includes(query));
  const sorted = allSorted.filter(
    (s) =>
      matchesPrice(priceRows.get(s.skuId)) &&
      matchesQuery(s.displayName ?? "", s.skuPartNumber, s.skuId),
  );
  const adobeProducts = allAdobeProducts.filter(
    ([product]) =>
      matchesPrice(priceRows.get(adobePriceKey(product))) &&
      matchesQuery(product, adobePriceKey(product)),
  );
  const saasSections = allSaasSections
    .map((section) => ({
      ...section,
      products: section.products.filter(
        ([product]) =>
          matchesPrice(
            priceRows.get(saasPriceKey(section.provider, product)),
          ) &&
          matchesQuery(
            section.label,
            product,
            saasPriceKey(section.provider, product),
          ),
      ),
    }))
    .filter((section) => section.products.length > 0);
  const filtersActive = Boolean(query) || pricingFilter !== "all";
  const tableEmptyHeading = filtersActive
    ? "No matching Microsoft products in this section."
    : "No license data yet.";
  const tableEmptyMessage = filtersActive
    ? "Try a broader search or a different price status."
    : emptyMessage;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            Licenses &amp; prices
          </h1>
          <p className="text-ink-soft mt-1 max-w-2xl text-sm">
            Prices start as list-price estimates. Enter what you actually pay
            per seat and month. Every impact figure recalculates from your
            numbers. There is no Microsoft API for tenant pricing.
          </p>
          {isAdmin && (
            <p className="text-ink-faint mt-2 text-xs">
              Changed rows show an enabled Save button. For many prices, use the
              bulk import below.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <a href="#bulk-price-import" className={buttonClass("secondary")}>
              Bulk Import Prices
            </a>
          )}
          <ButtonAnchor href="/api/export/licenses">Export CSV</ButtonAnchor>
        </div>
      </header>

      {!priceCoverage.complete && priceCoverage.totalProducts > 0 && (
        <section className="rise rise-2 mt-6">
          <PriceAccuracyCard coverage={priceCoverage} />
        </section>
      )}

      <form className="rise rise-2 border-line bg-card mt-6 flex flex-col gap-3 border p-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
          Search products
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            placeholder="Product, SKU or connector…"
            className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Price status
          <select
            name="pricing"
            defaultValue={pricingFilter}
            autoComplete="off"
            className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
          >
            <option value="all">All products</option>
            <option value="unpriced">Unpriced only</option>
            <option value="estimate">List estimates only</option>
            <option value="custom">Contract prices only</option>
          </select>
        </label>
        <button className="border-ink bg-ink text-canvas hover:bg-ink-soft min-h-11 border px-4 py-2 text-sm font-medium">
          Apply filters
        </button>
      </form>

      {/* Desktop table */}
      <div className="rise rise-2 border-line bg-card mt-8 mb-8 hidden overflow-x-auto border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
              <th scope="col" className="px-4 py-3 font-medium">
                Product
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Purchased
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Assigned
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Unassigned
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Spend / mo
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Price source
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Price / seat / mo
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const p = priceRows.get(s.skuId);
              const cents = p?.monthlyPriceCents ?? 0;
              const free = unassignedOf(s);
              return (
                <tr
                  key={s.skuId}
                  className="border-line hover:bg-canvas border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {s.displayName ?? s.skuPartNumber}
                    </div>
                    <div className="text-ink-faint font-mono text-[11px]">
                      {s.skuPartNumber}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(s.prepaidEnabled, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(s.consumedUnits, currency)}
                  </td>
                  <td
                    className={`tnum px-4 py-3 text-right font-mono ${
                      free > 0
                        ? "text-waste-text font-medium"
                        : "text-ink-faint"
                    }`}
                  >
                    {fmtNumber(free, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtMoney(s.consumedUnits * cents, currency)}
                  </td>
                  <td className="px-4 py-3">
                    <PriceSourcePill price={p} />
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <PriceEditor
                        skuId={s.skuId}
                        name={s.displayName ?? s.skuPartNumber}
                        initial={(cents / 100).toFixed(2)}
                        currency={currency}
                      />
                    ) : (
                      <div className="tnum text-right font-mono">
                        {fmtMoney(cents, currency)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={PackageOpen} heading={tableEmptyHeading}>
                    {tableEmptyMessage}
                  </EmptyState>
                </td>
              </tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-line text-ink-faint border-t-2 text-[11px] tracking-[0.14em] uppercase">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  Total
                </th>
                <td className="tnum text-ink px-4 py-3 text-right font-mono">
                  {fmtNumber(totals.purchased, currency)}
                </td>
                <td className="tnum text-ink px-4 py-3 text-right font-mono">
                  {fmtNumber(totals.assigned, currency)}
                </td>
                <td
                  className={`tnum px-4 py-3 text-right font-mono ${
                    totals.unassigned > 0
                      ? "text-waste-text font-medium"
                      : "text-ink"
                  }`}
                >
                  {fmtNumber(totals.unassigned, currency)}
                </td>
                <td className="tnum text-ink px-4 py-3 text-right font-mono font-semibold">
                  {fmtMoney(totals.spendCents, currency)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="rise rise-2 mt-8 mb-8 flex flex-col gap-3 md:hidden">
        {sorted.map((s) => {
          const p = priceRows.get(s.skuId);
          const cents = p?.monthlyPriceCents ?? 0;
          return (
            <li key={s.skuId} className="border-line bg-card border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {s.displayName ?? s.skuPartNumber}
                  </div>
                  <div className="text-ink-faint font-mono text-[11px]">
                    {s.skuPartNumber}
                  </div>
                </div>
                <PriceSourcePill price={p} />
              </div>
              <dl className="tnum mt-3 grid grid-cols-1 gap-x-6 gap-y-2 font-mono text-sm min-[360px]:grid-cols-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">
                    Purchased
                  </dt>
                  <dd>{fmtNumber(s.prepaidEnabled, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Assigned</dt>
                  <dd>{fmtNumber(s.consumedUnits, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">
                    Unassigned
                  </dt>
                  <dd
                    className={
                      unassignedOf(s) > 0 ? "text-waste-text font-medium" : ""
                    }
                  >
                    {fmtNumber(unassignedOf(s), currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Spend/mo</dt>
                  <dd>{fmtMoney(s.consumedUnits * cents, currency)}</dd>
                </div>
              </dl>
              <div className="border-line mt-3 border-t pt-3">
                {isAdmin ? (
                  <PriceEditor
                    skuId={s.skuId}
                    name={s.displayName ?? s.skuPartNumber}
                    initial={(cents / 100).toFixed(2)}
                    currency={currency}
                  />
                ) : (
                  <div className="tnum text-right font-mono text-sm">
                    {fmtMoney(cents, currency)} / seat / mo
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="border-line bg-card border">
            <EmptyState icon={PackageOpen} heading={tableEmptyHeading}>
              {tableEmptyMessage}
            </EmptyState>
          </li>
        )}
        {sorted.length > 0 && (
          <li className="border-line bg-card border p-4">
            <dl className="tnum grid grid-cols-1 gap-x-6 gap-y-2 font-mono text-sm min-[360px]:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint font-sans text-xs font-medium uppercase">
                  Total purchased
                </dt>
                <dd>{fmtNumber(totals.purchased, currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint font-sans text-xs font-medium uppercase">
                  Total assigned
                </dt>
                <dd>{fmtNumber(totals.assigned, currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint font-sans text-xs font-medium uppercase">
                  Total unassigned
                </dt>
                <dd
                  className={
                    totals.unassigned > 0 ? "text-waste-text font-medium" : ""
                  }
                >
                  {fmtNumber(totals.unassigned, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint font-sans text-xs font-medium uppercase">
                  Total spend/mo
                </dt>
                <dd className="font-semibold">
                  {fmtMoney(totals.spendCents, currency)}
                </dd>
              </div>
            </dl>
          </li>
        )}
      </ul>

      {adobeProducts.length > 0 && (
        <section id="adobe-products" className="rise rise-3 mb-8 scroll-mt-24">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
            Adobe products
          </h2>
          <p className="text-ink-soft mt-1 max-w-2xl text-sm">
            Seat counts come from the Adobe Admin Console; Adobe publishes no
            price API, so enter your per-seat price to put a number on the
            offboarding leaks.
          </p>
          <ul className="border-line bg-card mt-3 border">
            {adobeProducts.map(([product, count]) => {
              const p = priceRows.get(adobePriceKey(product));
              const cents = p?.monthlyPriceCents ?? 0;
              return (
                <li
                  key={product}
                  className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{product}</span>
                    <span className="tnum text-ink-soft ml-3 font-mono text-sm">
                      {fmtNumber(count, currency)} seats
                    </span>
                  </div>
                  {isAdmin ? (
                    <PriceEditor
                      skuId={adobePriceKey(product)}
                      name={product}
                      initial={(cents / 100).toFixed(2)}
                      currency={currency}
                    />
                  ) : (
                    <span className="tnum font-mono text-sm">
                      {fmtMoney(cents, currency)} / seat / mo
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {saasSections.map(({ provider, label, products }) => (
        <section key={provider} className="rise rise-3 mb-8">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
            {label} products
          </h2>
          <p className="text-ink-soft mt-1 max-w-2xl text-sm">
            Seat counts come from the {label} connector; {label} publishes no
            price API, so enter your per-seat price to put a number on the
            findings.
          </p>
          <ul className="border-line bg-card mt-3 border">
            {products.map(([product, count]) => {
              const p = priceRows.get(saasPriceKey(provider, product));
              const cents = p?.monthlyPriceCents ?? 0;
              return (
                <li
                  key={product}
                  className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{product}</span>
                    <span className="tnum text-ink-soft ml-3 font-mono text-sm">
                      {fmtNumber(count, currency)} seats
                    </span>
                  </div>
                  {isAdmin ? (
                    <PriceEditor
                      skuId={saasPriceKey(provider, product)}
                      name={product}
                      initial={(cents / 100).toFixed(2)}
                      currency={currency}
                    />
                  ) : (
                    <span className="tnum font-mono text-sm">
                      {fmtMoney(cents, currency)} / seat / mo
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {isAdmin && (
        <section
          id="bulk-price-import"
          className="rise rise-3 mb-8 scroll-mt-24"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
              Bulk price import
            </h2>

            <a
              href="/api/export/pricebook"
              className="text-ink-soft hover:text-ink text-xs underline-offset-4 hover:underline"
            >
              Export price book CSV
            </a>
          </div>
          <p className="text-ink-soft mt-1 max-w-2xl text-sm">
            Maintaining prices for many products or workspaces? Export the price
            book, fill in what you pay in a spreadsheet, and paste the result
            back here.
          </p>
          <div className="border-line bg-card mt-3 border p-4">
            <ImportPricesForm />
          </div>
        </section>
      )}
    </div>
  );
}
