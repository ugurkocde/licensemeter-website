import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { ImportPricesForm } from "./ImportPricesForm";
import { PriceEditor } from "~/components/workspace/PriceRow";
import { ButtonAnchor, Pill } from "~/components/ui";
import { CONNECTORS } from "~/lib/connectors";
import { fmtMoney, fmtNumber } from "~/lib/format";
import { adobePriceKey } from "~/server/adobe/analyze";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
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

export default async function LicensesPage() {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");
  const currency = ctx.tenant.currency;
  // Trial workspaces (consentedAt null, never the demo) have no sync button,
  // so do not tell them to run one.
  const isTrial = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;
  const emptyMessage = isTrial
    ? "No license data yet. Upload a fresh export to update this workspace."
    : "No license data yet. Run a sync.";

  const [skus, prices, adobeSeats, saasSeatRows] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, ctx.tenant.id) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, ctx.tenant.id) }),
    db.query.adobeUsers.findMany({ where: eq(adobeUsers.tenantId, ctx.tenant.id) }),
    db.query.saasSeats.findMany({ where: eq(saasSeats.tenantId, ctx.tenant.id) }),
  ]);
  const priceRows = new Map(prices.map((p) => [p.skuId, p]));

  const adobeProducts = [
    ...adobeSeats
      .flatMap((u) => u.products)
      .reduce(
        (m, product) => m.set(product, (m.get(product) ?? 0) + 1),
        new Map<string, number>(),
      ),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  // Unpriced connectors (AI consoles) bill API usage, not seats. No price rows.
  const saasSections = CONNECTORS.filter((c) => !c.unpriced)
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
  const sorted = [...skus].sort((a, b) =>
    (a.displayName ?? a.skuPartNumber).localeCompare(
      b.displayName ?? b.skuPartNumber,
    ),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            Licenses &amp; prices
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Prices start as list-price estimates. Enter what you actually pay
            per seat and month. Every impact figure recalculates from your
            numbers. There is no Microsoft API for tenant pricing.
          </p>
        </div>
        <ButtonAnchor href="/api/export/licenses">Export CSV</ButtonAnchor>
      </header>

      {/* Desktop table */}
      <div className="rise rise-2 mt-8 mb-8 hidden overflow-x-auto border border-line bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Purchased</th>
              <th className="px-4 py-3 text-right font-medium">Assigned</th>
              <th className="px-4 py-3 text-right font-medium">Spend / mo</th>
              <th className="px-4 py-3 font-medium">Price source</th>
              <th className="px-4 py-3 text-right font-medium">
                Price / seat / mo
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const p = priceRows.get(s.skuId);
              const cents = p?.monthlyPriceCents ?? 0;
              return (
                <tr
                  key={s.skuId}
                  className="border-b border-line last:border-b-0 hover:bg-canvas"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {s.displayName ?? s.skuPartNumber}
                    </div>
                    <div className="font-mono text-[11px] text-ink-faint">
                      {s.skuPartNumber}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(s.prepaidEnabled, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(s.consumedUnits, currency)}
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
                <td colSpan={6} className="px-4 py-10 text-center text-ink-soft">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="rise rise-2 mt-8 mb-8 flex flex-col gap-3 md:hidden">
        {sorted.map((s) => {
          const p = priceRows.get(s.skuId);
          const cents = p?.monthlyPriceCents ?? 0;
          return (
            <li key={s.skuId} className="border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {s.displayName ?? s.skuPartNumber}
                  </div>
                  <div className="font-mono text-[11px] text-ink-faint">
                    {s.skuPartNumber}
                  </div>
                </div>
                <PriceSourcePill price={p} />
              </div>
              <dl className="tnum mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="font-sans text-xs text-ink-faint">Purchased</dt>
                  <dd>{fmtNumber(s.prepaidEnabled, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-sans text-xs text-ink-faint">Assigned</dt>
                  <dd>{fmtNumber(s.consumedUnits, currency)}</dd>
                </div>
                <div className="col-span-2 flex justify-between gap-2">
                  <dt className="font-sans text-xs text-ink-faint">Spend/mo</dt>
                  <dd>{fmtMoney(s.consumedUnits * cents, currency)}</dd>
                </div>
              </dl>
              <div className="mt-3 border-t border-line pt-3">
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
          <li className="border border-line bg-card px-4 py-10 text-center text-sm text-ink-soft">
            {emptyMessage}
          </li>
        )}
      </ul>

      {adobeProducts.length > 0 && (
        <section className="rise rise-3 mb-8">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            Adobe products
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Seat counts come from the Adobe Admin Console; Adobe publishes no
            price API, so enter your per-seat price to put a number on the
            offboarding leaks.
          </p>
          <ul className="mt-3 border border-line bg-card">
            {adobeProducts.map(([product, count]) => {
              const p = priceRows.get(adobePriceKey(product));
              const cents = p?.monthlyPriceCents ?? 0;
              return (
                <li
                  key={product}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{product}</span>
                    <span className="tnum ml-3 font-mono text-sm text-ink-soft">
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
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            {label} products
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Seat counts come from the {label} connector; {label} publishes no
            price API, so enter your per-seat price to put a number on the
            findings.
          </p>
          <ul className="mt-3 border border-line bg-card">
            {products.map(([product, count]) => {
              const p = priceRows.get(saasPriceKey(provider, product));
              const cents = p?.monthlyPriceCents ?? 0;
              return (
                <li
                  key={product}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{product}</span>
                    <span className="tnum ml-3 font-mono text-sm text-ink-soft">
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
        <section className="rise rise-3 mb-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
              Bulk price import
            </h2>
            <a
              href="/api/export/pricebook"
              className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Export price book CSV
            </a>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Maintaining prices for many products or workspaces? Export the
            price book, fill in what you pay in a spreadsheet, and paste the
            result back here.
          </p>
          <div className="mt-3 border border-line bg-card p-4">
            <ImportPricesForm />
          </div>
        </section>
      )}
    </div>
  );
}
