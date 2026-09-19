import Link from "next/link";

import { buttonClass } from "~/components/ui";
import {
  marketplaceOfferUrl,
  polarEnabled,
  signInEnabled,
  signInPath,
} from "~/env";
import {
  PLAN_IDS,
  pricingContent,
  PRICING_PATHS,
  comparisonGroups,
  formatEuro,
  planPrice,
  type ComparisonCell,
  type PlanId,
  type PricingLang,
  type RichText,
} from "~/lib/pricingContent";
import { planName } from "~/lib/planLabel";
import { SUPPORT_MAILTO } from "~/lib/support";
import { UPGRADE_PATH } from "~/lib/upgrade";

/**
 * Renders the pricing page from the bilingual structure in
 * ~/lib/pricingContent. Each language is a real, server-rendered URL
 * (/pricing and /de/pricing); the language toggle links between them.
 *
 * The Monthly / Yearly switch is CSS only: two radio inputs, and `:has()` on
 * the page root decides which price is displayed. It works without
 * JavaScript, and the hidden price leaves the accessibility tree as well.
 */

const SHOW_MONTHLY = "group-has-[#bill-y:checked]/pricing:hidden";
const SHOW_YEARLY_FLEX = "hidden group-has-[#bill-y:checked]/pricing:flex";
const SHOW_YEARLY_BLOCK = "hidden group-has-[#bill-y:checked]/pricing:block";
const SHOW_YEARLY_INLINE_FLEX =
  "hidden group-has-[#bill-y:checked]/pricing:inline-flex";

const EYEBROW =
  "text-brand-text text-xs font-medium tracking-[0.2em] uppercase";
const SECTION_H2 =
  "font-display mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-[2rem] sm:leading-tight";
const TEXT_LINK =
  "text-ink hover:text-brand-text font-medium underline underline-offset-4";

const CheckIcon = ({ className }: { className: string }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
    <path
      d="M4.5 10.5l3.5 3.5 7.5-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DashIcon = ({ className }: { className: string }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
    <path
      d="M6 10h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const Rich = ({ parts }: { parts: RichText }) => (
  <>
    {parts.map((part) =>
      typeof part === "string" ? (
        part
      ) : (
        <Link key={part.href} href={part.href} className={TEXT_LINK}>
          {part.text}
        </Link>
      ),
    )}
  </>
);

/** Per-plan surface: Pro sits on dark teal, MSP on a faint teal wash. */
const PLAN_STYLE: Record<
  PlanId,
  {
    card: string;
    name: string;
    tag: string;
    muted: string;
    pitch: string;
    rule: string;
    check: string;
    primary: string;
    secondary: string;
  }
> = {
  free: {
    card: "border-line bg-card shadow-card",
    name: "text-ink-faint",
    tag: "bg-brand-soft text-brand-text",
    muted: "text-ink-faint",
    pitch: "text-ink-soft",
    rule: "border-line",
    check: "text-brand",
    primary: buttonClass("secondary", "w-full"),
    secondary: buttonClass("secondary", "w-full"),
  },
  pro: {
    card: "border-brand-deep bg-brand-deep shadow-hero bg-[radial-gradient(120%_70%_at_100%_0%,rgba(45,212,191,0.16),transparent_60%)] text-white",
    name: "text-brand-bright",
    tag: "bg-brand-bright/15 text-brand-bright",
    muted: "text-white/65",
    pitch: "text-white/85",
    rule: "border-white/15",
    check: "text-brand-bright",
    primary:
      "text-brand-deep hover:bg-brand-soft inline-flex min-h-11 w-full touch-manipulation items-center justify-center rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold transition focus-visible:outline-white",
    secondary:
      "inline-flex min-h-11 w-full touch-manipulation items-center justify-center rounded-xl border border-white/30 px-5 py-2.5 text-center text-sm font-medium text-white transition hover:border-white focus-visible:outline-white",
  },
  msp: {
    card: "border-line-strong bg-card shadow-card bg-[radial-gradient(120%_60%_at_100%_0%,var(--color-brand-soft),transparent_60%)]",
    name: "text-ink-faint",
    tag: "bg-brand-soft text-brand-text",
    muted: "text-ink-faint",
    pitch: "text-ink-soft",
    rule: "border-line",
    check: "text-brand",
    primary: buttonClass("primary", "w-full text-center"),
    secondary: buttonClass("secondary", "w-full text-center"),
  },
};

const Cell = ({
  cell,
  sr,
}: {
  cell: ComparisonCell;
  sr: Record<"yes" | "no" | "na", string>;
}) => (
  <span role="cell" className="flex justify-center text-center">
    {cell.kind === "text" ? (
      <span className="text-ink text-xs font-medium md:text-[13px]">
        {cell.text}
      </span>
    ) : (
      <>
        {cell.kind === "yes" ? (
          <CheckIcon className="text-brand size-[18px]" />
        ) : (
          <DashIcon className="text-line-strong size-[18px]" />
        )}
        <span className="sr-only">{sr[cell.kind]}</span>
      </>
    )}
  </span>
);

export const PricingView = ({ lang }: { lang: PricingLang }) => {
  const marketplaceHref = marketplaceOfferUrl();
  const channels = { marketplace: marketplaceHref !== null };
  const c = pricingContent(lang, channels);
  const groups = comparisonGroups(lang, channels);
  const langs: { id: PricingLang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "de", label: "Deutsch" },
  ];

  /* Free starts at the sign-in entry every marketing page uses. A paid plan
   * is only offered through a channel that can complete the purchase: card
   * checkout needs Polar to be live, the Marketplace button needs both the
   * published listing and the fulfillment integration. Without either, the
   * cards point at support instead of promising a checkout that would fail.
   * The card link carries the chosen billing interval, switched by the same
   * CSS-only state as the prices. */
  const signInOk = signInEnabled();
  const startHref = signInOk ? signInPath() : "/#get-started";
  const cardHref = (interval: "month" | "year") =>
    `${signInPath()}?returnTo=${encodeURIComponent(`${UPGRADE_PATH}?interval=${interval}`)}`;
  const cardOk = signInOk && polarEnabled();

  return (
    <main
      lang={lang}
      className="group/pricing mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-6"
    >
      <section>
        <p className={`${EYEBROW} rise`}>{c.hero.eyebrow}</p>
        <h1 className="font-display rise rise-1 mt-4 max-w-[18ch] text-[clamp(2.125rem,7.5vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
          {c.hero.h1.pre}{" "}
          {/* The amber line of the brand mark, drawn through the cost. The
              meter-fill keyframes scale it in along its own rotated axis. */}
          <span
            aria-hidden="true"
            className="text-ink-faint after:bg-waste relative whitespace-nowrap after:absolute after:inset-x-[-0.06em] after:top-[54%] after:h-[0.13em] after:-rotate-[7deg] after:content-[''] motion-safe:after:animate-[meter-fill_0.7s_0.35s_cubic-bezier(0.2,0.7,0.2,1)_both]"
          >
            {c.hero.h1.struck}
          </span>{" "}
          {c.hero.h1.post}
        </h1>
        <p className="text-ink-soft rise rise-2 mt-5 max-w-2xl text-[17px] leading-relaxed">
          {c.hero.lede}
        </p>

        <div className="rise rise-2 mt-7 flex flex-wrap items-center gap-3">
          <fieldset className="border-line-strong bg-card shadow-card inline-grid grid-cols-2 rounded-[14px] border p-1">
            <legend className="sr-only">{c.billing.legend}</legend>
            <input
              type="radio"
              name="bill"
              id="bill-m"
              defaultChecked
              className="peer/m sr-only"
            />
            <label
              htmlFor="bill-m"
              className="text-ink-soft peer-checked/m:bg-ink peer-focus-visible/m:outline-brand inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center rounded-[10px] px-4 text-sm font-medium transition-colors peer-checked/m:text-white peer-focus-visible/m:outline-2 peer-focus-visible/m:outline-offset-2"
            >
              {c.billing.month}
            </label>
            <input
              type="radio"
              name="bill"
              id="bill-y"
              className="peer/y sr-only"
            />
            <label
              htmlFor="bill-y"
              className="text-ink-soft peer-checked/y:bg-ink peer-focus-visible/y:outline-brand inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors peer-checked/y:text-white peer-focus-visible/y:outline-2 peer-focus-visible/y:outline-offset-2"
            >
              {c.billing.year}
              <span className="bg-waste-soft text-waste-deep rounded-full px-1.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap">
                {c.billing.save}
              </span>
            </label>
          </fieldset>

          <div
            role="group"
            aria-label={c.toggleLabel}
            className="border-line-strong bg-card inline-flex rounded-xl border p-1"
          >
            {langs.map((l) => (
              <Link
                key={l.id}
                href={PRICING_PATHS[l.id]}
                aria-current={lang === l.id ? "page" : undefined}
                className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                  lang === l.id
                    ? "bg-brand-strong text-white"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-label={c.plansLabel}
        className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3"
      >
        {PLAN_IDS.map((id) => {
          const plan = c.plans[id];
          const style = PLAN_STYLE[id];
          const paid = id !== "free";
          return (
            <article
              key={id}
              data-plan={id}
              className={`rise flex flex-col rounded-[20px] border p-6 md:p-8 lg:p-6 ${
                id === "free" ? "rise-1 md:col-span-2 lg:col-span-1" : "rise-2"
              } ${style.card}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2
                  className={`font-mono text-xs font-medium tracking-[0.16em] uppercase ${style.name}`}
                >
                  {planName(id)}
                </h2>
                {paid && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${style.tag}`}
                  >
                    {c.trialTag}
                  </span>
                )}
              </div>

              {paid ? (
                <>
                  <p
                    data-price="month"
                    className={`tnum mt-5 flex flex-wrap items-baseline gap-2 ${SHOW_MONTHLY}`}
                  >
                    <span className="text-5xl leading-none font-semibold tracking-[-0.04em]">
                      {formatEuro(planPrice(id, "month"), lang)}
                    </span>
                    <span className={`text-[15px] ${style.muted}`}>
                      {c.per.month}
                    </span>
                  </p>
                  <p
                    data-price="year"
                    className={`tnum mt-5 flex-wrap items-baseline gap-2 ${SHOW_YEARLY_FLEX}`}
                  >
                    <span className="text-5xl leading-none font-semibold tracking-[-0.04em]">
                      {formatEuro(planPrice(id, "year"), lang)}
                    </span>
                    <span className={`text-[15px] ${style.muted}`}>
                      {c.per.year}
                    </span>
                  </p>
                  <p
                    className={`mt-2 text-[13px] lg:min-h-[2.8rem] ${style.muted} ${SHOW_MONTHLY}`}
                  >
                    {plan.note.month}
                  </p>
                  <p
                    className={`mt-2 text-[13px] lg:min-h-[2.8rem] ${style.muted} ${SHOW_YEARLY_BLOCK}`}
                  >
                    {plan.note.year}
                  </p>
                </>
              ) : (
                <>
                  <p className="tnum mt-5 flex flex-wrap items-baseline gap-2">
                    <span className="text-5xl leading-none font-semibold tracking-[-0.04em]">
                      {formatEuro(0, lang)}
                    </span>
                    <span className={`text-[15px] ${style.muted}`}>
                      {c.per.free}
                    </span>
                  </p>
                  <p
                    className={`mt-2 text-[13px] lg:min-h-[2.8rem] ${style.muted}`}
                  >
                    {plan.note.month}
                  </p>
                </>
              )}

              <p
                className={`mt-4 text-[15px] lg:min-h-[6.4rem] ${style.pitch}`}
              >
                {plan.pitch}
              </p>

              <div className="mt-5 flex flex-col gap-2.5">
                {paid ? (
                  <>
                    {marketplaceHref && (
                      <a href={marketplaceHref} className={style.primary}>
                        {c.cta.marketplace}
                      </a>
                    )}
                    {cardOk && (
                      <>
                        <a
                          href={cardHref("month")}
                          className={`${marketplaceHref ? style.secondary : style.primary} ${SHOW_MONTHLY}`}
                        >
                          {c.cta.card}
                        </a>
                        <a
                          href={cardHref("year")}
                          className={`${marketplaceHref ? style.secondary : style.primary} ${SHOW_YEARLY_INLINE_FLEX}`}
                        >
                          {c.cta.card}
                        </a>
                      </>
                    )}
                    {!marketplaceHref && !cardOk && (
                      <a href={SUPPORT_MAILTO} className={style.primary}>
                        {c.cta.talk}
                      </a>
                    )}
                  </>
                ) : (
                  <a href={startHref} className={style.primary}>
                    {c.cta.free}
                  </a>
                )}
              </div>

              <div className={`mt-6 border-t pt-5 ${style.rule}`}>
                <h3
                  className={`text-xs font-medium tracking-[0.14em] uppercase ${style.muted}`}
                >
                  {plan.includedTitle}
                </h3>
                <ul className="mt-3.5 grid gap-3">
                  {plan.items.map((item) => (
                    <li
                      key={item.text}
                      className={`grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug ${
                        item.off ? style.muted : ""
                      }`}
                    >
                      {item.off ? (
                        <DashIcon className="text-line-strong mt-0.5 size-[18px]" />
                      ) : (
                        <CheckIcon
                          className={`mt-0.5 size-[18px] ${style.check}`}
                        />
                      )}
                      <span>
                        {item.text}
                        {item.detail && (
                          <small
                            className={`mt-0.5 block text-[13px] ${style.muted}`}
                          >
                            {item.detail}
                          </small>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan.soon && (
                <div
                  data-soon
                  className={`mt-5 border-t border-dashed pt-5 ${style.rule}`}
                >
                  <h3
                    className={`text-xs font-medium tracking-[0.14em] uppercase ${style.muted}`}
                  >
                    {c.soonTitle}
                  </h3>
                  <ul className="mt-3.5 grid gap-3">
                    {plan.soon.map((text) => (
                      <li
                        key={text}
                        className={`grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug ${style.muted}`}
                      >
                        <span
                          aria-hidden="true"
                          className="border-line-strong mt-1.5 ml-1 size-2.5 rounded-full border-2"
                        />
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* "Two ways to buy" only while there are two. */}
      {c.buy.options.length > 1 && (
        <section id="buy" className="scroll-mt-24 pt-14 md:pt-20">
          <p className={EYEBROW}>{c.buy.eyebrow}</p>
          <h2 className={SECTION_H2}>{c.buy.h2}</h2>
          <p className="text-ink-soft mt-3 max-w-2xl">{c.buy.sub}</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {c.buy.options.map((option) => (
              <div
                key={option.title}
                className="border-line bg-card shadow-card rounded-2xl border p-5"
              >
                <p className="text-ink-faint font-mono text-[11px] tracking-[0.14em] uppercase">
                  {option.kicker}
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight">
                  {option.title}
                </h3>
                <p className="text-ink-soft mt-2 text-[15px]">{option.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="compare" className="scroll-mt-24 pt-14 md:pt-20">
        <p className={EYEBROW}>{c.compare.eyebrow}</p>
        <h2 className={SECTION_H2}>{c.compare.h2}</h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{c.compare.sub}</p>

        {/* Below md the feature label takes its own line and the three plan
            cells sit under the sticky column headers, so long labels never
            squeeze into a sliver at 320px. */}
        <div
          role="table"
          aria-label={c.compare.tableLabel}
          className="border-line bg-card shadow-card mt-6 overflow-clip rounded-2xl border"
        >
          <div
            role="row"
            className="border-line text-ink-faint sticky top-0 z-[2] grid min-h-11 grid-cols-3 items-center gap-x-1 border-b bg-white/95 px-4 font-mono text-[11px] tracking-[0.14em] uppercase backdrop-blur md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] md:px-6"
          >
            <span role="columnheader" className="max-md:sr-only">
              {c.compare.featureHeader}
            </span>
            {PLAN_IDS.map((id) => (
              <span
                key={id}
                role="columnheader"
                className={`text-center ${id === "free" ? "" : "text-brand-text font-medium"}`}
              >
                {planName(id)}
              </span>
            ))}
          </div>

          {groups.map((group) => (
            <div
              key={group.id}
              role="rowgroup"
              data-group={group.id}
              className="border-line border-b last:border-b-0"
            >
              <div
                role="row"
                className={`border-line border-b px-4 py-2.5 text-xs font-medium tracking-[0.14em] uppercase md:px-6 ${
                  group.soon
                    ? "bg-waste-soft text-waste-deep"
                    : "bg-subtle text-ink-soft"
                }`}
              >
                <span role="cell">{group.label}</span>
              </div>
              {group.rows.map((row) => (
                <div
                  key={row.id}
                  role="row"
                  data-row={row.id}
                  className={`border-line grid min-h-[3.25rem] grid-cols-3 items-center gap-x-1 gap-y-2 border-b px-4 py-2.5 text-[15px] leading-snug last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] md:px-6 ${
                    group.soon ? "text-ink-soft" : ""
                  }`}
                >
                  <span role="cell" className="col-span-3 md:col-span-1">
                    {row.label}
                  </span>
                  {row.cells.map((cell, i) => (
                    <Cell key={PLAN_IDS[i]} cell={cell} sr={c.compare.sr} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="commitments" className="scroll-mt-24 pt-14 md:pt-20">
        <p className={EYEBROW}>{c.facts.eyebrow}</p>
        <h2 className={SECTION_H2}>{c.facts.h2}</h2>
        <p className="text-ink-soft mt-3 max-w-2xl">
          <Rich parts={c.facts.sub} />
        </p>
        <dl className="tnum mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {c.facts.items.map((item) => (
            <div
              key={item.label}
              className="border-line bg-card rounded-2xl border p-4 sm:p-[18px]"
            >
              <dt className="text-ink-faint text-xs tracking-[0.1em] uppercase">
                {item.label}
              </dt>
              <dd className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] break-words">
                {item.value}
                <small className="text-ink-soft mt-1.5 block text-[13px] leading-snug font-normal tracking-normal">
                  {item.detail}
                </small>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="faq" className="scroll-mt-24 pt-14 md:pt-20">
        <p className={EYEBROW}>{c.faq.eyebrow}</p>
        <h2 className={SECTION_H2}>{c.faq.h2}</h2>
        <div className="border-line mt-5 border-t">
          {c.faq.items.map((item) => (
            <details key={item.q} className="group/faq border-line border-b">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="border-ink-faint size-2 flex-none rotate-45 border-r-2 border-b-2 transition-transform group-open/faq:-rotate-[135deg]"
                />
              </summary>
              <p className="text-ink-soft max-w-2xl pb-[18px] text-[15px]">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <div className="bg-ink mt-14 rounded-[20px] px-6 py-8 text-white md:p-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
            {c.closing.h2}
          </h2>
          <p className="mt-3 max-w-xl text-white/70">{c.closing.body}</p>
          <div className="mt-6 grid gap-2.5 md:grid-cols-[max-content_max-content]">
            <a
              href={startHref}
              className="bg-brand-bright text-brand-deep inline-flex min-h-12 touch-manipulation items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold transition hover:bg-white"
            >
              {c.cta.free}
            </a>
            <a
              href={SUPPORT_MAILTO}
              className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-xl border border-white/30 px-5 py-3 text-[15px] font-medium text-white transition hover:border-white"
            >
              {c.cta.talk}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};
