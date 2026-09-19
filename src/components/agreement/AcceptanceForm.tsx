import { acceptDpaAction } from "~/app/app/(dash)/agreement/actions";
import { Button } from "~/components/ui";
import { DPA_VERSION, type DpaLang } from "~/lib/dpa";

export const LANGUAGE_LABEL: Record<DpaLang, string> = {
  en: "English",
  de: "German",
};

const RADIO_CLASS = "accent-brand-strong size-4 shrink-0";
const RADIO_LABEL_CLASS =
  "text-ink hover:bg-subtle has-focus-visible:border-ink border-line bg-card inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm";

/**
 * The online acceptance step: the plain-language summary of the agreement,
 * the full text and both PDFs to read first, the language the acceptance is
 * recorded in, and the accept button. A plain form, so it renders inside the
 * workspace layout without client code. The same form appears in the
 * interstitial and on the agreement page, so ids take a prefix.
 */
export const AcceptanceForm = ({
  summary,
  idPrefix,
  defaultLang,
}: {
  summary: string[];
  idPrefix: string;
  /** No workspace carries a language today, so callers pass English. */
  defaultLang: DpaLang;
}) => (
  <form action={acceptDpaAction} className="flex flex-col gap-5">
    <ul className="text-ink-soft flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
      {summary.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>

    <p className="text-ink-soft text-sm">
      Read the full text before you accept:{" "}
      <a
        href="/dpa"
        target="_blank"
        rel="noopener"
        className="text-ink underline underline-offset-4"
      >
        agreement on the website
      </a>
      ,{" "}
      <a
        href="/api/export/dpa?lang=en"
        className="text-ink underline underline-offset-4"
      >
        PDF in English
      </a>{" "}
      or{" "}
      <a
        href="/api/export/dpa?lang=de"
        className="text-ink underline underline-offset-4"
      >
        PDF in German
      </a>
      .
    </p>

    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink-faint mb-2 text-xs font-medium tracking-[0.14em] uppercase">
        Language of record
      </legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LANGUAGE_LABEL) as DpaLang[]).map((lang) => (
          <label
            key={lang}
            htmlFor={`${idPrefix}-lang-${lang}`}
            className={RADIO_LABEL_CLASS}
          >
            <input
              id={`${idPrefix}-lang-${lang}`}
              type="radio"
              name="language"
              value={lang}
              defaultChecked={lang === defaultLang}
              className={RADIO_CLASS}
            />
            {LANGUAGE_LABEL[lang]}
          </label>
        ))}
      </div>
    </fieldset>

    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="primary">
        Accept version {DPA_VERSION}
      </Button>
      <span className="text-ink-faint text-xs">
        Recorded with your name, your sign-in address and the time.
      </span>
    </div>
  </form>
);
