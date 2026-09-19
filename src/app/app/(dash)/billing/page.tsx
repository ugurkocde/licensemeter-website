import { BillingRedirectButton } from "~/components/billing/BillingRedirectButton";
import {
  ConfirmationNotice,
  FeatureExplainer,
} from "~/components/billing/BillingNotices";
import { CoverageSection } from "~/components/billing/CoverageSection";
import {
  IntervalChoice,
  PlanCard,
  type PlanCardStatus,
} from "~/components/billing/PlanCards";
import {
  SOURCE_LABEL,
  isRunning,
  parseBillingParams,
  planDateLine,
  stateLabel,
} from "~/components/billing/billingView";
import { Card, Pill } from "~/components/ui";
import { billingEnabled, env, polarEnabled } from "~/env";
import { planBadge, planName } from "~/lib/planLabel";
import { TRIAL_DAYS, type PricedPlan } from "~/lib/pricing";
import { hasRole, requireAccess } from "~/server/access";
import { listCoverage } from "~/server/billing/mspAccount";
import { hasFeature } from "~/server/entitlement";

export const metadata = { title: "Plan and billing" };

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
    <header className="rise rise-1">
      <h1 className="font-display text-3xl tracking-tight">Plan and billing</h1>
    </header>
    {children}
  </div>
);

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Viewers and admins may look; every action below is owner-only.
  const ctx = await requireAccess("viewer");

  if (!billingEnabled()) {
    return (
      <Shell>
        <p className="rise rise-2 text-ink-soft text-sm">
          This install has every feature, so there is no plan to choose and
          nothing to buy.
        </p>
      </Shell>
    );
  }

  const { interval, feature, notice } = parseBillingParams(await searchParams);
  const { entitlement } = ctx;
  const isDemo = ctx.tenant.isDemo || ctx.user.isDemo;
  const isOwner = hasRole(ctx, "owner");
  const canAct = isOwner && !isDemo;

  // The caller's own MSP account, never one they merely sit under.
  const coverage = canAct ? await listCoverage(ctx) : null;
  const accountPlanRunning = (coverage?.quantity ?? 0) > 0;

  const badge = planBadge(entitlement);
  const dateLine = planDateLine(entitlement);
  const overQuantity = entitlement.state === "overQuantity";
  const running = isRunning(entitlement.state);

  // The provider behind whatever this owner pays for right now: the plan of
  // the active workspace, else the plan of their own MSP account.
  const payingThrough =
    running || overQuantity
      ? entitlement.source
      : accountPlanRunning
        ? (coverage?.source ?? null)
        : null;
  // One provider per owner: while a subscription runs, the other plan is only
  // offered through the same channel, so nobody ends up paying twice.
  const channelOpen = (channel: "marketplace" | "polar") =>
    payingThrough === null ||
    payingThrough === "comped" ||
    payingThrough === channel;
  const marketplaceUrl =
    env.MARKETPLACE_OFFER_URL && channelOpen("marketplace")
      ? env.MARKETPLACE_OFFER_URL
      : null;
  const cardCheckout = polarEnabled() && channelOpen("polar");

  const statusOf = (plan: PricedPlan): PlanCardStatus => {
    if (entitlement.plan === plan) return "current";
    if (plan === "msp" && accountPlanRunning) return "current";
    if (plan === "pro" && entitlement.plan === "msp") return "included";
    return "available";
  };
  const neverPaid = entitlement.state === "free" && !accountPlanRunning;

  return (
    <Shell>
      {notice && (
        <div className="rise rise-2">
          <ConfirmationNotice notice={notice} />
        </div>
      )}
      {feature && !hasFeature(entitlement, feature) && (
        <div className="rise rise-2">
          <FeatureExplainer feature={feature} overQuantity={overQuantity} />
        </div>
      )}

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Current plan">
          {isDemo ? (
            <p className="text-ink-soft text-sm">
              The demo workspace shows every feature. Plans apply to your own
              workspace.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-display text-2xl tracking-tight">
                  {planName(overQuantity ? "msp" : entitlement.plan)}
                </span>
                {badge && entitlement.state !== "free" && (
                  <Pill tone={badge.tone}>{stateLabel(entitlement.state)}</Pill>
                )}
              </div>
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                {entitlement.source && (
                  <div>
                    <dt className="text-ink-faint">Paid through</dt>
                    <dd className="mt-0.5 font-medium">
                      {SOURCE_LABEL[entitlement.source]}
                    </dd>
                  </div>
                )}
                {dateLine && (
                  <div>
                    <dt className="text-ink-faint">Status</dt>
                    <dd className="mt-0.5">{dateLine}</dd>
                  </div>
                )}
              </dl>

              {entitlement.state === "free" && (
                <p className="text-ink-soft text-sm">
                  Free keeps working as it does today. A paid plan only adds
                  features, and nothing is ever locked or deleted if you go
                  back.
                </p>
              )}

              {overQuantity && (
                <div className="border-gold-soft bg-gold-soft text-gold-text rounded-xl border px-4 py-3 text-sm">
                  <p className="font-medium">
                    This workspace is not covered by the MSP plan it is attached
                    to.
                  </p>
                  <p className="mt-1">
                    The plan covers a set number of client tenants, oldest
                    first, and this workspace is beyond that number, so it runs
                    on Free. Nothing is locked or deleted. To cover it, the
                    owner of the MSP plan adds a tenant to the subscription or
                    detaches another workspace
                    {coverage?.account ? " in the list below." : "."}
                  </p>
                </div>
              )}

              {payingThrough === "polar" &&
                (canAct ? (
                  <BillingRedirectButton
                    target={{ kind: "portal" }}
                    label="Manage subscription"
                    variant="secondary"
                    className="sm:max-w-xs"
                  />
                ) : (
                  <p className="text-ink-faint text-xs">
                    A workspace owner manages the subscription.
                  </p>
                ))}
              {payingThrough === "marketplace" && (
                <p className="text-ink-soft text-sm">
                  This plan is on your Microsoft invoice. Changing the number of
                  tenants, the payment method or cancelling happens in the
                  Microsoft admin portal where the subscription was bought, not
                  here. Changes show up on this page within a few minutes.
                </p>
              )}
              {payingThrough === "comped" && (
                <p className="text-ink-soft text-sm">
                  LicenseMeter provides this plan, so there is nothing to pay or
                  manage.
                </p>
              )}
            </div>
          )}
        </Card>

        <section
          aria-labelledby="plans-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2
                id="plans-heading"
                className="font-display text-xl tracking-tight"
              >
                Plans
              </h2>
              <p className="text-ink-soft mt-1 text-sm">
                {neverPaid
                  ? `Both plans start with a ${TRIAL_DAYS}-day trial.`
                  : "Prices are in euros."}
                {!canAct &&
                  !isDemo &&
                  " Only a workspace owner can change the plan."}
              </p>
            </div>
            <IntervalChoice interval={interval} feature={feature} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(["pro", "msp"] as const).map((plan) => (
              <PlanCard
                key={plan}
                plan={plan}
                interval={interval}
                status={statusOf(plan)}
                canBuy={canAct}
                marketplaceUrl={marketplaceUrl}
                cardCheckout={cardCheckout}
                note={
                  plan === "msp" &&
                  entitlement.plan === "pro" &&
                  running &&
                  canAct
                    ? "MSP is a separate subscription. Cancel Pro once MSP is active, so you are not charged for both."
                    : undefined
                }
              />
            ))}
          </div>

          {canAct && marketplaceUrl && (
            <p className="text-ink-faint text-xs">
              Microsoft Marketplace puts the plan on your Microsoft invoice.
              {cardCheckout &&
                " Card payments are handled by Polar, who is the merchant of record."}
            </p>
          )}
        </section>

        {coverage?.account &&
          (accountPlanRunning || coverage.attachedCount > 0) && (
            <CoverageSection coverage={coverage} interval={interval} />
          )}
        {entitlement.plan === "msp" && !isDemo && !coverage?.account && (
          <p className="text-ink-soft text-sm">
            This workspace is covered by an MSP plan. The person who bought the
            plan manages which client workspaces it covers.
          </p>
        )}
      </div>
    </Shell>
  );
}
