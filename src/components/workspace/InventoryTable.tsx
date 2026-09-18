"use client";

import { useMemo, useState } from "react";

import { fmtMoney, fmtNumber } from "~/lib/format";

export type InventoryRow = {
  skuId: string;
  /** Friendly product name (falls back to the SKU part number upstream). */
  name: string;
  partNumber: string;
  purchased: number;
  assigned: number;
  spendCents: number;
};

type SortKey =
  | "name"
  | "purchased"
  | "assigned"
  | "unassigned"
  | "utilization"
  | "spend";
type SortDir = "asc" | "desc";

/** Over-assigned SKUs (assigned > purchased) have no spare seats; clamp to 0. */
const unassignedOf = (r: InventoryRow): number =>
  Math.max(0, r.purchased - r.assigned);

const utilizationOf = (r: InventoryRow): number =>
  r.purchased > 0 ? Math.min((r.assigned / r.purchased) * 100, 100) : 0;

const sortValue = (r: InventoryRow, key: SortKey): number | string => {
  switch (key) {
    case "name":
      return r.name.toLowerCase();
    case "purchased":
      return r.purchased;
    case "assigned":
      return r.assigned;
    case "unassigned":
      return unassignedOf(r);
    case "utilization":
      return utilizationOf(r);
    case "spend":
      return r.spendCents;
  }
};

const UtilizationBar = ({
  row,
  currency,
}: {
  row: InventoryRow;
  currency: string;
}) => {
  const util = utilizationOf(row);
  const rounded = Math.round(util);
  return (
    <div className="flex items-center gap-2">
      <div
        className="bg-line h-1.5 w-24"
        role="meter"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${row.name} seat utilization`}
      >
        <div className="bg-ink-soft h-1.5" style={{ width: `${util}%` }} />
      </div>
      <span className="tnum text-ink-soft font-mono text-xs">
        {fmtNumber(rounded, currency)}%
      </span>
    </div>
  );
};

export const InventoryTable = ({
  rows,
  currency,
  emptyText,
}: {
  rows: InventoryRow[];
  currency: string;
  emptyText: string;
}) => {
  // Default view matches the previous server-rendered order: spend, descending.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "spend",
    dir: "desc",
  });

  const sortedRows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          purchased: acc.purchased + r.purchased,
          assigned: acc.assigned + r.assigned,
          unassigned: acc.unassigned + unassignedOf(r),
          spendCents: acc.spendCents + r.spendCents,
        }),
        { purchased: 0, assigned: 0, unassigned: 0, spendCents: 0 },
      ),
    [rows],
  );

  // Text columns default to ascending (A→Z); numeric columns to descending
  // (largest first), which is what an admin hunting for waste expects.
  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    sort.key === key
      ? sort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none";

  const SortButton = ({
    sortKey,
    label,
    align = "left",
  }: {
    sortKey: SortKey;
    label: string;
    align?: "left" | "right";
  }) => {
    const active = sort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggle(sortKey)}
        className={`group inline-flex items-center gap-1 uppercase ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-ink" : "hover:text-ink"}`}
      >
        {label}
        <span aria-hidden="true" className="text-[9px] leading-none">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  };

  const hasRows = sortedRows.length > 0;

  return (
    <section className="rise rise-3 mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          License inventory
        </h2>

        <a
          href="/api/export/licenses"
          className="text-ink-soft hover:text-ink text-xs underline-offset-4 hover:underline"
        >
          Export CSV
        </a>
      </div>

      {/* Desktop table */}
      <div className="border-line bg-card mt-3 hidden overflow-x-auto border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
              <th
                scope="col"
                aria-sort={ariaSort("name")}
                className="px-4 py-3 font-medium"
              >
                <SortButton sortKey="name" label="Product" />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("purchased")}
                className="px-4 py-3 text-right font-medium"
              >
                <SortButton
                  sortKey="purchased"
                  label="Purchased"
                  align="right"
                />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("assigned")}
                className="px-4 py-3 text-right font-medium"
              >
                <SortButton sortKey="assigned" label="Assigned" align="right" />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("unassigned")}
                className="px-4 py-3 text-right font-medium"
              >
                <SortButton
                  sortKey="unassigned"
                  label="Unassigned"
                  align="right"
                />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("utilization")}
                className="px-4 py-3 font-medium"
              >
                <SortButton sortKey="utilization" label="Utilization" />
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("spend")}
                className="px-4 py-3 text-right font-medium"
              >
                <SortButton sortKey="spend" label="Spend / mo" align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const free = unassignedOf(r);
              return (
                <tr
                  key={r.skuId}
                  className="border-line hover:bg-canvas border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-ink-faint font-mono text-[11px]">
                      {r.partNumber}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(r.purchased, currency)}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(r.assigned, currency)}
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
                  <td className="px-4 py-3">
                    <UtilizationBar row={r} currency={currency} />
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtMoney(r.spendCents, currency)}
                  </td>
                </tr>
              );
            })}
            {!hasRows && (
              <tr>
                <td colSpan={6} className="text-ink-soft px-4 py-8 text-center">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {hasRows && (
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
                <td className="px-4 py-3" />
                <td className="tnum text-ink px-4 py-3 text-right font-mono font-semibold">
                  {fmtMoney(totals.spendCents, currency)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="mt-3 flex flex-col gap-3 md:hidden">
        {sortedRows.map((r) => {
          const free = unassignedOf(r);
          return (
            <li key={r.skuId} className="border-line bg-card border p-4">
              <div className="font-medium">{r.name}</div>
              <div className="text-ink-faint font-mono text-[11px]">
                {r.partNumber}
              </div>
              <dl className="tnum mt-3 grid grid-cols-1 gap-x-6 gap-y-2 font-mono text-sm min-[360px]:grid-cols-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">
                    Purchased
                  </dt>
                  <dd>{fmtNumber(r.purchased, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Assigned</dt>
                  <dd>{fmtNumber(r.assigned, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">
                    Unassigned
                  </dt>
                  <dd className={free > 0 ? "text-waste-text font-medium" : ""}>
                    {fmtNumber(free, currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Spend/mo</dt>
                  <dd>{fmtMoney(r.spendCents, currency)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <UtilizationBar row={r} currency={currency} />
              </div>
            </li>
          );
        })}
        {!hasRows && (
          <li className="border-line bg-card text-ink-soft border px-4 py-8 text-center text-sm">
            {emptyText}
          </li>
        )}
        {hasRows && (
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
    </section>
  );
};
