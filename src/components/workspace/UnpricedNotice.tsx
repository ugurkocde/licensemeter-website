import { ArrowRight, Tag } from "lucide-react";

import { ButtonLink } from "~/components/ui";

/**
 * Shown while Microsoft products with seats have no price: their waste counts
 * as 0, so every total understates it. Links to the unpriced filter of the
 * price editor.
 */
export const UnpricedNotice = ({ count }: { count: number }) =>
  count > 0 ? (
    <aside
      className="border-gold/20 bg-gold-soft flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:pr-3.5 sm:pl-5"
      aria-label="Unpriced licenses"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-card text-gold-text ring-gold/15 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1"
        >
          <Tag className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="text-ink font-medium">
            {count === 1
              ? "1 license has no price yet, so waste is understated."
              : `${count} licenses have no price yet, so waste is understated.`}
          </p>
          <p className="text-gold-text mt-0.5">
            {count === 1 ? "Its" : "Their"} unused seats count as zero until you
            add a monthly price.
          </p>
        </div>
      </div>
      <ButtonLink
        href="/app/licenses?pricing=unpriced"
        className="shrink-0 self-start px-4 py-2 sm:self-auto"
      >
        Set prices
        <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </aside>
  ) : null;
