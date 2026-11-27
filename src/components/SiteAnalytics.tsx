"use client";

import { Analytics } from "@vercel/analytics/react";

export const SiteAnalytics = () => (
  <Analytics
    beforeSend={(event) => {
      // Token-bearing paths never reach analytics.
      const path = new URL(event.url, window.location.origin).pathname;
      return path.startsWith("/connect/approve/") || path.startsWith("/r/")
        ? null
        : event;
    }}
  />
);
