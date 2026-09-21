import Link from "next/link";
import { Check } from "lucide-react";

import { buttonClass } from "~/components/ui";
import {
  MSP_EXTRA_TENANT_PRICE,
  MSP_INCLUDED_TENANTS,
  PLAN_PRICES,
  TRIAL_DAYS,
} from "~/lib/pricing";
import { formatEuro } from "~/lib/pricingContent";

import { Reveal } from "./Reveal";

/**
 * The landing page's plan overview. It reads its figures from ~/lib/pricing,
 * the same source as /pricing and the portal, so a price change can never
 * leave the homepage quoting an old number. The section is deliberately a
 * teaser: the full comparison table, the billing toggle and the purchase
 * channels stay on /pricing.
 */
type TeaserPlan = {
  id: "free" | "pro" | "msp";
  name: string;
  price: string;
  period: string;
  pitch: string;
  points: string[];
  featured: boolean;
};

const PLANS: TeaserPlan[] = [
  {
    id: "free",
    name: "Free",
    price: formatEuro(0, "en"),
    period: "forever",
    pitch:
      "The full product, for one tenant or many, for as long as you need it.",
    points: [
      "Read-only scan of Microsoft 365 and connected SaaS",
      "Every finding priced in euros per month",
      "PDF report, CSV export and PowerShell scripts",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: formatEuro(PLAN_PRICES.pro.month, "en"),
    period: "per month",
    pitch: "For teams that want someone accountable behind the numbers.",
    points: [
      "Everything in Free, plus email support",
      "Signed DPA (AVV) and a 99.9% uptime target",
      "MCP server and 24 months of history",
    ],
    featured: true,
  },
  {
    id: "msp",
    name: "MSP",
    price: formatEuro(PLAN_PRICES.msp.month, "en"),
    period: "per month",
    pitch:
      "For providers running license optimisation across a client portfolio.",
    points: [
      "Everything in Pro, across your client tenants",
      `${MSP_INCLUDED_TENANTS} client tenants included, then ${formatEuro(MSP_EXTRA_TENANT_PRICE.month, "en")} each`,
      "White-label PDF reports and an onboarding call",
    ],
    featured: false,
  },
];

export const PricingTeaser = ({
  signInEnabled,
  signInHref,
}: {
  signInEnabled: boolean;
  signInHref: string;
}) => {
  const startHref = signInEnabled ? signInHref : "/#get-started";
  return (
    <section
      id="plans"
      className="bg-canvas border-line border-t px-6 py-20 lg:py-24"
      aria-labelledby="plans-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
            Plans
          </p>
          <h2
            id="plans-heading"
            className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl"
          >
            Free where it counts.
            <br className="hidden sm:block" /> Paid where it helps.
          </h2>
          <p className="text-ink-soft mt-4 text-base leading-relaxed">
            Every scan, finding and report stays free. Pro and MSP add support,
            a signed data processing agreement and the tooling larger estates
            need. Nothing you rely on today moves behind a paywall.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 80} className="h-full">
              <article
                data-plan={plan.id}
                className={`flex h-full flex-col rounded-2xl border p-6 ${
                  plan.featured
                    ? "border-brand-deep bg-brand-deep shadow-hero text-white"
                    : "border-line bg-card shadow-card"
                }`}
              >
                <h3
                  className={`font-mono text-xs font-medium tracking-[0.16em] uppercase ${
                    plan.featured ? "text-brand-bright" : "text-ink-faint"
                  }`}
                >
                  {plan.name}
                </h3>
                <p className="tnum mt-5 flex flex-wrap items-baseline gap-2">
                  <span className="text-4xl leading-none font-semibold tracking-[-0.04em]">
                    {plan.price}
                  </span>
                  <span
                    className={`text-sm ${plan.featured ? "text-white/70" : "text-ink-faint"}`}
                  >
                    {plan.period}
                  </span>
                </p>
                <p
                  className={`mt-3 text-sm leading-relaxed ${plan.featured ? "text-white/80" : "text-ink-soft"}`}
                >
                  {plan.pitch}
                </p>
                <ul className="mt-5 grid gap-2.5">
                  {plan.points.map((point) => (
                    <li
                      key={point}
                      className="grid grid-cols-[16px_1fr] items-start gap-2.5 text-sm leading-snug"
                    >
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-brand-bright" : "text-brand"}`}
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  {plan.id === "free" ? (
                    <a
                      href={startHref}
                      className={buttonClass("secondary", "w-full")}
                    >
                      {signInEnabled ? "Start free" : "Request scan access"}
                    </a>
                  ) : (
                    <Link
                      href="/pricing"
                      className={
                        plan.featured
                          ? "text-brand-deep hover:bg-brand-soft inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold transition"
                          : buttonClass("secondary", "w-full")
                      }
                    >
                      See what&apos;s included
                    </Link>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="text-ink-faint mt-8 text-center text-xs leading-relaxed">
          Yearly billing saves two months. Prices exclude VAT, and the{" "}
          {TRIAL_DAYS}-day trial applies to the paid plans.{" "}
          <Link
            href="/pricing"
            className="text-ink underline underline-offset-4"
          >
            Compare every feature
          </Link>
        </p>
      </div>
    </section>
  );
};
