import { inflateSync } from "node:zlib";

/**
 * Test-only helpers that read a rendered PDF: the text drawn on its pages and
 * its page boxes. Content streams are deflated and text is written as hex
 * glyph strings, split for kerning, so a plain buffer search would miss it.
 */

const streams = (pdf: Buffer): string[] => {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const re = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const body = pdf.subarray(start, end);
    try {
      out.push(inflateSync(body).toString("latin1"));
    } catch {
      out.push(body.toString("latin1"));
    }
    re.lastIndex = end + "endstream".length;
  }
  return out;
};

const decodeHex = (hex: string) => Buffer.from(hex, "hex").toString("latin1");

const unescape = (s: string) =>
  s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) =>
    /^[0-7]+$/.test(c)
      ? String.fromCharCode(Number.parseInt(c, 8))
      : ((
          { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<
            string,
            string
          >
        )[c] ?? c),
  );

/** Every string drawn with Tj or TJ, one entry per text operator. */
export const pdfText = (pdf: Buffer): string => {
  const parts: string[] = [];
  for (const content of streams(pdf)) {
    const ops = content.match(
      /(\[[^\]]*\]\s*TJ|(<[0-9a-fA-F]*>|\((?:\\.|[^\\)])*\))\s*Tj)/g,
    );
    for (const op of ops ?? []) {
      let text = "";
      for (const piece of op.matchAll(
        /<([0-9a-fA-F]*)>|\(((?:\\.|[^\\)])*)\)/g,
      )) {
        text +=
          piece[1] !== undefined ? decodeHex(piece[1]) : unescape(piece[2]!);
      }
      parts.push(text);
    }
  }
  // Runs split for kerning or by word; one space between words reads best.
  return parts.join(" ").replace(/\s+/g, " ");
};

/** The MediaBox of every page object, as [width, height] in points. */
export const pdfPages = (pdf: Buffer): [number, number][] => {
  const raw = pdf.toString("latin1");
  const pages: [number, number][] = [];
  for (const m of raw.matchAll(
    /\/Type\s*\/Page\b(?!s)[\s\S]*?\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g,
  )) {
    pages.push([Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])]);
  }
  return pages;
};
