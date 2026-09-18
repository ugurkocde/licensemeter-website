"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Keep the document language accurate for localized static route groups. */
export const MarketingLanguageSync = () => {
  const pathname = usePathname();
  const language =
    pathname === "/de" || pathname.startsWith("/de/") ? "de" : "en";
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
};
