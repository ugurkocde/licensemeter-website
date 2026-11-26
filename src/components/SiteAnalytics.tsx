"use client";

import { Analytics } from "@vercel/analytics/react";

export const SiteAnalytics = () => (
  <Analytics
    beforeSend={(event) =>
      new URL(event.url, window.location.origin).pathname.startsWith(
        "/connect/approve/",
      )
        ? null
        : event
    }
  />
);
