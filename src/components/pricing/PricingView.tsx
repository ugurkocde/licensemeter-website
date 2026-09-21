import Link from "next/link";
import { ArrowDown, Building2, ShieldCheck, Sparkles } from "lucide-react";

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
/* The display toggle for the purchase buttons has to sit on a wrapper: the
 * button class itself sets `inline-flex`, and Tailwind emits `.inline-flex`
 * after `.hidden`, so a `hidden` on the anchor would lose. A wrapper with no
 * competing display class hides reliably and restores `block` on yearly. */
const SHOW_YEARLY_BLOCK = "hidden group-has-[#bill-y:checked]/pricing:block";

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

const PLAN_ICONS = { free: ShieldCheck, pro: Sparkles, msp: Building2 };
const PLAN_BUTTON =
  "inline-flex min-h-12 w-full touch-manipulation items-center justify-center rounded-full px-5 py-3 text-center text-sm font-semibold transition-colors focus-visible:outline-blue-700";
const PLAN_STYLE: Record<
  PlanId,
  { card: string; primary: string; secondary: string }
> = {
  free: {
    card: "border-transparent bg-canvas",
    primary: `${PLAN_BUTTON} border border-line-strong bg-white text-ink hover:bg-slate-100`,
    secondary: `${PLAN_BUTTON} border border-line-strong bg-white text-ink hover:bg-slate-100`,
  },
  pro: {
    card: "border-blue-200 bg-blue-50/60 shadow-float lg:-translate-y-3",
    primary: `${PLAN_BUTTON} bg-blue-700 text-white hover:bg-blue-800`,
    secondary: `${PLAN_BUTTON} border border-blue-200 bg-white text-blue-700 hover:bg-blue-50`,
  },
  msp: {
    card: "border-transparent bg-canvas",
    primary: `${PLAN_BUTTON} bg-ink text-white hover:bg-slate-700`,
    secondary: `${PLAN_BUTTON} border border-line-strong bg-white text-ink hover:bg-slate-100`,
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
      className="group/pricing mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:pt-16"
    >
      <section aria-labelledby="pricing-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-ink-soft text-xs font-semibold tracking-[0.18em] uppercase">
            {c.hero.eyebrow}
          </p>
          <div
            role="group"
            aria-label={c.toggleLabel}
            className="bg-canvas inline-flex rounded-full p-1"
          >
            {langs.map((l) => (
              <Link
                key={l.id}
                href={PRICING_PATHS[l.id]}
                aria-current={lang === l.id ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${lang === l.id ? "text-ink shadow-card bg-white" : "text-ink-soft hover:text-ink"}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-7 grid items-end gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
          <div>
            <h1
              id="pricing-heading"
              className="font-display max-w-[19ch] text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.1] font-semibold tracking-[-0.045em] text-balance"
            >
              {c.hero.h1.pre}{" "}
              <span
                aria-hidden="true"
                className="text-ink-faint decoration-waste line-through decoration-[3px]"
              >
                {c.hero.h1.struck}
              </span>{" "}
              {c.hero.h1.post}
            </h1>
            <p className="text-ink-soft mt-5 max-w-xl text-base leading-relaxed text-pretty">
              {c.hero.lede}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end lg:pb-1">
            <fieldset className="bg-canvas inline-grid max-w-full grid-cols-2 rounded-full p-1.5">
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
                className="text-ink-soft hover:text-ink inline-flex min-h-12 cursor-pointer touch-manipulation items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors peer-checked/m:bg-blue-700 peer-checked/m:text-white peer-focus-visible/m:outline-2 peer-focus-visible/m:outline-offset-2 peer-focus-visible/m:outline-blue-700"
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
                className="text-ink-soft hover:text-ink inline-flex min-h-12 cursor-pointer touch-manipulation flex-wrap items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors peer-checked/y:bg-blue-700 peer-checked/y:text-white peer-focus-visible/y:outline-2 peer-focus-visible/y:outline-offset-2 peer-focus-visible/y:outline-blue-700"
              >
                {c.billing.year}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-blue-700">
                  {c.billing.save}
                </span>
              </label>
            </fieldset>
            <a
              href="#compare"
              className="text-ink-soft inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-colors hover:text-blue-700"
            >
              {c.compare.eyebrow}
              <ArrowDown aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section
        aria-label={c.plansLabel}
        className="mt-10 grid gap-6 lg:mt-16 lg:grid-cols-3"
      >
        {PLAN_IDS.map((id) => {
          const plan = c.plans[id];
          const style = PLAN_STYLE[id];
          const Icon = PLAN_ICONS[id];
          const paid = id !== "free";
          return (
            <article
              key={id}
              data-plan={id}
              aria-labelledby={`plan-${id}`}
              className={`relative flex min-w-0 flex-col rounded-[28px] border p-6 sm:p-8 lg:p-6 ${style.card}`}
            >
              <div className="mb-6 flex min-h-11 flex-wrap items-center justify-between gap-3">
                <span
                  className={`inline-flex size-11 items-center justify-center rounded-2xl ${id === "pro" ? "bg-blue-700 text-white" : "shadow-card bg-white text-blue-700"}`}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.75}
                  />
                </span>
                {id === "pro" && (
                  <span className="shadow-card rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700">
                    {c.recommended}
                  </span>
                )}
              </div>
              <h2
                id={`plan-${id}`}
                className="font-display text-3xl font-semibold tracking-tight"
              >
                {planName(id)}
              </h2>
              <p className="text-ink-soft mt-2 text-sm">{plan.audience}</p>
              <div className="mt-6 rounded-[20px] bg-white px-5 py-5">
                {paid ? (
                  <>
                    <p
                      data-price="month"
                      className={`tnum flex flex-wrap items-baseline gap-2 ${SHOW_MONTHLY}`}
                    >
                      <span className="text-[2.75rem] leading-none font-semibold tracking-[-0.04em]">
                        {formatEuro(planPrice(id, "month"), lang)}
                      </span>
                      <span className="text-ink-soft text-[15px]">
                        {c.per.month}
                      </span>
                    </p>
                    <p
                      data-price="year"
                      className={`tnum flex-wrap items-baseline gap-2 ${SHOW_YEARLY_FLEX}`}
                    >
                      <span className="text-[2.75rem] leading-none font-semibold tracking-[-0.04em]">
                        {formatEuro(planPrice(id, "year"), lang)}
                      </span>
                      <span className="text-ink-soft text-[15px]">
                        {c.per.year}
                      </span>
                    </p>
                    <p
                      className={`text-ink-soft mt-3 text-xs leading-relaxed lg:min-h-[3.75rem] ${SHOW_MONTHLY}`}
                    >
                      {plan.note.month}
                    </p>
                    <p
                      className={`text-ink-soft mt-3 text-xs leading-relaxed lg:min-h-[3.75rem] ${SHOW_YEARLY_BLOCK}`}
                    >
                      {plan.note.year}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="tnum flex flex-wrap items-baseline gap-2">
                      <span className="text-[2.75rem] leading-none font-semibold tracking-[-0.04em]">
                        {formatEuro(0, lang)}
                      </span>
                      <span className="text-ink-soft text-[15px]">
                        {c.per.free}
                      </span>
                    </p>
                    <p className="text-ink-soft mt-3 text-xs leading-relaxed lg:min-h-[3.75rem]">
                      {plan.note.month}
                    </p>
                  </>
                )}
              </div>
              <ul className="mt-6 grid gap-3.5">
                {plan.highlights.map((text) => (
                  <li
                    key={text}
                    className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <CheckIcon className="mt-0.5 size-[18px] text-blue-700" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                <p className="text-ink-soft mb-3 text-center text-xs">
                  {paid ? c.trialTag : c.freeTag}
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
                          <span className={`block ${SHOW_MONTHLY}`}>
                            <a
                              href={cardHref("month")}
                              className={
                                marketplaceHref
                                  ? style.secondary
                                  : style.primary
                              }
                            >
                              {c.cta.card}
                            </a>
                          </span>
                          <span className={SHOW_YEARLY_BLOCK}>
                            <a
                              href={cardHref("year")}
                              className={
                                marketplaceHref
                                  ? style.secondary
                                  : style.primary
                              }
                            >
                              {c.cta.card}
                            </a>
                          </span>
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
              </div>
              <details className="group/details border-line mt-5 border-t pt-1">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium hover:text-blue-700 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="sr-only">{planName(id)}: </span>
                    {c.planDetails}
                  </span>
                  <ArrowDown
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className="pt-3">
                  <p className="text-ink-soft mb-5 text-sm leading-relaxed">
                    {plan.pitch}
                  </p>
                  <h3 className="text-ink-soft text-xs font-medium tracking-[0.14em] uppercase">
                    {plan.includedTitle}
                  </h3>
                  <ul className="mt-3.5 grid gap-3">
                    {plan.items.map((item) => (
                      <li
                        key={item.text}
                        className={`grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug ${
                          item.off ? "text-ink-soft" : ""
                        }`}
                      >
                        {item.off ? (
                          <DashIcon className="text-line-strong mt-0.5 size-[18px]" />
                        ) : (
                          <CheckIcon className="mt-0.5 size-[18px] text-blue-700" />
                        )}
                        <span>
                          {item.text}
                          {item.detail && (
                            <small className="text-ink-soft mt-0.5 block text-[13px]">
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
                    className="border-line mt-5 border-t border-dashed pt-5"
                  >
                    <h3 className="text-ink-soft text-xs font-medium tracking-[0.14em] uppercase">
                      {c.soonTitle}
                    </h3>
                    <ul className="mt-3.5 grid gap-3">
                      {plan.soon.map((text) => (
                        <li
                          key={text}
                          className="text-ink-soft grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug"
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
              </details>
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
