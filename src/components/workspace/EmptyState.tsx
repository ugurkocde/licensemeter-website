import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared empty-state primitive: a neutral icon chip, a heading, and one line of
 * muted subtext (text-ink-soft). Keeps the app's "no data" surfaces on a single
 * visual tone. For the rich, multi-tile first-run state see OnboardingEmptyState;
 * this is the lightweight variant for tables, filtered lists and the like.
 */
export const EmptyState = ({
  icon: Icon,
  heading,
  children,
}: {
  icon?: LucideIcon;
  heading: string;
  /** Optional muted subtext / supporting content. */
  children?: ReactNode;
}) => (
  <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-12 text-center">
    {Icon && (
      <span
        aria-hidden="true"
        className="mb-3 flex size-10 items-center justify-center rounded-lg border border-line bg-canvas text-ink-faint"
      >
        <Icon className="size-5" />
      </span>
    )}
    <p className="font-medium text-ink">{heading}</p>
    {children && (
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</p>
    )}
  </div>
);
