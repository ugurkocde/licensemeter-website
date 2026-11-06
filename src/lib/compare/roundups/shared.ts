import { NON_MICROSOFT_CONNECTORS } from "../licensemeter";
import type { Localized } from "../types";

const n = NON_MICROSOFT_CONNECTORS.length;

/** Criteria every roundup applies, so the pages read as one method. */
export const SOURCED: Localized = {
  en: "Its own website, documentation or repository says what it does, so every cell links to a source. Where we found nothing, the table says Not stated.",
  de: "Die eigene Website, Dokumentation oder das Repository beschreibt, was es kann, sodass jede Zelle eine Quelle verlinkt. Wo wir nichts fanden, steht Keine Angabe.",
};

export const CURRENT: Localized = {
  en: "It is sold or maintained as of November 2026.",
  de: "Es wird im November 2026 verkauft oder gepflegt.",
};

/** LicenseMeter's gaps, stated the same way on every roundup. */
export const LICENSEMETER_GAPS: Localized = {
  en: `Its gaps: it never removes a license itself (it generates a script your admin runs), it does not suggest downgrades or bundles, and it reads ${n} other SaaS tools rather than hundreds.`,
  de: `Die Lücken: Es entzieht nie selbst eine Lizenz (es erzeugt ein Skript, das Ihre Admins ausführen), es schlägt keine Verkleinerungen oder Bündel vor, und es liest ${n} weitere SaaS-Anwendungen statt hunderter.`,
};
