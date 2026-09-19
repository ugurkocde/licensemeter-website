import { renderToBuffer } from "@react-pdf/renderer";

import {
  dpaFilename,
  signedDpaFilename,
  type DpaCounterparty,
  type DpaLang,
} from "~/lib/dpa";
import { DpaDocument } from "~/server/dpa/DpaDocument";

/**
 * Renders the DPA / AVV to a PDF buffer for the given language. Without a
 * counterparty it is the pre-signed document: pure content (no DB), so it is
 * safe to call from the public export route. With one it is the copy signed
 * with a named company, served only to members of that workspace.
 */
export const renderDpaPdf = async (
  lang: DpaLang,
  counterparty?: DpaCounterparty,
): Promise<{ buffer: Buffer; filename: string }> => {
  const buffer = await renderToBuffer(DpaDocument({ lang, counterparty }));
  return {
    buffer,
    filename: counterparty
      ? signedDpaFilename(lang, counterparty.companyName)
      : dpaFilename(lang),
  };
};
