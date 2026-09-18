import { BrandHomeLink } from "~/components/BrandHomeLink";
import { BrandMark } from "~/components/BrandMark";
import { ChangelogBell } from "~/components/changelog/ChangelogBell";
import { HeaderAuthCta } from "~/components/HeaderAuthCta";
import { MarketingFooter } from "~/components/MarketingFooter";
import { MarketingLanguageSync } from "~/components/MarketingLanguageSync";
import { MarketingNav } from "~/components/MarketingNav";
import { siteUrl } from "~/env";

/*
 * No request-time reads here (cookies, headers): session and route-locale
 * behavior is resolved client-side so marketing pages remain statically
 * rendered and CDN-cacheable.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-canvas-deep min-h-screen px-2 py-3 sm:p-5 lg:p-7">
      <div className="marketing-frame relative mx-auto max-w-[1600px] rounded-[24px] border border-white bg-white sm:rounded-[32px]">
        <MarketingLanguageSync />
        <a
          href="#content"
          className="focus:border-ink focus:bg-canvas focus:text-ink sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <header className="marketing-header border-line relative z-30 mx-3 mt-3 flex max-w-6xl flex-nowrap items-center justify-between gap-x-2 rounded-2xl border bg-white/95 px-3 py-3 shadow-[0_3px_14px_-8px_rgba(20,30,40,0.2)] min-[360px]:px-4 sm:mx-6 sm:mt-5 sm:gap-x-6 sm:px-6 sm:py-4 xl:mx-auto">
          <BrandHomeLink
            homeUrl={siteUrl()}
            className="font-display flex shrink-0 items-center gap-2 text-base tracking-tight min-[360px]:gap-2.5 min-[360px]:text-lg sm:text-xl"
          >
            <BrandMark size={22} />
            <span>
              License<span className="text-brand-text">Meter</span>
            </span>
          </BrandHomeLink>
          <div className="flex shrink-0 items-center gap-1 min-[360px]:gap-1.5 sm:gap-5">
            <MarketingNav />
            <ChangelogBell className="-mx-3 min-[360px]:-mx-2.5 sm:mr-0 sm:-ml-2" />
            <HeaderAuthCta />
          </div>
        </header>

        <div id="content">{children}</div>
        <MarketingFooter year={new Date().getFullYear()} />
      </div>
    </div>
  );
}
