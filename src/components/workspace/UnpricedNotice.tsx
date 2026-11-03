import Link from "next/link";

/**
 * Shown while Microsoft products with seats have no price: their waste counts
 * as 0, so every total understates it. Links to the unpriced filter of the
 * price editor.
 */
export const UnpricedNotice = ({ count }: { count: number }) =>
  count > 0 ? (
    <aside
      className="border-gold-soft bg-gold-soft text-gold-text flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
      aria-label="Unpriced licenses"
    >
      <p>
        {count === 1
          ? "1 license has no price yet, so waste is understated."
          : `${count} licenses have no price yet, so waste is understated.`}
      </p>
      <Link
        href="/app/licenses?pricing=unpriced"
        className="hover:text-ink inline-flex min-h-11 items-center font-medium underline underline-offset-4"
      >
        Set prices
      </Link>
    </aside>
  ) : null;
