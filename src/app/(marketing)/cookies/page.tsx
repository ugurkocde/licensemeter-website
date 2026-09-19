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

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <h1 className="font-display text-4xl tracking-tight">Cookie Policy</h1>
      <p className="text-ink-faint mt-3 text-xs">
        Last updated: September 2026
      </p>

      <Section title="In short">
        <p>
          LicenseMeter uses cookies for sign-in, workspace selection and support
          chat. Crisp keeps your support conversation available as you move
          between pages. We use cookieless Vercel Web Analytics for reach
          measurement and do not embed advertising pixels.
        </p>
      </Section>

      <Section title="1. What are cookies?">
        <p>
          Cookies are small text files stored on your device when you visit a
          website. Among other things, they let an authenticated session persist
          across page loads. Cookies set by the website you are visiting are
          first-party cookies; cookies from other providers are third-party
          cookies. Our support provider Crisp also uses cookies to maintain chat
          sessions.
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
                <th scope="col" className="px-4 py-2 font-medium">
                  Cookie
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Purpose
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Retention
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-soft">
              <tr className="border-line border-b">
                <td className="text-ink px-4 py-2 font-mono">lm_session</td>
                <td className="px-4 py-2">
                  Keeps you signed in to the application and to the demo
                  workspace (HTTP-only). Set by LicenseMeter after you sign in
                  with Microsoft; a signed token holding your name, email,
                  Microsoft object ID and tenant ID.
                </td>
                <td className="px-4 py-2">30 days</td>
              </tr>
              <tr className="border-line border-b">
                <td className="text-ink px-4 py-2 font-mono">lm_oauth</td>
                <td className="px-4 py-2">
                  Protects the Microsoft sign-in flow (OAuth state / PKCE)
                  against CSRF; active only during the redirect.
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
          In production the LicenseMeter session cookies carry the{" "}
          <code>__Host-</code> prefix for added security (e.g.{" "}
          <code>__Host-lm_session</code>).
        </p>
      </Section>

      <Section title="3. Functionality cookies">
        <p>
          Crisp uses a session cookie (whose name starts with{" "}
          <code>crisp-client/session/</code>) to restore your conversation when
          you navigate between pages or return later. Crisp documents a default
          session-cookie lifetime of six months. See{" "}
          <a
            href="https://help.crisp.chat/en/article/crisp-cookie-policy-1147xor/"
            className="underline underline-offset-4"
          >
            Crisp’s cookie policy
          </a>{" "}
          for its cookie names and purposes.
        </p>
        <p>
          Where additional spam verification is enabled, Cloudflare Turnstile
          also processes browser information to verify that submissions are
          legitimate.
        </p>
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
          You can view, restrict or delete cookies at any time in your browser
          settings. Deleting the necessary cookies means you will have to sign
          in again and your workspace selection is reset. Deleting Crisp cookies
          can prevent the chat from restoring a previous conversation.
        </p>
      </Section>

      <Section title="7. Changes to this Cookie Policy">
        <p>
          We update this Cookie Policy when the cookies we use change. The
          version published on this page applies. Questions: please email{" "}
          {SUPPORT_EMAIL}.
        </p>
      </Section>
    </main>
  );
}
