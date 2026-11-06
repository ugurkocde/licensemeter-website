import Link from "next/link";

import type { Lang } from "~/lib/compare/types";

import { compareCopy, comparePath } from "./copy";

/** Link to the same compare page in the other edition. */
export const LangSwitch = ({ lang, slug }: { lang: Lang; slug?: string }) => {
  const other = compareCopy(lang).otherLang;
  return (
    <Link
      href={comparePath(other.lang, slug)}
      hrefLang={other.lang}
      lang={other.lang}
      className="text-ink-faint hover:text-ink text-xs font-medium underline underline-offset-4"
    >
      {other.label}
    </Link>
  );
};
