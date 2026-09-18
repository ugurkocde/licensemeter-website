import type { Metadata } from "next";

import { SUBPROCESSORS } from "~/lib/dpa";
import { SUPPORT_EMAIL } from "~/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy",
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

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <h1 className="font-display text-4xl tracking-tight">Privacy Policy</h1>
      <p className="text-ink-faint mt-3 text-xs">
        Last updated: September 2026
      </p>

      <Section title="1. Controller">
        <p>
          UgurLabs UG (haftungsbeschränkt)
          <br />
          Fährstraße 217, 40221 Düsseldorf, Germany
          <br />
          Commercial register: Amtsgericht Düsseldorf, HRB 113979
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
          This website uses session cookies for sign-in and workspace selection,
          and Crisp cookies to maintain support conversations. See our{" "}
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

      <Section title="3. Sign-in">
        <p>
          Sign-in is handled through our authentication provider, WorkOS, Inc.
          (AuthKit). You can sign in with a Microsoft work or school account,
          Google, Apple, a passkey, a one-time email link, or email and
          password. Whichever method you choose, we process the profile data it
          returns, in particular your display name and email address, together
          with the identifier WorkOS assigns to your account. Where you sign in
          with a Microsoft account, we additionally receive your Microsoft
          object ID and tenant ID. This data is required to provide the account
          (Art. 6(1)(b) GDPR).
        </p>
        <p>
          WorkOS processes this sign-in data in the United States; the transfer
          is based on the EU Standard Contractual Clauses (see the subprocessor
          list below). Sessions are then maintained by a first-party, HTTP-only
          cookie set by LicenseMeter (see our{" "}
          <a
            href="/cookies"
            className="hover:text-ink underline underline-offset-4"
          >
            Cookie Policy
          </a>
          ).
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
          disconnected. Where the organization connects its Microsoft tenant
          using its own application registration (&ldquo;bring your own&rdquo;),
          the credentials it supplies are stored encrypted (AES-256-GCM) and
          used solely for the read-only sync; they are never logged or
          disclosed. A data processing agreement (DPA) is provided to each
          organization before production use.
        </p>
      </Section>

      <Section title="5. Free service">
        <p>
          LicenseMeter is free to use. We do not collect payment methods or
          process subscription payments for the Service.
        </p>
      </Section>

      <Section title="6. Support conversations">
        <p>
          Crisp provides the support chat available across our website and
          dashboard. Loading the chat connects your browser to Crisp and shares
          technical connection information, including your IP address and the
          page URL. Messages and contact details you choose to provide are
          processed to respond to your request. We do not automatically attach
          your account profile, connector credentials or scan results to the
          chat.
        </p>
        <p>
          Resend delivers support form submissions by email. Submission limits
          and a hidden spam field help prevent abuse. Where enabled, Cloudflare
          Turnstile additionally verifies submissions. Please do not include
          passwords, access tokens or tenant exports in support messages.
        </p>
        <p>
          For details about the chat provider, see{" "}
          <a
            href="https://crisp.chat/en/privacy/"
            className="underline underline-offset-4"
          >
            Crisp’s privacy policy
          </a>
          . Contact {SUPPORT_EMAIL} for questions about or deletion of your
          support conversation.
        </p>
      </Section>

      <Section title="7. Subprocessors">
        <p>
          We engage the following subprocessors to process personal data on your
          behalf:
        </p>
        <ul className="flex flex-col gap-1.5">
          {SUBPROCESSORS.map((sp) => (
            <li key={sp.name} className="flex gap-2.5">
              <span aria-hidden="true" className="text-moss mt-0.5">
                ·
              </span>
              <span>
                <span className="text-ink">{sp.name}</span>: {sp.purpose},{" "}
                {sp.location} ({sp.basis}).
              </span>
            </li>
          ))}
        </ul>
        <p>
          The current list is part of the{" "}
          <a
            href="/dpa"
            className="hover:text-ink underline underline-offset-4"
          >
            DPA
          </a>
          .
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

      <Section title="8. Retention">
        <p>
          Account and product data is stored for as long as the workspace is
          connected. On disconnect, all synchronized data is deleted; remaining
          copies in routine encrypted backups are overwritten within the backup
          rotation window (currently around seven days). The hosting
          provider&rsquo;s server logs are subject to that provider&rsquo;s
          deletion periods.
        </p>
      </Section>

      <Section title="9. Your rights">
        <p>
          You have the right of access (Art. 15), rectification (Art. 16),
          erasure (Art. 17), restriction of processing (Art. 18), data
          portability (Art. 20) and objection (Art. 21 GDPR), as well as the
          right to lodge a complaint with a supervisory authority (Art. 77
          GDPR). For data we process on behalf of your organization, please
          contact your organization as the controller in the first instance.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>Privacy questions: {SUPPORT_EMAIL}</p>
      </Section>
    </main>
  );
}
