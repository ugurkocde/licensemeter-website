import Link from "next/link";

import { buttonClass } from "~/components/ui";

/**
 * Shown on the dashboard when a workspace has connected no service yet. Sign-in
 * no longer forces a Microsoft connect gate (workspace-first onboarding): the
 * user lands here and chooses the supported first step: connect Microsoft 365
 * or use the no-admin CSV assessment. SaaS connectors unlock once a directory
 * exists so their seats can be correlated to people.
 *
 * Connector logos are intentionally not used (vendor brand-usage constraints):
 * a neutral monogram + the product name only.
 */

type Tile = {
  name: string;
  /** One-line value: what this connector surfaces. */
  blurb: string;
  href: string;
};

const SECONDARY: Tile[] = [
  {
    name: "Adobe",
    blurb: "Creative Cloud / Acrobat seats",
    href: "/app/connectors/adobe",
  },
  { name: "Zoom", blurb: "Licensed Zoom seats", href: "/app/connectors/zoom" },
  {
    name: "Atlassian",
    blurb: "Jira & Confluence seats",
    href: "/app/connectors/atlassian",
  },
  {
    name: "Salesforce",
    blurb: "User licenses",
    href: "/app/connectors/salesforce",
  },
  {
    name: "OpenAI",
    blurb: "API spend and organization members",
    href: "/app/connectors/openai",
  },
  {
    name: "Anthropic",
    blurb: "Claude API costs and console members",
    href: "/app/connectors/anthropic",
  },
  {
    name: "ChatGPT",
    blurb: "Workspace seats (CSV)",
    href: "/app/connectors/chatgpt",
  },
  {
    name: "Claude",
    blurb: "Workspace seats (CSV)",
    href: "/app/connectors/claude",
  },
];

const Monogram = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="border-line bg-canvas font-display text-ink-soft flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm"
  >
    {name.charAt(0)}
  </span>
);

export const OnboardingEmptyState = ({
  organizationHint,
}: {
  /** Set when the person's organization already has another workspace. */
  organizationHint?: { requestPending: boolean } | null;
}) => (
  <div className="mx-auto max-w-3xl py-6">
    {organizationHint && (
      <aside
        aria-label="Your organization's workspace"
        className="rise rise-1 border-brand/20 bg-brand-soft text-brand-text mb-6 rounded-xl border p-4 text-sm"
      >
        <p className="font-semibold">
          Your organization already uses LicenseMeter
        </p>
        <p className="mt-1">
          {organizationHint.requestPending
            ? "Your request to join its workspace is waiting for an owner or admin there. Once approved, it opens the next time you visit LicenseMeter. Until then you can use this workspace of your own."
            : "Its data is in a separate workspace. Ask an owner or admin there to invite you. Once they do, it opens the next time you visit LicenseMeter."}
        </p>
      </aside>
    )}
    <header className="rise rise-1">
      <p className="text-brand-text text-xs font-medium tracking-[0.14em] uppercase">
        Get started
      </p>
      <h1 className="font-display mt-3 text-3xl tracking-tight">
        Add your Microsoft 365 directory
      </h1>
      <p className="text-ink-soft mt-2 max-w-xl text-sm leading-relaxed">
        LicenseMeter reads your seats read-only and prices every wasted,
        inactive or orphaned license in euros. Connect Microsoft 365 for the
        complete analysis, or upload its license export for a no-admin preview.
        Scans, findings, reports and exports are free, with no time limit.
      </p>
    </header>

    {/* Microsoft 365 is the directory all SaaS seats are correlated against. */}
    <Link
      href="/app/connectors/microsoft"
      data-tour="connect-cta"
      className="rise rise-2 group border-line bg-card hover:border-ink-soft mt-6 block border p-5 transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Monogram name="Microsoft 365" />
          <div>
            <p className="text-ink font-medium">Microsoft 365</p>
            <p className="text-ink-soft mt-0.5 text-sm">
              Directory, license assignments and usage, usually the biggest
              source of waste. Read-only, one-time admin consent.
            </p>
          </div>
        </div>
        <span
          className={buttonClass("primary", "hidden shrink-0 sm:inline-flex")}
        >
          Connect Microsoft 365
        </span>
      </div>
    </Link>

    <Link
      href="/app/connect/csv"
      className="rise rise-2 border-line bg-card hover:border-ink-soft mt-3 flex min-h-20 items-center gap-3 border px-5 py-4 transition-colors"
    >
      <Monogram name="CSV" />
      <span className="min-w-0">
        <span className="text-ink block text-sm font-medium">
          No Microsoft admin access?
        </span>
        <span className="text-ink-soft mt-0.5 block text-sm">
          Upload a Microsoft license export for an immediate assessment.
        </span>
      </span>
    </Link>

    <div className="rise rise-3 mt-7 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-lg">Add more sources afterward</h2>
        <p className="text-ink-soft mt-1 text-sm">
          These connectors unlock after Microsoft 365 is connected.
        </p>
      </div>
    </div>
    <div className="rise rise-3 border-line bg-line mt-3 grid gap-px border sm:grid-cols-2">
      {SECONDARY.map((t) => (
        <div
          key={t.name}
          className="bg-card flex min-h-16 items-center gap-3 px-4 py-3.5"
        >
          <Monogram name={t.name} />
          <span className="min-w-0">
            <span className="text-ink block text-sm font-medium">{t.name}</span>
            <span className="text-ink-faint block truncate text-xs">
              {t.blurb}
            </span>
          </span>
          <span className="text-ink-faint ml-auto shrink-0 text-[11px] font-medium tracking-wide uppercase">
            After Microsoft
          </span>
        </div>
      ))}
    </div>

    <div className="rise rise-3 text-ink-soft mt-4 text-sm">
      <Link
        href="/security"
        className="text-ink inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
      >
        Review the read-only permissions before connecting
      </Link>
    </div>
  </div>
);
