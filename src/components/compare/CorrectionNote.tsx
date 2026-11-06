import { editFileUrl, sourceFileUrl } from "~/lib/compare";
import { SUPPORT_EMAIL } from "~/lib/support";

const LINK =
  "text-ink hover:text-brand-text font-medium underline underline-offset-4";

const COPY = {
  en: {
    lead: "Spot something wrong or out of date?",
    body: "Every claim on this page renders from one public file,",
    pr: "Open a pull request",
    or: "or email",
    end: "and we will fix it. Vendors are welcome to correct what we say about them.",
  },
  de: {
    lead: "Etwas falsch oder veraltet?",
    body: "Jede Aussage auf dieser Seite stammt aus einer öffentlichen Datei,",
    pr: "Öffnen Sie einen Pull Request",
    or: "oder schreiben Sie an",
    end: "und wir korrigieren es. Auch Anbieter können korrigieren, was wir über sie schreiben.",
  },
} as const;

/**
 * Points readers (and the vendors we compare against) at the data file a
 * page renders from, so anyone can check a claim and propose a fix.
 */
export const CorrectionNote = ({
  repoPath,
  lang = "en",
}: {
  /** Repository path of the data file, e.g. src/lib/compare/vendors/x.ts */
  repoPath: string;
  lang?: keyof typeof COPY;
}) => {
  const t = COPY[lang];
  return (
    <p className="text-ink-soft border-line mt-14 border-t pt-6 text-sm leading-relaxed">
      <span className="text-ink font-medium">{t.lead}</span> {t.body}{" "}
      <a href={sourceFileUrl(repoPath)} className={LINK}>
        <code className="font-mono text-xs">{repoPath}</code>
      </a>
      .{" "}
      <a href={editFileUrl(repoPath)} className={LINK}>
        {t.pr}
      </a>{" "}
      {t.or}{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
        {SUPPORT_EMAIL}
      </a>{" "}
      {t.end}
    </p>
  );
};
