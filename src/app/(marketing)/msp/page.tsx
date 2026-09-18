import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { buttonClass } from "~/components/ui";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { SUPPORT_MAILTO } from "~/lib/support";

export const metadata: Metadata = {
  title: "For MSPs",
  description:
    "LicenseMeter for Microsoft 365 MSPs: every client tenant in one portfolio sorted by monthly waste, connected through admin consent instead of shared credentials, with per-client price books and a PDF waste report for every QBR.",
};

const STEPS = [
  {
    n: "01",
    title: "You start the connection",
    body: "Sign in with your own account and open a connect link for the client tenant. No client passwords, no shared admin accounts, no partner delegation to set up.",
  },
  {
    n: "02",
    title: "Their admin grants consent",
    body: "A Global Administrator or Privileged Role Administrator on the client side approves Microsoft's standard admin-consent dialog. The permissions are read-only, and the grant lands in their audit log.",
  },
  {
    n: "03",
    title: "The workspace is yours",
    body: "The workspace binds to your account the moment consent lands, and the first sync starts. The client keeps control: they can revoke the enterprise app in Entra ID at any time.",
  },
] as const;

const FEATURES = [
  {
    title: "One portfolio, sorted by waste",
    body: "Seats, spend, monthly waste, open findings and sync health for every client in a single table. It sorts by waste, so the tenant that needs attention this week is always at the top.",
  },
  {
    title: "A price book per client",
    body: "Each workspace has its own currency and prices. Microsoft list prices are prefilled, and you overwrite them per SKU with the client's negotiated rates. Every finding is priced in their numbers.",
  },
  {
    title: "The QBR deliverable, already written",
    body: "A PDF waste report per tenant covers spend, waste and every finding with its monthly cost. CSV exports go to the client's finance team, and generated PowerShell scripts go to their IT team to review and run.",
  },
  {
    title: "A weekly digest, sent for you",
    body: "Every workspace emails its owners and admins a weekly digest with the current waste number and the largest open findings. Invite the client's IT lead as an admin and they get the weekly digest between QBRs without logging in.",
  },
] as const;

const TRUST_ITEMS = [
  "Read-only application permissions. No write scope exists.",
  "Nothing changes in the client tenant unless their IT team reviews and runs the generated script themselves.",
  "Data stays in the EU (Postgres, Frankfurt).",
  "Disconnecting a workspace deletes its data immediately.",
] as const;

const BASE = siteUrl();

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const MSP_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "For MSPs",
      item: `${BASE}/msp`,
    },
  ],
};

/* CTA hierarchy mirrors the rest of the marketing site: the primary action is
 * self-serve sign-in (WorkOS AuthKit), landing the MSP on the portfolio page
 * where they can review connected client workspaces. The live demo and support
 * are available when sign-in is not configured. */
const Ctas = ({
  demoEnabled,
  signInOk,
  startHref,
}: {
  demoEnabled: boolean;
  signInOk: boolean;
  startHref: string;
}) => (
  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
    {signInOk ? (
      <a
        href={startHref}
        className={buttonClass("primary", "w-full sm:w-auto")}
      >
        Connect your first client
      </a>
    ) : (
      <a
        href={SUPPORT_MAILTO}
        className={buttonClass("primary", "w-full sm:w-auto")}
      >
        Talk to us
      </a>
    )}
    {demoEnabled && (
      <form action="/api/auth/demo" method="post">
        <button className={buttonClass("secondary", "w-full sm:w-auto")}>
          Open the live demo
        </button>
      </form>
    )}
    {signInOk && (
      <a
        href={SUPPORT_MAILTO}
        className="text-brand-text inline-flex min-h-11 items-center justify-center text-sm font-medium underline underline-offset-4 hover:opacity-80 sm:justify-start"
      >
        Talk to us
      </a>
    )}
  </div>
);

export default function MspPage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  /* Land on the MSP portfolio: create the account, then attach the first
   * client. Same returnTo pattern the homepage use. */
  const startHref = `${signInPath()}?returnTo=${encodeURIComponent("/app/portfolio")}`;

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        For managed service providers
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        Every client tenant. One portfolio, sorted by waste.
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        You run Microsoft 365 for five, twenty, fifty clients. LicenseMeter
        gives each of them a read-only workspace and gives you one view across
        all of them, ranked by what every client wastes per month. Open the
        highest-waste tenant first, and walk into the next QBR with the number
        already in hand.
      </p>
      <div className="mt-8">
        <Ctas
          demoEnabled={demoEnabled}
          signInOk={signInOk}
          startHref={startHref}
        />
        {signInOk && (
          <p className="text-ink-faint mt-3 text-xs">
            Sign in, connect the first client read-only, and see their waste
            number after the first sync.
          </p>
        )}
      </div>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Connecting a client takes one admin consent.
        </h2>
        <div className="mt-8 grid gap-10 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <div className="text-brand-text font-mono text-xs">{step.n}</div>
              <h3 className="font-display mt-3 text-xl tracking-tight">
                {step.title}
              </h3>
              <p className="text-ink-soft mt-3 text-sm leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-line bg-card mt-14 border px-6 py-6">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          The finding your clients pay you to catch
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          Offboarding is where client money leaks. Disabling the Entra account
          is the easy part. The Adobe, Zoom, Atlassian, Salesforce, OpenAI and
          Anthropic seats behind it keep billing until someone notices.
          LicenseMeter cross-checks every connected vendor seat against the
          client&rsquo;s directory, so the account you disabled months ago
          surfaces with the paid seats it still holds. The demo tenant shows the
          pattern: {DEMO_FIGURES.leaverCount} ex-employees still licensed,{" "}
          {DEMO_FIGURES.crossVendorLeaverCount} of them in connected apps.
          That&rsquo;s{" "}
          <span className="tnum text-waste-text font-mono">
            € {demoEuros(DEMO_FIGURES.byCategory.leavers)}
          </span>{" "}
          a month for people who already left.
        </p>
      </section>

      <section className="border-line bg-line mt-14 grid gap-px border sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-card px-6 py-6">
            <h2 className="font-display text-xl tracking-tight">{f.title}</h2>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              {f.body}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Answers for your client&rsquo;s security review.
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-relaxed">
          Your clients will ask what you just connected to their tenant. The
          answers are short.
        </p>
        <ul className="text-ink-soft mt-4 flex flex-col gap-2 text-sm">
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-moss mt-0.5">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-ink-soft mt-4 text-sm">
          The{" "}
          <Link
            href="/security"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            security overview
          </Link>{" "}
          lists every granted scope and what is stored. Forward it to the
          client&rsquo;s security team as is.
        </p>
      </section>

      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Start with the client you think wastes the most.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect the tenant you already have a hunch about, or walk through the
          demo workspace first. The connection is read-only, takes one admin
          consent, and the waste number is on screen after the first sync.
        </p>
        <div className="mt-8">
          <Ctas
            demoEnabled={demoEnabled}
            signInOk={signInOk}
            startHref={startHref}
          />
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(MSP_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
