import Link from "next/link";

import { buttonClass } from "~/components/ui";

/**
 * Shown on the dashboard when a workspace has connected no service yet. Sign-in
 * no longer forces a Microsoft connect gate (workspace-first onboarding): the
 * user lands here and is nudged to connect their FIRST service — any connector,
 * not just Microsoft. The trial clock only starts once they connect one.
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
  { name: "Adobe", blurb: "Creative Cloud / Acrobat seats", href: "/app/settings/adobe" },
  { name: "Zoom", blurb: "Licensed Zoom seats", href: "/app/settings/zoom" },
  { name: "Atlassian", blurb: "Jira & Confluence seats", href: "/app/settings/atlassian" },
  { name: "Salesforce", blurb: "User licenses", href: "/app/settings/salesforce" },
  { name: "ChatGPT", blurb: "Workspace seats (CSV)", href: "/app/settings/chatgpt" },
  { name: "Claude", blurb: "Workspace seats (CSV)", href: "/app/settings/claude" },
];

const Monogram = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas font-display text-sm text-ink-soft"
  >
    {name.charAt(0)}
  </span>
);

export const OnboardingEmptyState = ({
  demoEnabled,
}: {
  demoEnabled: boolean;
}) => (
  <div className="mx-auto max-w-3xl py-6">
    <header className="rise rise-1">
      <p className="text-brand-text text-xs font-medium tracking-[0.14em] uppercase">
        Get started
      </p>
      <h1 className="font-display mt-3 text-3xl tracking-tight">
        Connect your first service
      </h1>
      <p className="text-ink-soft mt-2 max-w-xl text-sm leading-relaxed">
        LicenseMeter reads your seats read-only and prices every wasted, inactive
        or orphaned license in euros. Connect one service to see your numbers —
        your 14-day trial only starts once you do.
      </p>
    </header>

    {/* Microsoft 365 — the highest-value source, featured but not required. */}
    <Link
      href="/app/settings/microsoft"
      className="rise rise-2 group mt-6 block border border-line bg-card p-5 transition hover:border-ink-soft"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Monogram name="Microsoft 365" />
          <div>
            <p className="font-medium text-ink">Microsoft 365</p>
            <p className="text-ink-soft mt-0.5 text-sm">
              Directory, license assignments and usage — usually the biggest
              source of waste. Read-only, one-time admin consent.
            </p>
          </div>
        </div>
        <span
          className={buttonClass("primary", "hidden shrink-0 sm:inline-flex")}
        >
          Connect
        </span>
      </div>
    </Link>

    {/* Other connectors. */}
    <div className="rise rise-3 mt-3 grid gap-px border border-line bg-line sm:grid-cols-2">
      {SECONDARY.map((t) => (
        <Link
          key={t.name}
          href={t.href}
          className="flex items-center gap-3 bg-card px-4 py-3.5 transition hover:bg-canvas"
        >
          <Monogram name={t.name} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{t.name}</span>
            <span className="text-ink-faint block truncate text-xs">
              {t.blurb}
            </span>
          </span>
        </Link>
      ))}
    </div>

    {/* Low-commitment fallbacks. */}
    <div className="rise rise-3 text-ink-soft mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>No admin access yet?</span>
      <Link
        href="/app/connect/csv"
        className="font-medium text-ink underline-offset-4 hover:underline"
      >
        Start with a CSV upload
      </Link>
      {demoEnabled && (
        <>
          <span className="text-ink-faint">·</span>
          <Link
            href="/app/settings/microsoft"
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            See the read-only permissions first
          </Link>
        </>
      )}
    </div>
  </div>
);
