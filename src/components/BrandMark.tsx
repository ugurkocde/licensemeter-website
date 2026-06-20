/**
 * The LicenseMeter mark: a tally being struck out. Count the seats, strike
 * the waste. Colors are brand constants matching the tokens in globals.css;
 * "light" sits on canvas surfaces (ink bars, amber strike), "dark" sits on the
 * ink sidebar (canvas bars, brighter amber strike). The favicon set
 * (src/app/icon.svg, scripts/make-icons.mjs) carries the same geometry in the
 * light palette and must be regenerated if this changes.
 */
const PALETTES = {
  light: { bars: "#0c1a17", strike: "#f59e0b" },
  dark: { bars: "#fbfcfc", strike: "#fbbf24" },
} as const;

export const BrandMark = ({
  size = 22,
  tone = "light",
}: {
  size?: number;
  tone?: keyof typeof PALETTES;
}) => {
  const palette = PALETTES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <g fill={palette.bars}>
        <rect x="6" y="6.5" width="4.5" height="19" />
        <rect x="13.75" y="6.5" width="4.5" height="19" />
        <rect x="21.5" y="6.5" width="4.5" height="19" />
      </g>
      <line
        x1="3.5"
        y1="22.5"
        x2="28.5"
        y2="9.5"
        stroke={palette.strike}
        strokeWidth="4.5"
      />
    </svg>
  );
};
