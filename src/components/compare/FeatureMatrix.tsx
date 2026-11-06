import {
  FEATURE_GROUPS,
  FEATURES,
  type FeatureKey,
} from "~/lib/compare/features";
import type { FeatureValue, Lang, Product } from "~/lib/compare/types";

import { compareCopy } from "./copy";

const MARK: Record<FeatureValue, { glyph: string; className: string }> = {
  yes: { glyph: "✓", className: "bg-good-soft text-good-text" },
  no: { glyph: "✕", className: "bg-subtle text-ink-faint" },
  partial: { glyph: "◐", className: "bg-gold-soft text-gold-text" },
  unknown: { glyph: "?", className: "bg-subtle text-ink-faint" },
  unchecked: { glyph: "·", className: "text-ink-faint border-line border" },
};

const Value = ({ value, lang }: { value: FeatureValue; lang: Lang }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${MARK[value].className}`}
  >
    <span aria-hidden="true">{MARK[value].glyph}</span>
    {compareCopy(lang).values[value]}
  </span>
);

/**
 * Lines products up against the shared feature dictionary, grouped. With
 * notes it is the head-to-head table (two or three columns, every cell
 * sourced); without, the compact at-a-glance grid of a roundup.
 */
export const FeatureMatrix = ({
  products,
  keys,
  lang,
  notes = false,
}: {
  products: readonly Product[];
  keys: readonly FeatureKey[];
  lang: Lang;
  notes?: boolean;
}) => {
  const t = compareCopy(lang);
  const groups = (
    Object.keys(FEATURE_GROUPS) as (keyof typeof FEATURE_GROUPS)[]
  )
    .map((group) => ({
      group,
      keys: keys.filter((k) => FEATURES[k].group === group),
    }))
    .filter((g) => g.keys.length > 0);
  const minWidth = notes
    ? 320 + products.length * 260
    : 300 + products.length * 120;

  return (
    <div className="border-line mt-8 overflow-x-auto border">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr className="border-line bg-card border-b text-left">
            <th
              scope="col"
              className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase"
            >
              {t.feature}
            </th>
            {products.map((p) => (
              <th
                key={p.slug}
                scope="col"
                className="text-ink px-4 py-3 text-sm font-medium"
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(({ group, keys: rows }) => (
          <tbody key={group}>
            <tr className="border-line bg-subtle border-b">
              <th
                scope="colgroup"
                colSpan={products.length + 1}
                className="text-ink-soft px-4 py-2 text-left text-xs font-medium tracking-[0.12em] uppercase"
              >
                {FEATURE_GROUPS[group][lang]}
              </th>
            </tr>
            {rows.map((key) => (
              <tr key={key} className="border-line border-b last:border-b-0">
                <th
                  scope="row"
                  className="text-ink px-4 py-3 text-left align-top font-medium"
                >
                  {FEATURES[key].label[lang]}
                </th>
                {products.map((p) => {
                  const entry = p.features[key];
                  return (
                    <td
                      key={p.slug}
                      className={`text-ink-soft px-4 py-3 align-top leading-relaxed ${p.category === "licensemeter" ? "bg-card" : ""}`}
                    >
                      {!notes && entry?.source ? (
                        // Compact grid: the value itself links to its source,
                        // with the note as hover text and accessible name.
                        <a
                          href={entry.source}
                          rel="nofollow noopener"
                          title={entry.note[lang]}
                          aria-label={`${t.values[entry.value]}: ${entry.note[lang]} (${t.source})`}
                          className="rounded-full hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <Value value={entry.value} lang={lang} />
                        </a>
                      ) : (
                        <Value value={entry?.value ?? "unknown"} lang={lang} />
                      )}
                      {notes && entry && (
                        <p className="mt-2 text-[13px]">
                          {entry.note[lang]}
                          {entry.source && (
                            <>
                              {" "}
                              <a
                                href={entry.source}
                                rel="nofollow noopener"
                                className="text-ink-faint hover:text-brand-text whitespace-nowrap underline underline-offset-2"
                              >
                                {t.source}
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
};
