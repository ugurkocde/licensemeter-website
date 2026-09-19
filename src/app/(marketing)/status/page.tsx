import type { Metadata } from "next";
import Link from "next/link";

import { EXTERNAL_STATUS_LINKS, type StatusLevel } from "~/lib/statusProviders";
import { getStatusOverview } from "~/server/status";

export const metadata: Metadata = {
  title: "System status",
  description:
    "Live operational status for LicenseMeter and the infrastructure it relies on: Vercel, Supabase, Microsoft Entra ID and Resend.",
};

// Incremental static regeneration: probes run at most once a minute, shared
// across all visitors, so the page stays cheap and the upstream feeds are not
// hammered on every request.
export const revalidate = 60;

const LEVEL_META: Record<
  StatusLevel,
  { label: string; dot: string; pill: string }
> = {
  operational: {
    label: "Operational",
    dot: "bg-good",
    pill: "bg-good-soft text-good-text",
  },
  degraded: {
    label: "Degraded performance",
    dot: "bg-waste",
    pill: "bg-waste-soft text-waste-text",
  },
  partial: {
    label: "Partial outage",
    dot: "bg-waste",
    pill: "bg-waste-soft text-waste-text",
  },
  outage: {
    label: "Major outage",
    dot: "bg-danger",
    pill: "bg-danger-soft text-danger-text",
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-slate-ink",
    pill: "bg-slate-soft text-slate-ink",
  },
  unknown: {
    label: "Status unavailable",
    dot: "bg-ink-faint",
    pill: "bg-subtle text-ink-faint",
  },
};

const OVERALL_HEADLINE: Record<StatusLevel, string> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial service disruption",
  outage: "Major service outage",
  maintenance: "Scheduled maintenance",
  unknown: "Status partially unavailable",
};

function StatusDot({ level }: { level: StatusLevel }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_META[level].dot}`}
      aria-hidden="true"
    />
  );
}

function StatusPill({ level }: { level: StatusLevel }) {
  const meta = LEVEL_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.pill}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

function formatChecked(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default async function StatusPage() {
  const { overall, services, providers, checkedAt } = await getStatusOverview();
  const overallMeta = LEVEL_META[overall];

  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        System status
      </p>

      {/* Overall banner. Tinted by the worst of LicenseMeter's own services. */}
      <div
        className={`border-line mt-4 flex flex-col gap-3 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between ${overallMeta.pill}`}
      >
        <div className="flex items-center gap-3">
          <StatusDot level={overall} />
          <h1 className="font-display text-2xl tracking-tight">
            {OVERALL_HEADLINE[overall]}
          </h1>
        </div>
        <p className="text-xs font-medium opacity-80">
          Checked {formatChecked(checkedAt)} UTC
        </p>
      </div>

      <p className="text-ink-soft mt-4 text-sm leading-relaxed">
        Live status for LicenseMeter and the infrastructure it runs on. Our own
        services are probed directly; the providers below report their own
        health, refreshed about once a minute.
      </p>

      <Section title="LicenseMeter">
        <ul className="border-line bg-card overflow-hidden rounded-xl border">
          {services.map((service) => (
            <li
              key={service.name}
              className="border-line flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium">{service.name}</p>
                <p className="text-ink-faint text-xs">{service.description}</p>
              </div>
              <StatusPill level={service.level} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Infrastructure and subprocessors">
        <ul className="border-line bg-card overflow-hidden rounded-xl border">
          {providers.map((provider) => (
            <li
              key={provider.key}
              className="border-line flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-ink text-sm font-medium">
                    {provider.name}
                  </p>
                  <a
                    href={provider.statusPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${provider.name} status details`}
                    className="text-ink-faint hover:text-ink text-xs underline-offset-4 hover:underline"
                  >
                    details &rarr;
                  </a>
                </div>
                <p className="text-ink-faint text-xs">
                  {provider.purpose} &middot; {provider.location}
                </p>
              </div>
              <StatusPill level={provider.level} />
            </li>
          ))}
          {EXTERNAL_STATUS_LINKS.map((link) => (
            <li
              key={link.key}
              className="border-line flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium">{link.name}</p>
                <p className="text-ink-faint text-xs">
                  {link.purpose} &middot; {link.location}
                </p>
              </div>
              <a
                href={link.statusPageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Check ${link.name} status`}
                className="border-line-strong text-ink-soft hover:border-brand hover:text-ink shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium underline-offset-4"
              >
                Check status &rarr;
              </a>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-3 text-xs leading-relaxed">
          Microsoft 365 and Entra ID have no public machine-readable feed, so
          their status is a direct link. The full subprocessor list lives on the{" "}
          <Link
            href="/trust-center#subprocessors"
            className="text-ink-soft hover:text-ink underline underline-offset-4"
          >
            Trust Center
          </Link>
          .
        </p>
      </Section>

      <p className="text-ink-faint border-line mt-10 border-t pt-6 text-xs leading-relaxed">
        This page runs inside the LicenseMeter application, so it cannot report
        a full platform outage on its own. For incidents, watch the provider
        feeds above or contact support.
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
