import type { Metadata } from "next";

import { SUPPORT_EMAIL } from "~/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy",
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
 * Controller details are filled (UgurLabs UG, Düsseldorf). Before launch:
 * add Stripe to the subprocessor list once billing goes live (US transfer,
 * retains invoices for tax law) and have the final text reviewed by a lawyer
 * (this is a structured draft, not legal advice).
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <h1 className="font-display text-4xl tracking-tight">Privacy Policy</h1>
      <p className="text-ink-faint mt-3 text-xs">Last updated: June 2026</p>

      <Section title="1. Controller">
        <p>
          UgurLabs UG (haftungsbeschränkt)
          <br />
          Fährstraße 217, 40221 Düsseldorf, Germany
          <br />
          Managing Director: Ugur Koc
          <br />
          Email: {SUPPORT_EMAIL}
        </p>
      </Section>

      <Section title="2. Processing when you visit this website">
        <p>
          When you open this website, our hosting provider (Vercel Inc.)
          processes technically necessary data (IP address, time, page
          requested, user agent) in server logs in order to provide and secure
          the service (Art. 6(1)(f) GDPR). The application runs in EU data
          centers; a data processing agreement including the EU Standard
          Contractual Clauses is in place with Vercel.
        </p>
        <p>
          This website uses only technically necessary session cookies for
          sign-in. No tracking or marketing cookies are set. See our{" "}
          <a
            href="/cookies"
            className="hover:text-ink underline underline-offset-4"
          >
            Cookie Policy
          </a>{" "}
          for details.
        </p>
        <p>
          For reach measurement we use Vercel Web Analytics, a cookieless method
          that records only aggregated, anonymized page views (Art. 6(1)(f)
          GDPR). No cross-device profiles are built and no IP addresses are
          stored.
        </p>
      </Section>

      <Section title="3. Sign-in with Microsoft Entra ID">
        <p>
          Sign-in is handled through Microsoft Entra ID (OpenID Connect). We
          process the profile data Microsoft transmits: display name, email
          address / UPN, object ID and tenant ID. This data is required to
          provide the account (Art. 6(1)(b) GDPR).
        </p>
      </Section>

      <Section title="4. Product data (processing on your behalf)">
        <p>
          When an organization connects its Microsoft 365 tenant, LicenseMeter
          processes the following data of the tenant&rsquo;s users on that
          organization&rsquo;s behalf (Art. 28 GDPR): display name, UPN, account
          status, user type, creation date, license assignments, last sign-in
          timestamp and the last activity date per service. Mailbox, file or
          message content is never read; access is technically limited to
          read-only permissions.
        </p>
        <p>
          If the organization additionally connects optional connectors,
          LicenseMeter processes, under the same engagement, the following data
          as well: member email addresses and product assignments from Adobe,
          Zoom, Atlassian and Salesforce; console member lists and daily API
          cost totals from OpenAI and Anthropic; and member lists pasted via CSV
          from ChatGPT and Claude.
        </p>
        <p>
          The data is stored in a Postgres database in the EU (Frankfurt region)
          and is deleted immediately and in full when the workspace is
          disconnected. A data processing agreement (DPA) is provided to each
          organization before production use.
        </p>
      </Section>

      <Section title="4a. Email notification (landing page)">
        <p>
          If you leave your email address on the home page, we store it in order
          to send you the requested materials (security overview) and a one-time
          notice about the start of billing (Art. 6(1)(b) GDPR). There is no
          automated newsletter. The address is deleted on request at any time.
        </p>
      </Section>

      <Section title="5. Subprocessors">
        <p>
          Vercel Inc. (hosting, EU function region), Supabase Inc. (database,
          AWS eu-central-1 Frankfurt), Microsoft (identity platform and Graph
          API), Resend Inc. (email delivery, EU region eu-west-1; workspace
          notifications to administrators as well as the emails described in
          section 4a to people who leave their address on the home page). The
          current list is part of the DPA.
        </p>
        <p>
          To be distinguished from these are the source systems named in section
          4 (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic, and the
          lists pasted via CSV from ChatGPT and Claude): LicenseMeter reads data
          from them, on the organization&rsquo;s behalf, on a read-only basis.
          They are data sources, not subprocessors of LicenseMeter; no personal
          data is shared with them beyond the authenticated read request.
        </p>
      </Section>

      <Section title="6. Retention">
        <p>
          Account and product data is stored for as long as the workspace is
          connected. On disconnect, all synchronized data is deleted. The
          hosting provider&rsquo;s server logs are subject to that
          provider&rsquo;s deletion periods.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          You have the right of access (Art. 15), rectification (Art. 16),
          erasure (Art. 17), restriction of processing (Art. 18), data
          portability (Art. 20) and objection (Art. 21 GDPR), as well as the
          right to lodge a complaint with a supervisory authority (Art. 77
          GDPR). For data we process on behalf of your organization, please
          contact your organization as the controller in the first instance.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>Privacy questions: {SUPPORT_EMAIL}</p>
      </Section>
    </main>
  );
}
