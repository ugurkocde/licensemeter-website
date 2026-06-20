import type { Metadata } from "next";

import { SUPPORT_EMAIL } from "~/lib/support";

export const metadata: Metadata = {
  title: "Cookie Policy",
  robots: { index: false },
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mt-8">
    <h2 className="text-ink font-medium">{title}</h2>
    <div className="text-ink-soft mt-2 flex flex-col gap-2 text-sm leading-relaxed">
      {children}
    </div>
  </section>
);

/*
 * Structured draft, not legal advice. LicenseMeter sets only first-party,
 * strictly necessary cookies and measures reach with cookieless Vercel Web
 * Analytics, so no consent banner is legally required (Section 25(2) no. 2
 * TDDDG, the German ePrivacy implementation). The categories below mirror the
 * standard cookie-policy layout; the "we don't use these" statements are
 * deliberate and accurate.
 */
export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <h1 className="font-display text-4xl tracking-tight">Cookie Policy</h1>
      <p className="text-ink-faint mt-3 text-xs">Last updated: June 2026</p>

      <Section title="In short">
        <p>
          LicenseMeter sets only strictly necessary first-party cookies that are
          required for sign-in and workspace selection. We set no analytics,
          marketing or tracking cookies, and we measure reach with a cookieless
          method. For that reason no cookie banner and no consent is required
          (Section 25(2) no. 2 TDDDG).
        </p>
      </Section>

      <Section title="1. What are cookies?">
        <p>
          Cookies are small text files stored on your device when you visit a
          website. Among other things, they let an authenticated session persist
          across page loads. Cookies set by the website you are visiting are
          first-party cookies; cookies from other providers are third-party
          cookies. LicenseMeter sets no third-party cookies.
        </p>
      </Section>

      <Section title="2. Strictly necessary cookies">
        <p>
          These cookies are essential for the application to work and cannot be
          switched off. They store no information that could be used for
          advertising or analytics. The legal basis is Section 25(2) no. 2
          TDDDG; the related processing of personal data relies on Art. 6(1)(b)
          and (f) GDPR.
        </p>
        <div className="border-line bg-card mt-2 overflow-hidden border">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-faint">
              <tr className="border-line border-b">
                <th className="px-4 py-2 font-medium">Cookie</th>
                <th className="px-4 py-2 font-medium">Purpose</th>
                <th className="px-4 py-2 font-medium">Retention</th>
              </tr>
            </thead>
            <tbody className="text-ink-soft">
              <tr className="border-line border-b">
                <td className="text-ink px-4 py-2 font-mono">lm_session</td>
                <td className="px-4 py-2">Keeps you signed in (HTTP-only).</td>
                <td className="px-4 py-2">30 days</td>
              </tr>
              <tr className="border-line border-b">
                <td className="text-ink px-4 py-2 font-mono">lm_oauth</td>
                <td className="px-4 py-2">
                  Protects the sign-in flow (OAuth state / PKCE) against CSRF;
                  active only during the redirect.
                </td>
                <td className="px-4 py-2">10 minutes</td>
              </tr>
              <tr>
                <td className="text-ink px-4 py-2 font-mono">lm_ws</td>
                <td className="px-4 py-2">
                  Remembers the workspace you last opened.
                </td>
                <td className="px-4 py-2">12 months</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-ink-faint text-xs">
          In production the session cookies carry the <code>__Host-</code>{" "}
          prefix for added security (e.g. <code>__Host-lm_session</code>).
        </p>
      </Section>

      <Section title="3. Functionality cookies">
        <p>We set no functionality or personalization cookies.</p>
      </Section>

      <Section title="4. Analytics / performance cookies">
        <p>
          We set no analytics cookies. For reach measurement we use Vercel Web
          Analytics, a cookieless method that records only aggregated,
          anonymized page views (Art. 6(1)(f) GDPR). No cookies are set, no IP
          addresses are stored, and no cross-device profiles are built.
        </p>
      </Section>

      <Section title="5. Targeting / advertising cookies">
        <p>
          We set no marketing, advertising or tracking cookies, and we embed no
          advertising or social-media pixels.
        </p>
      </Section>

      <Section title="6. Managing cookies">
        <p>
          Because only strictly necessary cookies are used, no consent is
          required and no cookie banner is shown. You can view, restrict or
          delete cookies at any time in your browser settings. Deleting the
          necessary cookies means you will have to sign in again and your
          workspace selection is reset; this may impair the service.
        </p>
      </Section>

      <Section title="7. Changes to this Cookie Policy">
        <p>
          We update this Cookie Policy when the cookies we use change. The
          version published on this page applies. Questions: please email
          {SUPPORT_EMAIL}.
        </p>
      </Section>
    </main>
  );
}
