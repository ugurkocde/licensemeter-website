"use client";

import { useCallback, useId, useState } from "react";

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
 * opens the full breakdown on click. It is a real <button> so keyboard users
 * can reach the tooltip, the explainer is wired up via aria-describedby, and
 * Escape dismisses the tooltip without leaving the button.
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
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className="group/info relative inline-flex"
      onMouseLeave={() => setDismissed(false)}
    >
      <button
        type="button"
        data-tour={tourAnchor}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDismissed(true);
        }}
        onBlur={() => setDismissed(false)}
        aria-label={`${label}: what this means`}
        aria-describedby={tipId}
        className="text-ink-faint hover:text-ink focus-visible:text-ink focus-visible:ring-brand -my-3 flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] leading-none font-semibold"
        >
          i
        </span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`border-line bg-card text-ink shadow-float pointer-events-none absolute top-full right-0 z-10 mt-2 w-56 rounded-lg border px-3 py-2 text-left text-xs leading-snug font-normal tracking-normal normal-case opacity-0 transition-opacity duration-150 ${
          dismissed
            ? ""
            : "group-focus-within/info:opacity-100 group-hover/info:opacity-100"
        }`}
      >
        {explainer}
      </span>
    </span>
  );
};

export const MetricCards = ({ cards }: { cards: MetricCardData[] }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const active = cards.find((c) => c.key === openKey) ?? null;
  const closeDrawer = useCallback(() => setOpenKey(null), []);

  return (
    <>
      <section className="rise rise-2 border-line bg-line mt-8 grid gap-px border sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.key}
            data-tour={card.key === "waste" ? "waste-card" : undefined}
            className="bg-card p-5"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <h2 className="text-ink-faint text-left text-[11px] font-medium tracking-[0.16em] uppercase">
                {card.label}
              </h2>
              <InfoButton
                explainer={card.explainer}
                label={card.label}
                onOpen={() => setOpenKey(card.key)}
                tourAnchor={card.key === "waste" ? "metric-info" : undefined}
              />
            </div>
            <p
              className={`font-display mt-2 text-3xl tracking-tight ${
                card.tone === "waste" ? "text-waste-text" : "text-ink"
              }`}
            >
              {card.value}
            </p>
            <div className="text-ink-soft mt-1 text-xs">{card.sub}</div>
            {card.note && (
              <div className="text-ink-faint mt-1 text-xs">{card.note}</div>
            )}
            <button
              type="button"
              onClick={() => setOpenKey(card.key)}
              aria-haspopup="dialog"
              aria-label={`${card.label}: view breakdown`}
              className="text-brand-text hover:text-ink mt-3 inline-flex min-h-11 cursor-pointer items-center text-xs font-medium underline-offset-4 hover:underline"
            >
              View breakdown <span aria-hidden="true">→</span>
            </button>
          </div>
        ))}
      </section>

      <Drawer
        open={active !== null}
        onClose={closeDrawer}
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
              <div className="text-ink-soft mt-1 text-sm">{active.sub}</div>
            </div>

            <dl className="flex flex-col gap-4">
              <div>
                <dt className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                  How it is calculated
                </dt>
                <dd className="text-ink-soft mt-1 text-sm">
                  {active.detail.formula}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                  Where it comes from
                </dt>
                <dd className="text-ink-soft mt-1 text-sm">
                  {active.detail.source}
                </dd>
              </div>
            </dl>

            <div>
              <div className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                Breakdown
              </div>
              {active.detail.rows.length > 0 ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        {active.detail.columns[0]}
                      </th>
                      <th
                        scope="col"
                        className="py-2 pl-3 text-right font-medium"
                      >
                        {active.detail.columns[1]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.detail.rows.map((row, i) => (
                      <tr key={i} className="border-line/70 border-b">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{row.label}</div>
                          {row.sub && (
                            <div className="text-ink-faint font-mono text-[11px]">
                              {row.sub}
                            </div>
                          )}
                        </td>
                        <td
                          className={`tnum py-2 pl-3 text-right align-top font-mono ${
                            row.tone === "waste"
                              ? "text-waste-text font-medium"
                              : "text-ink"
                          }`}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-line border-t-2">
                      <td className="py-2 pr-3 font-medium">
                        {active.detail.totalLabel}
                      </td>
                      <td
                        className={`tnum py-2 pl-3 text-right font-mono font-semibold ${
                          active.tone === "waste"
                            ? "text-waste-text"
                            : "text-ink"
                        }`}
                      >
                        {active.detail.totalValue}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-ink-soft mt-3 text-sm">
                  {active.detail.emptyText ?? "Nothing to show yet."}
                </p>
              )}
              {active.detail.footnote && (
                <p className="text-ink-faint mt-3 text-xs">
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
