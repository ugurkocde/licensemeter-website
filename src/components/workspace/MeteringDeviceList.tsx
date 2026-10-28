"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface MeteringDeviceRow {
  id: string;
  name: string;
  /** Collection health label and its soft tone classes. */
  health: string;
  tone: string;
  group: "starts" | "noReport" | "attention";
  appsStarted: number;
  /** Starts of metered apps in the last 30 days, or null if not counted. */
  starts: number | null;
}

const FILTERS = [
  ["all", "All"],
  ["starts", "Reporting"],
  ["attention", "Needs attention"],
  ["noReport", "No collector result"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const PAGE = 30;

/** Every Windows device in one list: filter, search, select one to open it. */
export function MeteringDeviceList({
  rows,
  selected,
}: {
  rows: MeteringDeviceRow[];
  selected: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "all" || row.group === filter) &&
        (!needle || row.name.toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);
  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter devices"
      >
        {FILTERS.map(([key, label]) => {
          const count =
            key === "all"
              ? rows.length
              : rows.filter((row) => row.group === key).length;
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
        <span className="sr-only">Search devices</span>
        <input
          type="search"
          value={query}
          placeholder="Search devices"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          className="border-line-input bg-card block min-h-11 w-full rounded-lg border px-3"
        />
      </label>
      {visible.length === 0 ? (
        <p className="text-ink-soft py-6 text-center text-sm">
          No device matches this filter.
        </p>
      ) : (
        <ul className="border-line divide-line divide-y rounded-xl border">
          {visible.slice(current * PAGE, current * PAGE + PAGE).map((row) => {
            const active = row.id === selected;
            return (
              <li key={row.id}>
                <Link
                  href={`/app/metering/devices?device=${encodeURIComponent(row.id)}#device`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition ${
                    active ? "bg-brand-soft/60" : "hover:bg-subtle"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <span className="text-ink-faint block truncate text-xs">
                      {row.appsStarted > 0 || row.starts
                        ? `${row.appsStarted} ${row.appsStarted === 1 ? "app" : "apps"} started${
                            row.starts === null
                              ? ""
                              : ` · ${row.starts} ${row.starts === 1 ? "start" : "starts"} in 30 days`
                          }`
                        : "No app starts reported"}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${row.tone}`}
                  >
                    {row.health}
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
