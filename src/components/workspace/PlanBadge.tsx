import Link from "next/link";

import { Pill } from "~/components/ui";
import { planBadge } from "~/lib/planLabel";
import { UPGRADE_PATH } from "~/lib/upgrade";
import type { Entitlement } from "~/server/entitlement";

/**
 * The workspace's plan in the dashboard chrome. Renders nothing for
 * self-hosted installs and the demo workspace. The pill is ~21px tall; the
 * ::after overlay stretches the hit area to 44px without moving the layout.
 */
export const PlanBadge = ({
  entitlement,
  onNavigate,
  className = "",
}: {
  entitlement: Entitlement;
  onNavigate?: () => void;
  className?: string;
}) => {
  const badge = planBadge(entitlement);
  if (!badge) return null;
  return (
    <Link
      href={UPGRADE_PATH}
      onClick={onNavigate}
      className={`group relative inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] ${className}`}
    >
      <span className="sr-only">Plan: </span>
      <Pill tone={badge.tone}>{badge.label}</Pill>
      {badge.detail && (
        <span className="text-sidebar-soft group-hover:text-ink text-[11px] underline-offset-4 transition group-hover:underline">
          {badge.detail}
        </span>
      )}
    </Link>
  );
};
