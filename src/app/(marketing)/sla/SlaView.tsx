import Link from "next/link";

import type { DpaLang } from "~/lib/dpa";
import { SLA_CONTENT, SLA_PATH, type SlaPart } from "~/lib/sla";

/**
 * Renders the Service Level Agreement from ~/lib/sla. Each language is a real,
 * server-rendered URL (/sla and /de/sla); the toggle links between them.
 */

const linkClass =
  "text-ink hover:text-brand-text font-medium underline underline-offset-4";

const Parts = ({ parts }: { parts: SlaPart[] }) => (
  <>
    {parts.map((part, i) =>
      typeof part === "string" ? (
        <span key={i}>{part}</span>
      ) : part.href.startsWith("/") ? (
        <Link key={i} href={part.href} className={linkClass}>
          {part.text}
        </Link>
      ) : (
        <a key={i} href={part.href} className={linkClass}>
          {part.text}
        </a>
      ),
    )}
  </>
);

export const SlaView = ({ lang }: { lang: DpaLang }) => {
  const c = SLA_CONTENT[lang];
  const langs: { id: DpaLang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "de", label: "Deutsch" },
  ];

  return (
    <main lang={lang} className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        {c.eyebrow}
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        {c.title}
      </h1>
      <p className="text-ink-faint mt-3 text-xs">{c.effective}</p>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        <Parts parts={c.intro} />
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
              href={SLA_PATH[l.id]}
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

      {c.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="mt-12 scroll-mt-24"
        >
          <h2 className="font-display text-2xl tracking-tight">
            {section.title}
          </h2>
          <div className="text-ink-soft mt-4 flex flex-col gap-4 text-sm leading-relaxed">
            {section.paragraphs.map((parts, i) => (
              <p key={i}>
                <Parts parts={parts} />
              </p>
            ))}
            {section.list && (
              <ul className="border-line bg-card overflow-hidden rounded-2xl border">
                {section.list.map((item) => (
                  <li
                    key={item}
                    className="border-line border-b px-5 py-3 last:border-b-0"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {section.after && (
              <p>
                <Parts parts={section.after} />
              </p>
            )}
          </div>
        </section>
      ))}
    </main>
  );
};
