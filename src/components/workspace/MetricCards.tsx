"use client";

import { useId, useState } from "react";

import { Drawer } from "./Drawer";

export type BreakdownRow = {
  /** Primary label, e.g. a product name or a waste-rule label. */
  label: string;
  /** Secondary line, e.g. a SKU part number or the per-row math. */
  sub?: string;
  /** Pre-formatted, right-aligned value (money or count). */
  value: string;
  tone?: "ink" | "waste";
};

export type MetricCardData = {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone: "ink" | "waste";
  /** Optional footnote rendered under the card (may contain a link). */
  note?: React.ReactNode;
  /** One-line formula shown in the info-icon tooltip. */
  explainer: string;
  detail: {
    /** Plain-language formula. */
    formula: string;
    /** Where the underlying numbers come from. */
    source: string;
    /** Column headers for the breakdown table. */
    columns: [string, string];
    rows: BreakdownRow[];
    totalLabel: string;
    totalValue: string;
    /** Shown instead of the table when there are no rows. */
    emptyText?: string;
    /** Extra context under the breakdown, e.g. price-accuracy caveat. */
    footnote?: string;
  };
};

/**
 * Focusable "i" that reveals its explainer on hover and on keyboard focus, and
 * opens the full breakdown on click. It is a real <button> (not a span nested
 * inside the card button) so keyboard users can reach the tooltip, and the
 * explainer is wired up via aria-describedby.
 */
const InfoButton = ({
  explainer,
  label,
  onOpen,
  tourAnchor,
}: {
  explainer: string;
  label: string;
  onOpen: () => void;
  tourAnchor?: string;
}) => {
  const tipId = useId();
  return (
    <span className="group/info relative inline-flex">
      <button
        type="button"
        data-tour={tourAnchor}
        onClick={onOpen}
        aria-label={`${label}: what this means`}
        aria-describedby={tipId}
        className="text-ink-faint hover:text-ink focus-visible:text-ink flex size-4 items-center justify-center rounded-full border border-current text-[10px] leading-none font-semibold transition"
      >
        <span aria-hidden="true">i</span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="border-line bg-ink-panel text-canvas pointer-events-none absolute top-full right-0 z-10 mt-2 w-56 rounded-lg border px-3 py-2 text-left text-xs leading-snug font-normal tracking-normal normal-case opacity-0 shadow-float transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100"
      >
        {explainer}
      </span>
    </span>
  );
};

export const MetricCards = ({ cards }: { cards: MetricCardData[] }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const active = cards.find((c) => c.key === openKey) ?? null;

  return (
    <>
      <section className="rise rise-2 mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            data-tour={card.key === "waste" ? "waste-card" : undefined}
            className="bg-card p-5"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenKey(card.key)}
                aria-haspopup="dialog"
                aria-label={`${card.label}: show how this is calculated`}
                className="text-left text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase underline-offset-4 hover:text-ink hover:underline"
              >
                {card.label}
              </button>
              <InfoButton
                explainer={card.explainer}
                label={card.label}
                onOpen={() => setOpenKey(card.key)}
                tourAnchor={card.key === "waste" ? "metric-info" : undefined}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpenKey(card.key)}
              aria-label={`${card.label}: show breakdown`}
              className="group/val block w-full text-left"
            >
              <span
                className={`mt-2 block font-display text-3xl tracking-tight underline-offset-4 group-hover/val:underline ${
                  card.tone === "waste" ? "text-waste-text" : "text-ink"
                }`}
              >
                {card.value}
              </span>
            </button>
            <div className="mt-1 text-xs text-ink-soft">{card.sub}</div>
            {card.note && (
              <div className="mt-1 text-xs text-ink-faint">{card.note}</div>
            )}
          </div>
        ))}
      </section>

      <Drawer
        open={active !== null}
        onClose={() => setOpenKey(null)}
        title={active?.label ?? ""}
      >
        {active && (
          <div className="flex flex-col gap-6">
            <div>
              <div
                className={`font-display text-4xl tracking-tight ${
                  active.tone === "waste" ? "text-waste-text" : "text-ink"
                }`}
              >
                {active.value}
              </div>
              <div className="mt-1 text-sm text-ink-soft">{active.sub}</div>
            </div>

            <dl className="flex flex-col gap-4">
              <div>
                <dt className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
                  How it is calculated
                </dt>
                <dd className="mt-1 text-sm text-ink-soft">
                  {active.detail.formula}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
                  Where it comes from
                </dt>
                <dd className="mt-1 text-sm text-ink-soft">
                  {active.detail.source}
                </dd>
              </div>
            </dl>

            <div>
              <div className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
                Breakdown
              </div>
              {active.detail.rows.length > 0 ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                      <th className="py-2 pr-3 font-medium">
                        {active.detail.columns[0]}
                      </th>
                      <th className="py-2 pl-3 text-right font-medium">
                        {active.detail.columns[1]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.detail.rows.map((row, i) => (
                      <tr key={i} className="border-b border-line/70">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{row.label}</div>
                          {row.sub && (
                            <div className="font-mono text-[11px] text-ink-faint">
                              {row.sub}
                            </div>
                          )}
                        </td>
                        <td
                          className={`tnum py-2 pl-3 text-right align-top font-mono ${
                            row.tone === "waste"
                              ? "font-medium text-waste-text"
                              : "text-ink"
                          }`}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-line">
                      <td className="py-2 pr-3 font-medium">
                        {active.detail.totalLabel}
                      </td>
                      <td
                        className={`tnum py-2 pl-3 text-right font-mono font-semibold ${
                          active.tone === "waste" ? "text-waste-text" : "text-ink"
                        }`}
                      >
                        {active.detail.totalValue}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-ink-soft">
                  {active.detail.emptyText ?? "Nothing to show yet."}
                </p>
              )}
              {active.detail.footnote && (
                <p className="mt-3 text-xs text-ink-faint">
                  {active.detail.footnote}
                </p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
};
