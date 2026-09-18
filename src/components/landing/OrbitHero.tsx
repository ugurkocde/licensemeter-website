import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck, UsersRound } from "lucide-react";
import {
  ConnectorLogo,
  CONNECTOR_BRANDS,
  type ConnectorBrand,
} from "~/components/ConnectorLogo";
import { SignInButtons } from "~/components/SignInButtons";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { OrbitMotion } from "./OrbitMotion";

const ORBIT_BRANDS: ConnectorBrand[] = [
  "microsoft",
  "openai",
  "adobe",
  "claude",
  "zoom",
  "atlassian",
  "salesforce",
  "anthropic",
];

export function OrbitHero({
  signInEnabled,
  signInHref,
  demoEnabled,
}: {
  signInEnabled: boolean;
  signInHref: string;
  demoEnabled: boolean;
}) {
  return (
    <section
      id="get-started"
      className="orbit-hero"
      aria-labelledby="hero-heading"
    >
      <OrbitMotion>
        {[1, 2, 3, 4, 5].map((ring) => (
          <div key={ring} className={`orbit-ring orbit-ring-${ring}`} />
        ))}
        {ORBIT_BRANDS.map((brand, index) => (
          <div key={brand} className={`orbit-logo orbit-logo-${index + 1}`}>
            <ConnectorLogo brand={brand} size={32} />
          </div>
        ))}
      </OrbitMotion>

      <div className="orbit-copy relative z-10 mx-auto max-w-3xl px-5 text-center">
        <div className="rise rise-1 text-ink-soft inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-good size-1.5 rounded-full" />
            Free to use
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck
              className="text-brand-text size-4"
              aria-hidden="true"
            />
            Read-only by design
          </span>
        </div>
        <h1
          id="hero-heading"
          className="font-display rise rise-2 mt-6 text-[2.65rem] leading-[1.07] font-semibold tracking-[-0.055em] text-balance sm:text-6xl lg:text-[4.4rem]"
        >
          Stop paying for
          <br className="hidden sm:block" /> licenses nobody uses.
        </h1>
        <p className="rise rise-3 text-ink-soft mx-auto mt-6 max-w-[34rem] text-base leading-relaxed sm:text-lg">
          Bring Microsoft 365, your SaaS seats and AI spend into one clear view.
          Find what&apos;s unused. Keep the savings.
        </p>
        <div className="rise rise-4 mt-8">
          <SignInButtons
            signInEnabled={signInEnabled}
            signInHref={signInHref}
            demoEnabled={demoEnabled}
            primaryLabel="Run my free scan"
            showNote={false}
            centered
            primaryVariant="ink"
          />
          <p className="text-ink-faint mt-4 text-xs">
            No credit card. No time limit. Your data stays yours.
          </p>
        </div>

        <div
          className="sample-stack rise rise-5 mx-auto mt-12 text-left"
          id="sample-tenant"
          role="group"
          aria-label="Illustrative findings from the sample tenant"
        >
          <div className="sample-glow" aria-hidden="true" />
          <div className="sample-finding sample-finding-back">
            <span className="bg-subtle inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
              <ConnectorLogo brand="microsoft" size={21} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Unassigned paid seats</p>
              <p className="text-ink-faint mt-1 text-xs">
                € {demoEuros(DEMO_FIGURES.byCategory.shelfware)} / month
              </p>
            </div>
            <Check
              className="text-brand-text ml-auto size-4 shrink-0"
              aria-hidden="true"
            />
          </div>
          <div className="sample-finding sample-finding-middle">
            <span className="bg-subtle inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
              <ConnectorLogo brand="adobe" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Inactive seats, across your apps
              </p>
              <p className="text-ink-faint mt-1 text-xs">
                € {demoEuros(DEMO_FIGURES.byCategory.idle)} / month
              </p>
            </div>
          </div>
          <div className="sample-finding sample-finding-front">
            <span className="bg-brand-soft text-brand-text inline-flex size-11 shrink-0 items-center justify-center rounded-xl">
              <UsersRound className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium sm:text-sm">
                They left. Their licenses didn&apos;t.
              </p>
              <p className="text-ink-faint mt-1 text-xs">
                {DEMO_FIGURES.leaverCount} former employees still hold paid
                seats
              </p>
            </div>
            <span className="bg-good-soft text-good-text hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex">
              Waste found
            </span>
          </div>
        </div>
        <Link
          href="/sample-report"
          className="text-ink-faint hover:text-ink relative z-10 inline-flex min-h-11 items-center justify-center gap-1.5 text-xs underline-offset-4 hover:underline"
        >
          Sample data. See the full report{" "}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="relative z-10 mx-auto mt-12 max-w-6xl px-5 pb-14 sm:mt-16 lg:mt-14">
        <p className="text-ink-faint text-center text-xs sm:text-sm">
          Built for the tools your team already uses
        </p>
        <ul className="mx-auto mt-7 grid max-w-xl grid-cols-3 gap-x-4 gap-y-6 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-8 lg:gap-x-7">
          {CONNECTOR_BRANDS.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/connectors/${brand.id}`}
                className="text-ink-soft hover:text-ink flex min-h-11 items-center justify-center gap-2.5 text-[11px] font-medium transition-colors sm:text-sm"
              >
                <ConnectorLogo brand={brand.id} size={23} />
                <span>{brand.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
