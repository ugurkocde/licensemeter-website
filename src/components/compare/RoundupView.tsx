import Link from "next/link";

import {
  product as productBySlug,
  roundupSourcePath,
} from "~/lib/compare/registry";
import type { Lang, Product, Roundup } from "~/lib/compare/types";

import { CompareBreadcrumbs } from "./Breadcrumbs";
import { CompareCta } from "./CompareCta";
import { compareCopy, comparePath, formatCheckedOn } from "./copy";
import { CorrectionNote } from "./CorrectionNote";
import { FeatureMatrix } from "./FeatureMatrix";
import { LangSwitch } from "./LangSwitch";

const LINK =
  "text-ink hover:text-brand-text text-sm font-medium underline underline-offset-4";

/** Where a reader goes for the detailed comparison with LicenseMeter. */
const comparisonHref = (p: Product, lang: Lang): string | null => {
  if (p.comparePath) return p.comparePath;
  if (p.headToHead) return comparePath(lang, p.slug);
  return null;
};

/** A "best X tools" page, rendered from its roundup file. */
export const RoundupView = ({
  roundup,
  lang,
}: {
  roundup: Roundup;
  lang: Lang;
}) => {
  const t = compareCopy(lang);
  const lookup = (slug: string): Product => {
    const p = productBySlug(slug);
    if (!p) throw new Error(`roundup ${roundup.slug}: unknown product ${slug}`);
    return p;
  };
  const entries = roundup.entries.map((e) => ({ ...e, p: lookup(e.product) }));
  const subject = roundup.subject ? lookup(roundup.subject) : null;
  const subjectHref = subject ? comparisonHref(subject, lang) : null;

  return (
    <main lang={lang} className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <div className="flex items-center justify-between gap-4">
        <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
          {t.eyebrow}
        </p>
        <LangSwitch lang={lang} slug={roundup.slug} />
      </div>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {roundup.title[lang]}
      </h1>
      {roundup.intro.map((para) => (
        <p
          key={para.en}
          className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed"
        >
          {para[lang]}
        </p>
      ))}
      {subject && subjectHref && (
        <p className="mt-4">
          <Link href={subjectHref} className={LINK}>
            {t.readComparison(subject.name)}
          </Link>
        </p>
      )}
      <p className="text-ink-faint mt-4 text-xs">
        {t.updated(formatCheckedOn(roundup.updated, lang))}
      </p>

      <section className="border-line bg-card mt-10 border px-6 py-6">
        <h2 className="font-display text-xl tracking-tight">{t.howWePicked}</h2>
        <ul className="text-ink-soft mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          {roundup.criteria.map((c) => (
            <li key={c.en}>{c[lang]}</li>
          ))}
        </ul>
        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          {t.disclosure}
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">{t.atAGlance}</h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          {t.featuresNote}
        </p>
        <FeatureMatrix
          products={[...(subject ? [subject] : []), ...entries.map((e) => e.p)]}
          keys={roundup.featureKeys}
          lang={lang}
        />
      </section>

      <ol className="mt-14 flex flex-col gap-12">
        {entries.map(({ p, bestFor, verdict }, i) => {
          const href = comparisonHref(p, lang);
          return (
            <li key={p.slug} id={p.slug} className="scroll-mt-24">
              <h2 className="font-display text-2xl tracking-tight">
                {i + 1}. {p.name}
              </h2>
              <p className="text-ink mt-2 text-sm">
                <span className="font-medium">{t.bestFor}:</span>{" "}
                {bestFor[lang]}
              </p>
              <p className="text-ink-soft mt-3 max-w-3xl leading-relaxed">
                {p.summary[lang]}
              </p>
              <p className="text-ink-soft mt-3 max-w-3xl leading-relaxed">
                {verdict[lang]}
              </p>
              {p.strengths.length > 0 && (
                <ul className="text-ink-soft mt-3 flex max-w-3xl list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
                  {p.strengths.map((s) => (
                    <li key={s.en}>{s[lang]}</li>
                  ))}
                </ul>
              )}
              <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
                <span className="text-ink font-medium">{t.pricing}:</span>{" "}
                {p.pricing[lang]}
              </p>
              {p.repo && (
                <p className="text-ink-soft mt-2 text-sm">
                  <span className="text-ink font-medium">{t.license}:</span>{" "}
                  {p.repo.license}
                  {p.repo.lastActivity && (
                    <>
                      {" · "}
                      <span className="text-ink font-medium">
                        {t.lastActivity}:
                      </span>{" "}
                      {p.repo.lastActivity}
                    </>
                  )}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <a href={p.url} rel="nofollow noopener" className={LINK}>
                  {t.website}
                </a>
                {p.repo && (
                  <a href={p.repo.url} rel="nofollow noopener" className={LINK}>
                    {t.sourceCode}
                  </a>
                )}
                {href && (
                  <Link href={href} className={LINK}>
                    {t.readComparison(p.name)}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <CorrectionNote repoPath={roundupSourcePath(roundup.slug)} lang={lang} />
      <CompareCta lang={lang} />
      <CompareBreadcrumbs
        lang={lang}
        name={roundup.title[lang]}
        slug={roundup.slug}
      />
    </main>
  );
};
