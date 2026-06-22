import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/react";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { siteUrl } from "~/env";
import { SITE_DEFINITION } from "~/lib/site";
import { SUPPORT_EMAIL } from "~/lib/support";

const TITLE =
  "LicenseMeter | find the Microsoft 365 licenses you pay for but do not use";
const DESCRIPTION =
  "LicenseMeter connects read-only to your Microsoft 365 tenant and shows the monthly cost of unused, misassigned and forgotten licenses.";

const BASE = siteUrl();

/* Organization + WebSite entities on every page: the anchor Google and AI
 * answer engines use to resolve what LicenseMeter is and who runs it.
 * Static content; "<" escaped so nothing can terminate the script element. */
const SITE_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE}/#organization`,
      name: "LicenseMeter",
      url: BASE,
      logo: `${BASE}/icon.svg`,
      description: SITE_DEFINITION,
      legalName: "UgurLabs UG (haftungsbeschränkt)",
      member: {
        "@type": "Person",
        name: "Ugur Koc",
        jobTitle: "Maintainer",
        award: "Microsoft MVP for Intune and Security Copilot",
        url: "https://ugurkoc.de",
        sameAs: ["https://github.com/ugurkocde", "https://x.com/ugurkocde"],
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        availableLanguage: ["English", "German"],
      },
      knowsAbout: [
        "Microsoft 365 license management",
        "SaaS license optimization",
        "Entra ID",
        "software license waste",
        "license cost reduction",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${BASE}/#website`,
      url: BASE,
      name: "LicenseMeter",
      publisher: { "@id": `${BASE}/#organization` },
      inLanguage: "en",
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  // Self-referencing canonical, resolved per page against metadataBase.
  alternates: { canonical: "./" },
  applicationName: "LicenseMeter",
  category: "Business Software",
  title: { default: TITLE, template: "%s | LicenseMeter" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "LicenseMeter",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    // Founder handle (no brand account yet), verified via ugurkoc.de.
    creator: "@ugurkocde",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = { themeColor: "#fbfcfc" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <AuthKitProvider>{children}</AuthKitProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(SITE_LD).replaceAll("<", "\\u003c"),
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
