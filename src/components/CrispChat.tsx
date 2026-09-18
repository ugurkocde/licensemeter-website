"use client";

import Script from "next/script";

declare global {
  interface Window {
    $crisp?: { push: (command: unknown[]) => void };
    CRISP_WEBSITE_ID?: string;
  }
}

/** Mounted once in the root layout, so chat survives client-side navigation. */
export function CrispChat({ websiteId }: { websiteId: string }) {
  return (
    <Script id="crisp-chat" strategy="lazyOnload">{`
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = ${JSON.stringify(websiteId).replaceAll("<", "\\u003c")};
      window.$crisp.push(["config", "color:mode", ["light"]]);
      window.$crisp.push(["config", "color:theme", ["teal"]]);
      if (!document.getElementById("crisp-sdk")) {
        var script = document.createElement("script");
        script.id = "crisp-sdk";
        script.src = "https://client.crisp.chat/l.js";
        script.async = true;
        document.head.appendChild(script);
      }
    `}</Script>
  );
}
