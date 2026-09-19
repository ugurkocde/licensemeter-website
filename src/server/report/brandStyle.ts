/**
 * White-label report styling. Pure module (no env, no db, no node built-ins)
 * so the PDF, the portal preview and the upload form share one set of rules.
 */

/** What a white-labelled report carries instead of the LicenseMeter marks. */
export type ReportBranding = {
  name: string | null;
  /** `#RRGGBB`, or null to keep the LicenseMeter accent. */
  color: string | null;
  /** PNG or JPEG data URL. */
  logo: string | null;
};

export const BRAND_NAME_MAX = 60;
export const BRAND_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const LOGO_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type LogoMediaType = (typeof LOGO_MEDIA_TYPES)[number];
/** Decoded size. Keeps the data URL under the 400000 characters the table allows. */
export const LOGO_MAX_BYTES = 256 * 1024;

/** The report's own accent, used when a brand sets no colour. */
export const DEFAULT_ACCENT = "#0f766e";
/**
 * The two text colours a band can carry. Pure white and pure black, because
 * the better of the two reaches at least 4.5 to 1 on every background; the
 * softer report ink would drop to 4.2 to 1 on a mid grey.
 */
export const TEXT_ON_DARK = "#ffffff";
export const TEXT_ON_LIGHT = "#000000";

const channel = (hex: string, offset: number): number => {
  const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a `#RRGGBB` colour: 0 is black, 1 is white. */
export const relativeLuminance = (hex: string): number => {
  if (!BRAND_COLOR_PATTERN.test(hex)) throw new Error(`not a colour: ${hex}`);
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
};

/** WCAG contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The text colour to set on a brand-coloured band: whichever of white and
 * black contrasts more, so a bright yellow brand gets dark text.
 */
export const readableTextOn = (background: string): string =>
  contrastRatio(TEXT_ON_DARK, background) >=
  contrastRatio(TEXT_ON_LIGHT, background)
    ? TEXT_ON_DARK
    : TEXT_ON_LIGHT;

/** The band colour and the text colour that goes on it. */
export const brandBand = (
  color: string | null,
): { background: string; text: string } => {
  const background =
    color && BRAND_COLOR_PATTERN.test(color) ? color : DEFAULT_ACCENT;
  return { background, text: readableTextOn(background) };
};
