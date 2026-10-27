"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { ANNOUNCED_POST } from "~/lib/blog";

const COPY = {
  en: {
    label: "Announcement",
    badge: "New",
    text: "Software Metering is now announced.",
    detail: "See which Windows apps your devices actually start.",
    link: "Read the post",
  },
  de: {
    label: "Ankündigung",
    badge: "Neu",
    text: "Software Metering ist jetzt angekündigt.",
    detail:
      "Sehen Sie, welche Windows-Apps auf Ihren Geräten gestartet werden.",
    link: "Zum Beitrag (EN)",
  },
};

/**
 * Launch banner across the top edge of every marketing page. The whole strip
 * is one link to the announcement post; the German routes get German copy.
 */
export const AnnouncementBanner = () => {
  const german = usePathname().startsWith("/de/");
  const t = german ? COPY.de : COPY.en;
  return (
    <div role="region" aria-label={t.label} className="bg-ink text-white">
      <Link
        href={`/blog/${ANNOUNCED_POST}`}
        className="group mx-auto flex min-h-11 max-w-[1600px] touch-manipulation flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-4 py-2 text-center text-[13px] leading-snug focus-visible:-outline-offset-2 sm:text-sm"
      >
        <span className="bg-brand-bright text-brand-deep rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
          {t.badge}
        </span>
        <span className="font-medium">{t.text}</span>
        <span className="hidden text-white/70 md:inline">{t.detail}</span>
        <span className="text-brand-bright inline-flex items-center gap-1 font-semibold underline-offset-4 group-hover:underline">
          {t.link}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </Link>
    </div>
  );
};
