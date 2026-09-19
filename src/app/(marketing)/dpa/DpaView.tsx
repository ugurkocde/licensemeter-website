import Link from "next/link";

import { ButtonAnchor } from "~/components/ui";
import {
  annexLabel,
  DPA,
  LEGACY_ANNEX_ANCHOR,
  type DpaAnnex,
  type DpaBlock,
  type DpaDoc,
  type DpaLang,
} from "~/lib/dpa";
import type { SccBlock, SccListItem } from "~/lib/dpaClauses";

/**
 * Renders the DPA / AVV from the single source of truth in ~/lib/dpa. Each
 * language is a real, server-rendered URL (/dpa and /de/dpa); the language
 * toggle links between them so crawlers see both versions, and the download
 * button fetches the PDF matching the page language.
 *
 * The clauses are the Commission's standard contractual clauses and are
 * rendered exactly as ~/lib/dpaClauses holds them: markers, headings and
 * wording come from the data, nothing is composed here.
 */

const Blocks = ({ blocks }: { blocks: DpaBlock[] }) => (
  <div className="text-ink-soft mt-2 flex flex-col gap-2 text-sm leading-relaxed">
    {blocks.map((b, i) => {
      if (b.kind === "p") return <p key={i}>{b.text}</p>;
      if (b.kind === "ul")
        return (
          <ul key={i} className="flex flex-col gap-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden="true" className="text-moss mt-0.5">
                  ·
                </span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        );
      return <Defs key={i} items={b.items} />;
    })}
  </div>
);

const Defs = ({ items }: { items: { term: string; def: string }[] }) => (
  <dl className="border-line bg-card mt-1 border">
    {items.map((it, j) => (
      <div
        key={j}
        className="border-line flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:gap-6"
      >
        <dt className="text-ink shrink-0 font-medium sm:w-48">{it.term}</dt>
        <dd>{it.def}</dd>
      </div>
    ))}
  </dl>
);

/** Lettered and numbered points with the markers the Clauses publish. */
const ClauseItems = ({ items }: { items: SccListItem[] }) => (
  <ol className="flex flex-col gap-2">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3">
        <span className="text-ink w-7 shrink-0">{it.marker}</span>
        <div className="flex min-w-0 flex-col gap-2">
          {it.paragraphs.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
          {it.items && <ClauseItems items={it.items} />}
        </div>
      </li>
    ))}
  </ol>
);

const ClauseBlocks = ({ blocks }: { blocks: SccBlock[] }) => (
  <div className="text-ink-soft mt-2 flex flex-col gap-2 text-sm leading-relaxed">
    {blocks.map((b, i) =>
      b.kind === "p" ? (
        <p key={i}>{b.text}</p>
      ) : (
        <ClauseItems key={i} items={b.items} />
      ),
    )}
  </div>
);

const Clauses = ({ doc }: { doc: DpaDoc }) => (
  <section id="clauses" className="mt-10 scroll-mt-24">
    <h2 className="font-display text-2xl tracking-tight">{doc.clausesTitle}</h2>
    {doc.sections.map((sec) => (
      <div key={sec.id} className="mt-8">
        <h3 className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase">
          {sec.label}
          {sec.title ? `: ${sec.title}` : ""}
        </h3>
        {doc.clauses
          .filter((c) => c.section === sec.id)
          .map((c) => (
            <article
              key={c.number}
              id={`clause-${c.number}`}
              className="mt-6 scroll-mt-24"
            >
              <h4 className="text-ink font-medium">
                {c.label}: {c.heading}
              </h4>
              {c.blocks.length > 0 && <ClauseBlocks blocks={c.blocks} />}
              {c.parts.map((part) => (
                <div key={part.number} className="mt-4">
                  <h5 className="text-ink text-sm font-medium">
                    {part.number} {part.heading}
                  </h5>
                  <ClauseBlocks blocks={part.blocks} />
                </div>
              ))}
            </article>
          ))}
      </div>
    ))}
  </section>
);

const Annex = ({ annex, lang }: { annex: DpaAnnex; lang: DpaLang }) => {
  const { toms, subprocessors: sub, parties } = annex;
  const legacy = LEGACY_ANNEX_ANCHOR[annex.id];
  return (
    <section
      id={`annex-${annex.id.toLowerCase()}`}
      className="mt-10 scroll-mt-24"
    >
      {/* Older links point at the pre-2.0 annex numbers. */}
      {legacy && <span id={legacy} className="block scroll-mt-24" />}
      <h2 className="font-display text-2xl tracking-tight">
        {annexLabel(lang, annex.id)}: {annex.title}
      </h2>
      {annex.intro && <Blocks blocks={annex.intro} />}

      {parties?.map((p) => (
        <div
          key={p.heading}
          className="text-ink-soft mt-4 text-sm leading-relaxed"
        >
          <h3 className="text-ink text-sm font-medium">{p.heading}</h3>
          <Defs items={p.fields} />
        </div>
      ))}

      {annex.body && <Blocks blocks={annex.body} />}

      {toms && (
        <div className="mt-4 flex flex-col gap-5">
          {toms.map((g) => (
            <div key={g.title}>
              <h3 className="text-ink text-sm font-medium">{g.title}</h3>
              <ul className="text-ink-soft mt-2 flex flex-col gap-1.5 text-sm leading-relaxed">
                {g.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span aria-hidden="true" className="text-moss mt-0.5">
                      ·
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {sub && (
        <>
          <ul className="border-line bg-card mt-4 border">
            {sub.rows.map((r) => (
              <li
                key={r.name}
                className="border-line border-b px-4 py-3 text-sm last:border-b-0"
              >
                <p className="text-ink font-medium">{r.name}</p>
                <dl className="text-ink-soft mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
                  <dt className="text-ink-faint text-xs tracking-wide uppercase">
                    {sub.headers.purpose}
                  </dt>
                  <dd>{r.purpose}</dd>
                  <dt className="text-ink-faint text-xs tracking-wide uppercase">
                    {sub.headers.location}
                  </dt>
                  <dd>{r.location}</dd>
                  <dt className="text-ink-faint text-xs tracking-wide uppercase">
                    {sub.headers.basis}
                  </dt>
                  <dd>{r.basis}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <Blocks blocks={sub.note} />
        </>
      )}

      {annex.outro && <Blocks blocks={annex.outro} />}
    </section>
  );
};

const SignParty = ({ label, lines }: { label: string; lines: string[] }) => (
  <div className="border-line bg-card border p-4">
    <p className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase">
      {label}
    </p>
    <div className="text-ink-soft mt-3 flex flex-col gap-1.5 text-sm leading-relaxed">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  </div>
);

const Doc = ({ doc, lang }: { doc: DpaDoc; lang: DpaLang }) => (
  <>
    {/* Our framing; not part of the Clauses */}
    <section className="mt-10">
      <h2 className="font-display text-2xl tracking-tight">
        {doc.preamble.title}
      </h2>
      <Blocks blocks={doc.preamble.body} />
    </section>

    <Clauses doc={doc} />

    {doc.annexes.map((a) => (
      <Annex key={a.id} annex={a} lang={lang} />
    ))}

    {/* Signatures */}
    <section className="mt-10">
      <h2 className="font-display text-2xl tracking-tight">
        {doc.signature.title}
      </h2>
      <p className="text-ink-soft mt-2 text-sm leading-relaxed">
        {doc.signature.intro}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SignParty
          label={doc.signature.processor.label}
          lines={doc.signature.processor.lines}
        />
        <SignParty
          label={doc.signature.controller.label}
          lines={doc.signature.controller.lines}
        />
      </div>
    </section>
  </>
);

export const DpaView = ({ lang }: { lang: DpaLang }) => {
  const doc = DPA[lang];
  const langs: { id: DpaLang; label: string; href: string }[] = [
    { id: "en", label: "English", href: "/dpa" },
    { id: "de", label: "Deutsch", href: "/de/dpa" },
  ];

  return (
    <main lang={lang} className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        {doc.ui.eyebrow}
      </p>
      <h1 className="font-display mt-4 text-3xl tracking-tight text-balance break-words hyphens-auto sm:text-4xl">
        {doc.ui.pageTitle}
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {doc.ui.pageIntro}
      </p>

      {/* Controls: language toggle + download */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={doc.ui.languageOf}
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
        <ButtonAnchor
          variant="primary"
          href={`/api/export/dpa?lang=${lang}`}
          download
        >
          {doc.ui.download}
        </ButtonAnchor>
        <span className="text-ink-faint text-xs">{doc.ui.metaLine}</span>
      </div>

      {/* How to execute */}
      <div className="border-line bg-subtle mt-6 rounded-2xl border p-5">
        <h2 className="text-ink text-sm font-medium">{doc.ui.howToTitle}</h2>
        <ol className="text-ink-soft mt-2 flex flex-col gap-1.5 text-sm leading-relaxed">
          {doc.ui.howToSteps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-brand-text font-medium">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Annex jump links */}
      <nav
        aria-label={doc.ui.annexNav}
        className="text-ink-soft mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm"
      >
        {doc.annexes.map((a) => (
          <a
            key={a.id}
            href={`#annex-${a.id.toLowerCase()}`}
            className="hover:text-ink underline underline-offset-4"
          >
            {annexLabel(lang, a.id)}
          </a>
        ))}
      </nav>

      <Doc doc={doc} lang={lang} />
    </main>
  );
};
