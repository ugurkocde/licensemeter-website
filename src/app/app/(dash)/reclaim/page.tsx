import type { Metadata } from "next";
import Link from "next/link";

import { Card, Pill } from "~/components/ui";
import {
  FeatureLockPanel,
  PlanBadge,
} from "~/components/workspace/FeatureLock";
import {
  ReclaimApprovalModeForm,
  ReclaimByoForm,
  ReclaimConsentButton,
  ReclaimDisconnectButton,
  ReclaimVerifyButton,
} from "~/components/workspace/ReclaimSetup";
import { isComingSoon } from "~/components/billing/billingView";
import { byoConnectorEnabled } from "~/env";
import { fmtDate } from "~/lib/format";
import { APPROVAL_MODES, RECLAIM_DOCS, RECLAIM_ROLE } from "~/lib/reclaim";
import { hasRole, requireAccess } from "~/server/access";
import { hasFeature } from "~/server/entitlement";
import {
  loadReclaimConnection,
  reclaimReady,
  type ReclaimConnectionRow,
} from "~/server/reclaim/connection";
import { RECLAIM_ERRORS, reclaimConfigured } from "~/server/reclaim/graph";

export const metadata: Metadata = { title: "One-click reclaim" };

const ERRORS: Record<string, string> = {
  ...RECLAIM_ERRORS,
  invalid_state:
    "This consent request expired or was already used. Start it again from this page.",
  owner_required:
    "Only a workspace Owner can grant LicenseMeter write access to licenses, in the same browser session that started it.",
  demo: "The sample workspace does not change licenses.",
  plan_required: "One-click reclaim is included in the Pro plan.",
  microsoft_first: "Connect Microsoft 365 to this workspace first.",
  byo_connected:
    "This workspace uses your own app registration. Disconnect it before switching to LicenseMeter's app.",
  consent_declined: "Microsoft consent was declined. Nothing was connected.",
  wrong_tenant:
    "Approve consent for the Microsoft tenant connected to this workspace.",
  rate_limited: "Please wait a moment before connecting again.",
};

/** What the reclaim app can and cannot do, shown before anyone connects it. */
const Scope = () => (
  <ul className="text-ink-soft list-disc space-y-1.5 pl-5 text-sm">
    <li>
      Uses a separate Microsoft app with one application permission,{" "}
      <code className="text-ink text-xs">{RECLAIM_ROLE}</code>. Your Microsoft
      365 connector keeps its read-only permissions.
    </li>
    <li>
      Removes only licenses assigned directly to a user. Licenses a user gets
      through a group stay as they are and are shown as not reclaimable.
    </li>
    <li>
      Never edits users, groups, mailboxes or files, and never changes anything
      without an approved request. Every change is written to the audit log.
    </li>
    <li>
      A removal can be undone for 14 days, with the same disabled service plans
      the user had before.
    </li>
  </ul>
);

const StatusPill = ({
  connection,
  ready,
}: {
  connection: ReclaimConnectionRow | null;
  ready: boolean;
}) =>
  ready ? (
    <Pill tone="good">Connected</Pill>
  ) : connection ? (
    <Pill tone="gold">Consent pending</Pill>
  ) : (
    <Pill tone="slate">Not connected</Pill>
  );

export default async function ReclaimPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const error =
    typeof sp.error === "string" && Object.hasOwn(ERRORS, sp.error)
      ? ERRORS[sp.error]
      : null;
  const connection = await loadReclaimConnection(ctx.tenant.id);
  const isOwner = hasRole(ctx, "owner");
  const isAdmin = hasRole(ctx, "admin");
  const demo = ctx.tenant.isDemo || ctx.user.isDemo;

  if (!hasFeature(ctx.entitlement, "reclaim"))
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <FeatureLockPanel
          feature="reclaim"
          overQuantity={ctx.entitlement.state === "overQuantity"}
        />
        <Card title="How it works">
          <Scope />
        </Card>
        {/* Write access from an earlier plan can always be taken away. */}
        {connection && isAdmin && !demo && (
          <Card title="Existing connection">
            <p className="text-ink-soft mb-2 text-sm">
              LicenseMeter does not change licenses while your plan does not
              include reclaim. You can still remove its write access.
            </p>
            <ReclaimDisconnectButton />
          </Card>
        )}
      </div>
    );

  const ready = reclaimReady(connection, ctx.tenant.tid);
  const managed = reclaimConfigured();
  const byo = byoConnectorEnabled();
  const tid = ctx.tenant.tid;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-ink flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          One-click reclaim <PlanBadge feature="reclaim" />
        </h1>
        <p className="text-ink-soft text-sm leading-relaxed">
          Remove unused Microsoft 365 licenses from LicenseMeter, with approval
          and a 14-day undo, instead of running PowerShell. Reclaim is opt-in
          and uses its own Microsoft app, so connecting it is a separate
          decision from connecting Microsoft 365.
        </p>
        {isComingSoon("reclaim") && (
          <p className="bg-gold-soft text-ink rounded-xl p-3 text-sm">
            Coming soon: you can connect write access now. Requesting, approving
            and undoing removals arrive with the next release.
          </p>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="bg-danger-soft text-danger-text rounded-xl p-4 text-sm"
        >
          {error}
        </p>
      )}
      {sp.connected === "1" && ready && (
        <p
          role="status"
          className="bg-good-soft text-good-text rounded-xl p-4 text-sm"
        >
          Reclaim is connected. Microsoft granted {RECLAIM_ROLE} and nothing
          else.
        </p>
      )}

      <Card
        title="Write access"
        badge={<StatusPill connection={connection} ready={ready} />}
      >
        {demo ? (
          <p className="text-ink-soft text-sm">
            The sample workspace does not change licenses. Connect your own
            tenant to set up reclaim.
          </p>
        ) : !tid ? (
          <p className="text-ink-soft text-sm">
            Connect Microsoft 365 first, then come back here.{" "}
            <Link className="underline" href="/app/connectors">
              Open connectors
            </Link>
          </p>
        ) : ready ? (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-ink-faint">App</dt>
              <dd className="text-ink">
                {connection.mode === "managed"
                  ? "LicenseMeter reclaim app"
                  : "Your own app registration"}
                {connection.mode === "byo" && connection.appClientId && (
                  <span className="text-ink-soft ml-2 font-mono text-xs">
                    {connection.appClientId}
                  </span>
                )}
              </dd>
              <dt className="text-ink-faint">Permission</dt>
              <dd className="text-ink font-mono text-xs leading-5">
                {RECLAIM_ROLE}
              </dd>
              <dt className="text-ink-faint">Connected</dt>
              <dd className="text-ink">{fmtDate(connection.consentedAt)}</dd>
              {connection.secretExpiresAt && (
                <>
                  <dt className="text-ink-faint">Credential expires</dt>
                  <dd className="text-ink">
                    {fmtDate(connection.secretExpiresAt)}
                  </dd>
                </>
              )}
            </dl>
          </div>
        ) : !isOwner ? (
          <p className="text-ink-soft text-sm">
            A workspace Owner connects reclaim. Ask an Owner to open this page.
          </p>
        ) : (
          <div className="flex flex-col gap-5 text-sm">
            {managed && (
              <section className="flex flex-col gap-2">
                <h3 className="text-ink font-medium">
                  Use LicenseMeter&rsquo;s reclaim app
                </h3>
                <p className="text-ink-soft">
                  A Global Administrator or Privileged Role Administrator
                  approves the app in Microsoft. It asks for {RECLAIM_ROLE}{" "}
                  only.
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <ReclaimConsentButton
                    label={
                      connection
                        ? "Approve again in Microsoft"
                        : "Approve in Microsoft"
                    }
                  />
                  {connection?.mode === "managed" && <ReclaimVerifyButton />}
                </div>
                {connection?.lastVerifyError &&
                  RECLAIM_ERRORS[connection.lastVerifyError] && (
                    <p className="text-ink-soft text-xs">
                      Last check: {RECLAIM_ERRORS[connection.lastVerifyError]}
                    </p>
                  )}
              </section>
            )}
            {byo && (
              <details
                className="border-line rounded-xl border p-4"
                open={!managed}
              >
                <summary className="text-ink cursor-pointer font-medium">
                  Use your own app registration
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <ol className="text-ink-soft list-decimal space-y-1 pl-5">
                    <li>
                      In Microsoft Entra, register a new single-tenant app. Do
                      not reuse the app of your Microsoft 365 connector.
                    </li>
                    <li>
                      Add the Microsoft Graph application permission{" "}
                      <code className="text-ink text-xs">{RECLAIM_ROLE}</code>{" "}
                      and no other permission, then grant admin consent.
                    </li>
                    <li>Create a client secret or upload a certificate.</li>
                  </ol>
                  <p className="text-ink-faint text-xs">
                    LicenseMeter refuses an app that holds any other Microsoft
                    Graph application permission or an Entra administrator role.
                    The secret or private key is stored encrypted.{" "}
                    <a
                      className="underline"
                      href={RECLAIM_DOCS}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Microsoft&rsquo;s permission reference
                    </a>
                  </p>
                  <ReclaimByoForm tid={tid} />
                </div>
              </details>
            )}
            {!managed && !byo && (
              <p className="text-ink-soft">
                One-click reclaim is not configured on this installation yet.
              </p>
            )}
          </div>
        )}
      </Card>

      {ready && (
        <Card title="Approval">
          <p className="text-ink-soft mb-3 text-sm">
            {isOwner
              ? "Choose who signs off a reclaim request before LicenseMeter removes any license."
              : `Current rule: ${APPROVAL_MODES[connection.approvalMode].label}. An Owner can change it.`}
          </p>
          <ReclaimApprovalModeForm
            current={connection.approvalMode}
            canEdit={isOwner && !demo}
          />
        </Card>
      )}

      <Card title="What reclaim can do">
        <Scope />
      </Card>

      {connection && isAdmin && !demo && (
        <Card title="Disconnect">
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-ink-soft">
              Disconnecting stops LicenseMeter from changing licenses right
              away. To remove the app from your tenant as well, delete{" "}
              {connection.mode === "managed"
                ? "the LicenseMeter reclaim app"
                : "your app registration"}{" "}
              under Enterprise applications in Microsoft Entra.
            </p>
            <div>
              <ReclaimDisconnectButton />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
