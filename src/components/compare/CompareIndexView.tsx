import Link from "next/link";

import { STATUS_QUO_COMPARISONS } from "~/lib/compare";
import { HEAD_TO_HEAD, ROUNDUPS } from "~/lib/compare/registry";
import type { Lang } from "~/lib/compare/types";

import { CompareBreadcrumbs } from "./Breadcrumbs";
import { CompareCta } from "./CompareCta";
import { compareCopy, comparePath } from "./copy";
import { LangSwitch } from "./LangSwitch";

const CARD =
  "border-line hover:border-line-strong bg-card block border px-5 py-4 transition-colors";

/** /compare and /de/compare: every comparison, grouped. */
export const CompareIndexView = ({ lang }: { lang: Lang }) => {
  const t = compareCopy(lang);
  const groups = [
    {
      title: t.groupRoundups,
      items: ROUNDUPS.map((r) => ({
        href: comparePath(lang, r.slug),
        label: r.title[lang],
        body: r.description[lang],
      })),
    },
    {
      title: t.groupVendors,
      items: HEAD_TO_HEAD().map((p) => ({
        href: comparePath(lang, p.slug),
        label: `LicenseMeter ${t.vs} ${p.name}`,
        body: p.summary[lang],
      })),
    },
    {
      title: t.groupStatusQuo,
      items: STATUS_QUO_COMPARISONS.map((c) => ({
        href: `/compare/${c.slug}`,
        label: `${c.title}${t.englishOnly}`,
        body: null,
      })),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <main lang={lang} className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <div className="flex items-center justify-between gap-4">
        <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
          {t.eyebrow}
        </p>
        <LangSwitch lang={lang} />
      </div>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {t.indexTitle}
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {t.indexLead}
      </p>
      {groups.map((g) => (
        <section key={g.title} className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">{g.title}</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className={CARD}>
                  <span className="text-ink font-medium">{it.label}</span>
                  {it.body && (
                    <span className="text-ink-soft mt-1.5 line-clamp-3 text-sm leading-relaxed">
                      {it.body}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <CompareCta lang={lang} />
      <CompareBreadcrumbs lang={lang} />
    </main>
  );
};
