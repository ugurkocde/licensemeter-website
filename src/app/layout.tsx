import { CrispChat } from "~/components/CrispChat";
import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/react";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { connection } from "next/server";

import { authProvider, env, siteUrl } from "~/env";
import { SITE_DEFINITION, SITE_DESCRIPTION, SITE_TITLE } from "~/lib/site";
import { SUPPORT_EMAIL } from "~/lib/support";

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
      legalName: "Ugurlabs UG (haftungsbeschränkt)",
      duns: "317299682",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Fährstraße 217",
        postalCode: "40221",
        addressLocality: "Düsseldorf",
        addressCountry: "DE",
      },
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
  title: { default: SITE_TITLE, template: "%s | LicenseMeter" },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "LicenseMeter",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    // Founder handle (no brand account yet), verified via ugurkoc.de.
    creator: "@ugurkocde",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Docker images have no deployment secrets at build time. Render from the
  // runtime environment; hosted marketing pages keep their static behavior.
  if (env.SELF_HOSTED === "true") await connection();
  const crispId =
    env.CRISP_WEBSITE_ID ??
    (env.SELF_HOSTED === "true"
      ? undefined
      : "d8cf4fcb-0dbe-42ee-b94c-3bbc415d58f4");
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        {authProvider() === "workos" ? (
          <AuthKitProvider>{children}</AuthKitProvider>
        ) : (
          children
        )}
        {crispId && <CrispChat websiteId={crispId} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(SITE_LD).replaceAll("<", "\\u003c"),
          }}
        />
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
