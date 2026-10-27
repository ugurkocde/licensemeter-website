"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface MeteringAppRow {
  id: string;
  name: string;
  publisher: string;
  /** Intune apps combined into this row. */
  copies: number;
  status: "metered" | "unknown" | "excluded";
  installed: number;
  started: number;
  notStarted: number;
  starts: number;
}

const FILTERS = [
  ["all", "All"],
  ["metered", "Metered"],
  ["unknown", "Needs a program file"],
  ["excluded", "Left out"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const STATUS: Record<MeteringAppRow["status"], [string, string]> = {
  metered: ["Metered", "bg-brand-soft text-brand-deep"],
  unknown: ["Needs a program file", "bg-waste-soft text-waste-text"],
  excluded: ["Left out", "bg-slate-soft text-slate-ink"],
};
const PAGE = 30;

/** Every Intune app in one list: filter, search, select one to open it. */
export function MeteringAppList({
  rows,
  selected,
}: {
  rows: MeteringAppRow[];
  selected: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.publisher.toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);
  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter apps"
      >
        {FILTERS.map(([key, label]) => {
          const count =
            key === "all"
              ? rows.length
              : rows.filter((row) => row.status === key).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                setPage(0);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                filter === key
                  ? "border-brand-strong bg-brand-soft text-brand-deep font-medium"
                  : "border-line bg-card text-ink-soft hover:border-line-strong"
              }`}
            >
              {label} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <label className="text-sm">
        <span className="sr-only">Search apps</span>
        <input
          type="search"
          value={query}
          placeholder="Search apps or publishers"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          className="border-line-input bg-card block min-h-11 w-full rounded-lg border px-3"
        />
      </label>
      {visible.length === 0 ? (
        <p className="text-ink-soft py-6 text-center text-sm">
          No app matches this filter.
        </p>
      ) : (
        <ul className="border-line divide-line divide-y rounded-xl border">
          {visible.slice(current * PAGE, current * PAGE + PAGE).map((row) => {
            const [label, tone] = STATUS[row.status];
            const active = row.id === selected;
            return (
              <li key={row.id}>
                <Link
                  href={`/app/metering/apps?app=${encodeURIComponent(row.id)}#app`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition sm:grid-cols-[1fr_auto_auto] ${
                    active ? "bg-brand-soft/60" : "hover:bg-subtle"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <span className="text-ink-faint block truncate text-xs">
                      {row.publisher}
                      {row.copies > 1 ? ` · ${row.copies} Intune apps` : ""}
                    </span>
                  </span>
                  <span className="text-ink-soft hidden text-xs tabular-nums sm:block">
                    {row.status === "metered"
                      ? `${row.started} of ${row.installed} started`
                      : row.installed
                        ? `${row.installed} installed`
                        : ""}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="text-ink-soft flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
