import Link from "next/link";
import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { MeteringDisable } from "~/components/workspace/MeteringDisable";
import {
  MeteringFootnote,
  MeteringHeader,
  MeteringLocked,
  SetupProgress,
} from "~/components/workspace/MeteringParts";
import { MeteringRefresh } from "~/components/workspace/MeteringRefresh";
import {
  MeteringConnect,
  MeteringSettingsForm,
  MeteringVerify,
} from "~/components/workspace/MeteringSetupActions";
import { METERING_SCOPES } from "~/lib/metering";
import { requireAccess } from "~/server/access";
import { METERING_ERRORS } from "~/server/metering/graph";
import { loadMetering } from "~/server/metering/view";

export const metadata = { title: "Software Metering setup" };
export const maxDuration = 300;
const ERRORS: Record<string, string> = {
  ...METERING_ERRORS,
  invalid_state:
    "This consent request expired or was already used. Connect again from this page.",
  not_allowed:
    "A workspace Admin must start and finish the Microsoft consent in the same session.",
  consent_declined: "Microsoft consent was declined. Nothing was connected.",
  wrong_tenant:
    "Approve consent for the Microsoft tenant connected to this workspace.",
  enable_first: "Connect Software Metering from this page first.",
  rate_limited: "Please wait a moment before connecting again.",
  plan_required: "Software Metering is included in the Pro plan.",
};

const Step = ({
  id,
  number,
  title,
  done,
  children,
}: {
  id: string;
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className="border-line bg-card shadow-card scroll-mt-6 rounded-2xl border p-5"
  >
    <h2 id={`${id}-title`} className="flex items-center gap-3 font-medium">
      <span
        aria-hidden="true"
        className={`grid size-7 place-items-center rounded-full text-sm ${
          done ? "bg-brand text-white" : "border-brand text-brand-deep border-2"
        }`}
      >
        {done ? "✓" : number}
      </span>
      {title}
      {done && <span className="sr-only">, done</span>}
    </h2>
    <div className="mt-3 flex flex-col gap-3 pl-10 text-sm">{children}</div>
  </section>
);

export default async function MeteringSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const view = await loadMetering(ctx);
  if (!view.allowed)
    return (
      <MeteringLocked
        view={view}
        overQuantity={ctx.entitlement.state === "overQuantity"}
      />
    );
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  const { connection, report, summary, step } = view;
  const connected = step !== "connect";
  const collector = report?.collector ?? null;

  if (view.demo || !view.admin)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <MeteringHeader
          view={view}
          title="Setup"
          lead="Connect Microsoft, deploy the collector in Intune, and wait for the first report."
          actions={false}
        />
        <Card title="Setup">
          <SetupProgress step={step} />
          <p className="text-ink-soft mt-4 text-sm">
            {view.demo
              ? "The sample workspace is already set up."
              : "A workspace Admin sets up Software Metering."}
          </p>
        </Card>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <MeteringHeader
        view={view}
        title="Setup"
        lead="Three steps: connect Microsoft, deploy the collector in Intune, and wait for the first report. LicenseMeter only reads; it never changes anything in your tenant."
        actions={false}
      />
      {error && (
        <p
          role="alert"
          className="bg-danger-soft text-danger-text rounded-xl p-4 text-sm"
        >
          {error}
        </p>
      )}
      {view.readError && (
        <p
          role="alert"
          className="bg-gold-soft text-ink rounded-xl p-4 text-sm"
        >
          {view.readError}
        </p>
      )}

      <Step
        id="connect"
        number={1}
        title="Connect to Microsoft"
        done={connected}
      >
        {connected ? (
          <p className="text-ink-soft">
            Connected with read-only access to Intune scripts, devices and apps.
          </p>
        ) : !view.microsoftConnected ? (
          <p className="text-ink-soft">
            Connect Microsoft 365 first, then come back here.{" "}
            <Link className="underline" href="/app/connectors">
              Open connectors
            </Link>
          </p>
        ) : !view.configured ? (
          <p className="text-ink-soft">
            Software Metering is not configured on this installation yet.
          </p>
        ) : (
          <>
            <p className="text-ink-soft">
              A Global Administrator approves a separate, read-only app. Your
              Microsoft 365 connection keeps its own permissions.
            </p>
            <ul className="text-ink-faint space-y-0.5 text-xs">
              {METERING_SCOPES.map((scope) => (
                <li key={scope}>
                  <code>{scope}</code>
                </li>
              ))}
            </ul>
            <MeteringConnect
              enabled={Boolean(connection)}
              label="Connect Software Metering"
            />
            {connection && <MeteringVerify />}
          </>
        )}
      </Step>

      <Step
        id="deploy"
        number={2}
        title="Deploy the collector in Intune"
        done={Boolean(collector) && !summary?.notWatched.length}
      >
        {!connected ? (
          <p className="text-ink-faint">Available after step 1.</p>
        ) : (
          <>
            {collector ? (
              summary?.notWatched.length ? (
                <p className="bg-waste-soft rounded-lg p-3">
                  <strong>
                    {summary.notWatched.length === 1
                      ? "1 new app is not watched yet"
                      : `${summary.notWatched.length} new apps are not watched yet`}
                    :
                  </strong>{" "}
                  {summary.notWatched
                    .slice(0, 6)
                    .map((entry) => entry.name)
                    .join(", ")}
                  {summary.notWatched.length > 6 ? ", …" : ""}. Download the
                  collector again and replace the detection script in “
                  {collector.name}”. The assignment stays as it is.
                </p>
              ) : (
                <p className="text-good-text">
                  Found in Intune: “{collector.name}”, with the current app list
                  ({collector.programs.length} program files).
                </p>
              )
            ) : (
              <p className="text-ink-soft">
                LicenseMeter has not found the collector in Intune yet. It looks
                for it automatically, so you never select a package.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ButtonAnchor
                variant={
                  collector && !summary?.notWatched.length
                    ? "secondary"
                    : "primary"
                }
                href="/api/metering/collector"
                download
              >
                Download collector
              </ButtonAnchor>
              <MeteringRefresh />
            </div>
            {!collector && (
              <ol className="text-ink-soft list-decimal space-y-1 pl-5">
                <li>
                  Turn on <strong>Audit Process Creation (Success)</strong> for
                  your devices, for example in an Intune settings catalog
                  policy.
                </li>
                <li>
                  In Intune, open{" "}
                  <strong>Devices › Scripts and remediations</strong> and create
                  a script package.
                </li>
                <li>
                  Upload the downloaded file as the{" "}
                  <strong>detection script</strong>. Leave the remediation
                  script empty.
                </li>
                <li>
                  Run as SYSTEM (logged-on credentials: <strong>No</strong>), in
                  64-bit PowerShell (<strong>Yes</strong>).
                </li>
                <li>
                  Assign it to a small pilot group with an{" "}
                  <strong>hourly</strong> schedule, then return here and select{" "}
                  <strong>Read latest results</strong>.
                </li>
              </ol>
            )}
            {(report?.collectors.length ?? 0) > 1 && !collector && (
              <p className="text-waste-text">
                Several packages run the collector. Choose one under Settings.
              </p>
            )}
          </>
        )}
      </Step>

      <Step
        id="first-report"
        number={3}
        title="First device report"
        done={step === "done"}
      >
        {step === "done" && summary ? (
          <>
            <p className="text-ink-soft">
              {summary.reporting} of {summary.devices} Windows devices are
              reporting. Collection is running.
            </p>
            <div>
              <ButtonLink variant="primary" href="/app/metering">
                Open the dashboard
              </ButtonLink>
            </div>
          </>
        ) : collector ? (
          <p className="text-ink-soft">
            Waiting for the first device. After assignment, Intune runs the
            collector within the hour, and it can take a few more hours until
            the result is visible here.
          </p>
        ) : (
          <p className="text-ink-faint">Available after step 2.</p>
        )}
      </Step>

      {connection && (
        <Card title="Settings">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-ink-soft mb-3 text-sm">
                “App not started” needs continuous coverage for the whole
                observation period.
              </p>
              <MeteringSettingsForm
                days={view.days}
                packages={(report?.collectors ?? []).map(({ id, name }) => ({
                  id,
                  name,
                }))}
                selected={connection.scriptId}
              />
            </div>
            <div className="border-line border-t pt-4">
              <MeteringDisable />
            </div>
          </div>
        </Card>
      )}
      <MeteringFootnote />
    </div>
  );
}
