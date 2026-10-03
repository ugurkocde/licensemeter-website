import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ButtonAnchor, ButtonLink, Card, Pill } from "~/components/ui";
import { MeteringSetup } from "~/components/workspace/MeteringSetup";
import { fmtDate } from "~/lib/format";
import { METERED_APPS, meteringSignal, SIGNAL_LABELS } from "~/lib/metering";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { meteringConnections, meteringDevices } from "~/server/db/schema";
import { meteringDemoRows } from "~/server/metering/demo";
import { meteringConfigured, METERING_ERRORS } from "~/server/metering/graph";

export const metadata = { title: "Software Metering" };
const ERRORS: Record<string, string> = {
  ...METERING_ERRORS,
  invalid_state:
    "This consent request expired or was already used. Start a new request from this workspace.",
  not_allowed:
    "A workspace Admin must start and finish metering consent in the same session.",
  consent_declined:
    "Metering consent was declined. No new metering access was enabled.",
  wrong_tenant:
    "Approve consent for the Microsoft tenant connected to this workspace.",
  enable_first: "Enable Software Metering before granting consent.",
  rate_limited: "Please wait before starting another consent request.",
};

export default async function MeteringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const app = METERED_APPS.find((a) => a.id === sp.app) ?? METERED_APPS[0];
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  const demo = ctx.tenant.isDemo;
  const total = demo
    ? 5
    : ((
        await db
          .select({ count: sql<number>`count(*)::int` })
          .from(meteringDevices)
          .where(eq(meteringDevices.tenantId, ctx.tenant.id))
      )[0]?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.max(
    1,
    Math.min(pages, Number.parseInt(String(sp.page ?? "1"), 10) || 1),
  );
  const rows = demo
    ? meteringDemoRows()
    : await db.query.meteringDevices.findMany({
        where: eq(meteringDevices.tenantId, ctx.tenant.id),
        orderBy: [
          asc(meteringDevices.deviceName),
          asc(meteringDevices.deviceId),
        ],
        limit: 50,
        offset: (page - 1) * 50,
      });
  const days = connection?.inactivityDays ?? 60;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-brand-deep text-xs font-medium tracking-widest uppercase">
            Windows application evidence
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-tight">
            Software Metering
          </h1>
          <p className="text-ink-soft mt-2 max-w-2xl text-sm">
            See when selected Windows applications were last launched and where
            collection needs attention. Review licenses with the observation
            period in view.
          </p>
        </div>
        {total > 0 && !demo && (
          <ButtonAnchor href={`/api/export/metering?app=${app.id}`}>
            Export application CSV
          </ButtonAnchor>
        )}
      </header>
      {demo && (
        <div className="border-brand bg-brand-soft rounded-xl border p-4 text-sm">
          <strong>Sample metering report.</strong> These fictional devices show
          how collection quality changes the evidence. No Microsoft permissions
          or Windows devices are connected.
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="bg-danger-soft text-danger-text rounded-xl p-4 text-sm"
        >
          {error}
        </p>
      )}
      {connection?.lastError && (
        <p
          role="alert"
          className="bg-gold-soft text-ink rounded-xl p-4 text-sm"
        >
          {connection.lastError} Previously collected data is shown for
          reference; observations are marked unknown until a successful refresh.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Windows devices in Intune", String(total)],
          ["Observation period", `${days} days`],
          [
            "Last metering refresh",
            demo
              ? "Sample data"
              : connection?.lastSyncAt
                ? fmtDate(connection.lastSyncAt)
                : "Awaiting collection",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-line bg-card shadow-card rounded-2xl border p-5"
          >
            <p className="text-ink-faint text-xs">{label}</p>
            <p className="font-display mt-2 text-xl">{value}</p>
          </div>
        ))}
      </div>
      {(demo || connection?.scriptId) && (
        <Card title="Application observations">
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Application
              <select
                name="app"
                defaultValue={app.id}
                className="border-line-input bg-card mt-1 block min-h-11 rounded-lg border p-2"
              >
                {METERED_APPS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="border-line hover:bg-subtle min-h-11 rounded-lg border px-4 text-sm"
              type="submit"
            >
              Show application
            </button>
          </form>
          <p className="text-ink-soft mb-4 text-sm">
            Tracks <code>{app.executable}</code>. A process launch does not
            establish active working time. Installation, license ownership,
            background launches, and use on other platforms need separate
            review.
          </p>
          {rows.length === 0 ? (
            <p className="text-ink-soft p-5 text-sm">
              No Windows device observations yet. Confirm the collector
              assignment and auditing policy, let a pilot device report, then
              refresh. Empty results do not mean applications are unused.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {app.name} launch observations over {days} days
                </caption>
                <thead className="border-line text-ink-faint border-b text-xs">
                  <tr>
                    {[
                      "Device",
                      "Last observed launch",
                      "Coverage begins",
                      "Report date",
                      "Evidence",
                    ].map((title) => (
                      <th
                        key={title}
                        scope="col"
                        className="px-3 py-3 font-medium"
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const signal = connection?.lastError
                      ? "unknown"
                      : meteringSignal(row.payload, app.id, days);
                    const last = row.payload?.apps.find(
                      ([id]) => id === app.id,
                    )?.[1];
                    return (
                      <tr
                        key={row.deviceId}
                        className="border-line border-b last:border-b-0"
                      >
                        <th scope="row" className="px-3 py-4 font-medium">
                          {row.deviceName}
                        </th>
                        <td className="px-3 py-4 whitespace-nowrap">
                          {last ? fmtDate(last) : "Not observed"}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          {row.payload ? fmtDate(row.payload.start) : "Unknown"}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          {row.payload
                            ? fmtDate(row.payload.end)
                            : "No valid report"}
                        </td>
                        <td className="px-3 py-4">
                          <Pill
                            tone={
                              signal === "observed"
                                ? "good"
                                : signal === "review"
                                  ? "gold"
                                  : "slate"
                            }
                          >
                            {SIGNAL_LABELS[signal]}
                          </Pill>
                          {signal === "unknown" && (
                            <p className="text-ink-faint mt-1 text-xs">
                              {row.status === "audit_disabled"
                                ? "Enable process auditing"
                                : row.status === "no_report"
                                  ? "No collector result"
                                  : "Check collection health"}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-ink-faint mt-4 text-xs">
            “No launch observed” requires {days} days of collector coverage
            ending at the report date. Reports older than eight days are stale.
            A device may be unassigned or offline; missing results remain
            unknown.
          </p>
          {pages > 1 && (
            <nav
              className="mt-4 flex items-center gap-4"
              aria-label="Metering pages"
            >
              {page > 1 && (
                <ButtonLink
                  href={`/app/metering?app=${app.id}&page=${page - 1}`}
                >
                  Previous
                </ButtonLink>
              )}
              <span className="text-ink-soft text-sm">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <ButtonLink
                  href={`/app/metering?app=${app.id}&page=${page + 1}`}
                >
                  Next
                </ButtonLink>
              )}
            </nav>
          )}
        </Card>
      )}
      {!demo && (
        <Card
          title={
            connection ? "Collection setup" : "Enable metering when you need it"
          }
        >
          <p className="text-ink-soft mb-4 text-sm">
            Requires supported Intune-managed Windows devices, Microsoft Entra
            join or hybrid join, and qualifying Remediations licenses (Windows
            Enterprise E3/E5, Education A3/A5, or Windows VDA per user). Start
            with a pilot before deploying broadly.
          </p>
          {hasRole(ctx, "admin") ? (
            <MeteringSetup
              key={connection?.id ?? "disabled"}
              enabled={Boolean(connection)}
              consented={Boolean(connection?.consentedAt)}
              configured={meteringConfigured()}
              microsoftConnected={Boolean(
                ctx.tenant.tid && ctx.tenant.consentedAt,
              )}
              scriptId={connection?.scriptId ?? null}
              scriptName={connection?.scriptName ?? null}
              days={days}
            />
          ) : (
            <p className="text-ink-soft text-sm">
              Ask a workspace Admin to enable and configure Software Metering.
            </p>
          )}
        </Card>
      )}
      <p className="text-ink-faint max-w-3xl text-xs leading-relaxed">
        Metering is optional and uses separate consent. The collector sends
        application keys, last-launch dates, and coverage health. Device names
        and identifiers come from Intune. These records may relate to employees;
        review your organization’s requirements before enabling collection.{" "}
        <Link
          className="underline"
          href="https://docs.licensemeter.com/connectors/windows-metering/"
        >
          Read setup, retention, and removal instructions
        </Link>
        .
      </p>
    </div>
  );
}
