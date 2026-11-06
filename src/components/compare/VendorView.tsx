import { CORE_FEATURE_KEYS } from "~/lib/compare/features";
import { licensemeter } from "~/lib/compare/products/licensemeter";
import { productSourcePath } from "~/lib/compare/registry";
import type { Lang, Localized, Product } from "~/lib/compare/types";

import { CompareBreadcrumbs } from "./Breadcrumbs";
import { CompareCta } from "./CompareCta";
import { compareCopy, formatCheckedOn } from "./copy";
import { CorrectionNote } from "./CorrectionNote";
import { FeatureMatrix } from "./FeatureMatrix";
import { LangSwitch } from "./LangSwitch";

const H2 = "font-display text-2xl tracking-tight";

const Bullets = ({
  items,
  lang,
}: {
  items: readonly Localized[];
  lang: Lang;
}) => (
  <ul className="text-ink-soft mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
    {items.map((item) => (
      <li key={item.en}>{item[lang]}</li>
    ))}
  </ul>
);

/** Head-to-head page: LicenseMeter vs one product, rendered from its file. */
export const VendorView = ({
  product,
  lang,
}: {
  product: Product;
  lang: Lang;
}) => {
  const t = compareCopy(lang);
  const title = `LicenseMeter ${t.vs} ${product.name}`;
  return (
    <main lang={lang} className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <div className="flex items-center justify-between gap-4">
        <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
          {t.eyebrow}
        </p>
        <LangSwitch lang={lang} slug={product.slug} />
      </div>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {title}
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {product.summary[lang]}
      </p>
      <p className="text-ink-soft mt-4 max-w-2xl leading-relaxed">
        <span className="text-ink font-medium">LicenseMeter:</span>{" "}
        {licensemeter.summary[lang]}
      </p>

      <section className="mt-14">
        <h2 className={H2}>{t.shortAnswer}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="border-line border px-6 py-6">
            <h3 className="font-display text-xl tracking-tight">
              {t.pickThem(product.name)}
            </h3>
            <Bullets items={product.pickThemIf} lang={lang} />
          </div>
          <div className="border-line bg-card border px-6 py-6">
            <h3 className="font-display text-xl tracking-tight">{t.pickUs}</h3>
            <Bullets items={product.pickUsIf} lang={lang} />
          </div>
        </div>
      </section>

      {product.strengths.length > 0 && (
        <section className="mt-14">
          <h2 className={H2}>{t.strengths(product.name)}</h2>
          <Bullets items={product.strengths} lang={lang} />
        </section>
      )}

      <section className="mt-14">
        <h2 className={H2}>{t.featuresTitle}</h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          {t.featuresNote}
        </p>
        <FeatureMatrix
          products={[product, licensemeter]}
          keys={CORE_FEATURE_KEYS}
          lang={lang}
          notes
        />
      </section>

      <section className="mt-14">
        <h2 className={H2}>{t.pricingTitle}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {[product, licensemeter].map((p) => (
            <div key={p.slug}>
              <h3 className="text-ink font-medium">{p.name}</h3>
              <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                {p.pricing[lang]}
              </p>
            </div>
          ))}
        </div>
        <p className="text-ink-faint mt-8 text-xs">
          {t.checked(product.name, formatCheckedOn(product.checkedOn, lang))}
        </p>
      </section>

      <CorrectionNote repoPath={productSourcePath(product.slug)} lang={lang} />
      <CompareCta lang={lang} />
      <CompareBreadcrumbs lang={lang} name={title} slug={product.slug} />
    </main>
  );
};
