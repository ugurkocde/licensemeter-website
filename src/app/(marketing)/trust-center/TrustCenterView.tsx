import Link from "next/link";

import { Pill } from "~/components/ui";
import { type DpaLang, subprocessorRows } from "~/lib/dpa";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "~/lib/support";

import { TRUST_CONTENT } from "./content";

/**
 * Renders the Trust Center from the bilingual structure in ./content and the
 * sub-processor rows from ~/lib/dpa. Each language is a real, server-rendered
 * URL (/trust-center and /de/trust-center); the language toggle links between
 * them so crawlers see both versions.
 */

/**
 * EU vs US emphasis for the residency table. A row counts as US-touching when
 * the ENGLISH location names the US in any form, so the pill is stable across
 * languages (German uses "USA"/"Rückfallebene"); the localized row is what we
 * display.
 */
const EN_ROWS = subprocessorRows("en");
const isUsTouching = (location: string) =>
  /\bUS\b|United States|fallback/i.test(location);

const Section = ({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="mt-12 scroll-mt-24">
    <h2 className="font-display text-2xl tracking-tight">{title}</h2>
    <div className="text-ink-soft mt-4 text-sm leading-relaxed">{children}</div>
  </section>
);

export const TrustCenterView = ({ lang }: { lang: DpaLang }) => {
  const c = TRUST_CONTENT[lang];
  const rows = subprocessorRows(lang);
  const langs: { id: DpaLang; label: string; href: string }[] = [
    { id: "en", label: "English", href: "/trust-center" },
    { id: "de", label: "Deutsch", href: "/de/trust-center" },
  ];

  return (
    <main lang={lang} className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        {c.eyebrow}
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {c.h1}
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {c.intro}
      </p>

      <div className="mt-6">
        <div
          role="group"
          aria-label={c.toggleLabel}
          className="border-line-strong bg-card inline-flex rounded-xl border p-1"
        >
          {langs.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              aria-current={lang === l.id ? "page" : undefined}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
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

      <Section title={c.atAGlance.title}>
        <div className="border-line bg-line mt-2 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
          {c.atAGlance.items.map((item) => (
            <div key={item.label} className="bg-card px-5 py-4">
              <p className="text-ink font-medium">{item.label}</p>
              <p className="text-ink-soft mt-1 text-xs leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="subprocessors" title={c.where.title}>
        <p>{c.where.intro}</p>
        <div className="border-line bg-card mt-5 overflow-hidden rounded-2xl border">
          {rows.map((sp, i) => {
            const us = isUsTouching(EN_ROWS[i]?.location ?? sp.location);
            return (
              <div
                key={sp.name}
                className="border-line border-b px-5 py-4 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-ink font-medium">{sp.name}</span>
                  <Pill tone={us ? "gold" : "good"}>
                    {us ? c.where.usLabel : c.where.euLabel}
                  </Pill>
                </div>
                <p className="text-ink-soft mt-1.5 text-xs leading-relaxed">
                  {sp.purpose}
                </p>
                <dl className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:gap-6">
                  <div className="flex gap-1.5">
                    <dt className="text-ink-faint">{c.where.locationLabel}:</dt>
                    <dd className="text-ink-soft">{sp.location}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-faint">{c.where.transferLabel}:</dt>
                    <dd className="text-ink-soft">{sp.basis}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
        <p className="text-ink-faint mt-3 text-xs">
          {c.where.note.pre}
          <strong>{c.where.note.bold}</strong>
          {c.where.note.mid}
          <Link
            href={c.where.note.href}
            className="hover:text-ink underline underline-offset-4"
          >
            {c.where.note.linkText}
          </Link>
          {c.where.note.post}
        </p>
      </Section>

      <Section title={c.access.title}>
        <p>{c.access.body}</p>
        <p className="mt-4">
          {c.access.linked.pre}
          <Link
            href={c.access.linked.href}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.access.linked.linkText}
          </Link>
          {c.access.linked.post}
        </p>
      </Section>

      <Section title={c.security.title}>
        <p>{c.security.body}</p>
        <p className="mt-4">
          {c.security.linked.pre}
          <Link
            href={c.security.linked.href}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.security.linked.linkText}
          </Link>
          {c.security.linked.post}
        </p>
      </Section>

      <Section title={c.lifecycle.title}>
        <p>
          {c.lifecycle.linked.pre}
          <Link
            href={c.lifecycle.linked.href}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {c.lifecycle.linked.linkText}
          </Link>
          {c.lifecycle.linked.post}
        </p>
      </Section>

      <Section title={c.certs.title}>
        <p>{c.certs.body1}</p>
        <p className="mt-4">{c.certs.body2}</p>
      </Section>

      <Section title={c.documents.title}>
        <div className="border-line bg-line mt-2 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
          {c.documents.items.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="bg-card hover:bg-subtle group px-5 py-4 transition"
            >
              <p className="text-ink font-medium underline-offset-4 group-hover:underline">
                {doc.label}
              </p>
              <p className="text-ink-soft mt-1 text-xs leading-relaxed">
                {doc.detail}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      <Section title={c.questions.title}>
        <p>
          {c.questions.body}
          <a
            href={SUPPORT_MAILTO}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </main>
  );
};
