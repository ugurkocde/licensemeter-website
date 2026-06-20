import Link from "next/link";

/**
 * The three button tiers of the design system. Primary and secondary are
 * sentence case; micro is the uppercase 11px tier for table-row actions:
 * visually ~26px tall, with an invisible ::after overlay stretching the hit
 * area to 44px for touch without disturbing table-row layouts.
 */
const BUTTON_VARIANTS = {
  primary:
    "inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center gap-2.5 rounded-xl bg-brand-strong px-5 py-3 text-sm font-medium text-white shadow-card transition hover:bg-brand-deep hover:shadow-float disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-5 py-2.5 text-sm font-medium text-ink transition hover:border-brand hover:bg-subtle disabled:opacity-50",
  micro:
    "relative inline-flex cursor-pointer touch-manipulation items-center rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase transition after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-[''] hover:border-brand disabled:opacity-30",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export const buttonClass = (variant: ButtonVariant, extra = ""): string =>
  `${BUTTON_VARIANTS[variant]} ${extra}`.trim();

export const Button = ({
  variant = "secondary",
  className = "",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant }) => (
  <button className={buttonClass(variant, className)} {...props} />
);

/** Internal navigation button (next/link). */
export const ButtonLink = ({
  variant = "secondary",
  className = "",
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) => (
  <Link className={buttonClass(variant, className)} {...props} />
);

/** Plain anchor button, for downloads and API-route links. */
export const ButtonAnchor = ({
  variant = "secondary",
  className = "",
  ...props
}: React.ComponentProps<"a"> & { variant?: ButtonVariant }) => (
  <a className={buttonClass(variant, className)} {...props} />
);

/** Bordered card with the uppercase ledger header, used on dashboard pages. */
export const Card = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="border-line bg-card shadow-card overflow-hidden rounded-2xl border">
    <div className="border-line border-b px-5 py-3">
      <h2 className="text-ink-faint text-xs font-medium tracking-[0.14em] uppercase">
        {title}
      </h2>
    </div>
    <div className="px-5 py-4">{children}</div>
  </section>
);

/** Category/status pill tones. Soft fill + dark text from the same ramp. */
const PILL_TONES = {
  brand: "bg-brand-soft text-brand-deep",
  waste: "bg-waste-soft text-waste-deep",
  good: "bg-good-soft text-good-text",
  danger: "bg-danger-soft text-danger-text",
  gold: "bg-gold-soft text-gold-text",
  slate: "bg-slate-soft text-slate-ink",
  plum: "bg-plum-soft text-plum",
  teal: "bg-teal-soft text-teal-ink",
  /** Neutral outline tier, e.g. acknowledged status. */
  outline: "border border-line-strong text-ink-soft",
  /** Legacy alias: moss maps to the good/emerald tone. */
  moss: "bg-good-soft text-good-text",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export const PILL_BASE =
  "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap uppercase";

export const Pill = ({
  tone,
  className = "",
  ...props
}: React.ComponentProps<"span"> & { tone: PillTone }) => (
  <span className={`${PILL_BASE} ${PILL_TONES[tone]} ${className}`} {...props} />
);
