import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, ButtonLink } from "~/components/ui";
import { marketplaceEnabled, signInPath } from "~/env";
import { planName } from "~/lib/planLabel";
import { apiAccess } from "~/server/access";
import { auth } from "~/server/auth";
import {
  MarketplaceApiError,
  normalizePurchaseToken,
  planForMarketplaceId,
  resolveSubscription,
  type ResolvedSubscription,
} from "~/server/billing/marketplace";

import { activateMarketplacePurchase } from "./actions";
import {
  callerOwnsLink,
  findMarketplaceLink,
  isLandingError,
  LANDING_ERRORS,
  landingPath,
  ownedWorkspaces,
  safeReturnPath,
  type LandingError,
} from "./linking";

export const metadata = {
  title: "Activate your Microsoft Marketplace purchase",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TERM_LABEL: Record<string, string> = {
  P1M: "Billed monthly",
  P1Y: "Billed yearly",
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
    <Link href="/" className="font-display text-xl tracking-tight">
      License<span className="text-brand-text">Meter</span>
    </Link>
    {children}
  </main>
);

const Alert = ({ error }: { error: LandingError }) => (
  <div
    role="alert"
    className="border-danger-soft bg-danger-soft/50 text-danger-text mt-6 rounded-xl border p-4 text-sm"
  >
    {LANDING_ERRORS[error]}
  </div>
);

const Refusal = ({
  title,
  error,
  children,
}: {
  title: string;
  error: LandingError;
  children?: React.ReactNode;
}) => (
  <Shell>
    <h1 className="font-display mt-10 text-4xl tracking-tight">{title}</h1>
    <Alert error={error} />
    {children}
  </Shell>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="border-line flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-2.5 last:border-b-0">
    <dt className="text-ink-soft text-xs">{label}</dt>
    <dd className="text-ink text-sm font-medium">{value}</dd>
  </div>
);

/**
 * Landing page of the transactable SaaS offer. Microsoft sends the buyer here
 * with the purchase token in the `token` query parameter, after the purchase
 * and again whenever they choose Manage Account.
 * https://learn.microsoft.com/partner-center/marketplace-offers/azure-ad-transactable-saas-landing-page
 */
export default async function MarketplaceLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = normalizePurchaseToken(
    typeof sp.token === "string" ? sp.token : null,
  );
  const error = isLandingError(sp.error) ? sp.error : null;

  if (!marketplaceEnabled()) {
    return (
      <Refusal title="Marketplace is not available" error="notConfigured" />
    );
  }

  // Sign in first, and come back with the token intact.
  const session = await auth();
  if (!session?.user) {
    const returnTo = safeReturnPath(landingPath(token));
    redirect(
      returnTo
        ? `${signInPath()}?returnTo=${encodeURIComponent(returnTo)}`
        : signInPath(),
    );
  }

  if (!token) {
    return <Refusal title="No purchase to activate" error="invalidToken" />;
  }

  const ctx = await apiAccess();
  if (ctx?.user.isDemo) {
    return <Refusal title="Sign in with your own account" error="demo" />;
  }
  const workspaces = ctx ? ownedWorkspaces(ctx) : [];

  let resolved: ResolvedSubscription;
  try {
    resolved = await resolveSubscription(token);
  } catch (err) {
    const invalid = err instanceof MarketplaceApiError && err.status === 400;
    if (!invalid) {
      console.error(
        `[marketplace] resolve failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    return (
      <Refusal
        title={
          invalid ? "We could not find this purchase" : "Please try again soon"
        }
        error={invalid ? "invalidToken" : "unavailable"}
      />
    );
  }

  const subscription = resolved.subscription;
  const plan = planForMarketplaceId(subscription.planId);
  if (!plan) {
    return <Refusal title="Unknown plan" error="unknownPlan" />;
  }
  if (subscription.saasSubscriptionStatus === "Unsubscribed") {
    return <Refusal title="This subscription has ended" error="ended" />;
  }

  const link = await findMarketplaceLink(subscription.id);
  const ownsLink = link && ctx ? await callerOwnsLink(ctx, link) : false;
  if (link && !ownsLink) {
    return (
      <Refusal
        title="Already linked to another workspace"
        error="linkedElsewhere"
      />
    );
  }
  // Manage Account on a running subscription: straight to the billing page.
  if (link && subscription.saasSubscriptionStatus === "Subscribed") {
    redirect("/app/billing");
  }

  const purchaser =
    subscription.purchaser?.emailId ?? subscription.beneficiary?.emailId;
  const quantity =
    typeof subscription.quantity === "number" ? subscription.quantity : null;
  const termUnit = subscription.term?.termUnit ?? "";
  const defaultWorkspaceId = (
    workspaces.find((w) => w.id === ctx?.tenant.id) ?? workspaces[0]
  )?.id;
  const linkedWorkspace = link?.tenantId
    ? workspaces.find((w) => w.id === link.tenantId)
    : null;

  return (
    <Shell>
      <h1 className="font-display mt-10 text-4xl tracking-tight">
        Activate your purchase
      </h1>
      <p className="text-ink-soft mt-4">
        Thank you for buying LicenseMeter through Microsoft Marketplace. Check
        the details below and choose the workspace that should get the plan.
        Billing on your Microsoft invoice starts only after you confirm.
      </p>

      {error && <Alert error={error} />}

      <dl className="border-line bg-card mt-6 rounded-xl border">
        <Row
          label="Offer"
          value={
            resolved.subscriptionName ??
            subscription.name ??
            resolved.offerId ??
            "LicenseMeter"
          }
        />
        <Row label="Plan" value={planName(plan)} />
        {quantity !== null && <Row label="Quantity" value={String(quantity)} />}
        {TERM_LABEL[termUnit] && (
          <Row label="Billing" value={TERM_LABEL[termUnit]} />
        )}
        {subscription.isFreeTrial === true && (
          <Row label="Trial" value="Starts with a free trial" />
        )}
        {purchaser && <Row label="Purchased by" value={purchaser} />}
        <Row label="Signed in as" value={session.user.upn} />
      </dl>

      {link ? (
        <form action={activateMarketplacePurchase} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <p className="text-ink-soft text-sm">
            {linkedWorkspace
              ? `This subscription is linked to ${linkedWorkspace.name}.`
              : "This subscription is linked to your MSP account."}{" "}
            Confirm to finish the activation.
          </p>
          <Button type="submit" variant="primary" className="mt-4">
            Finish activation
          </Button>
        </form>
      ) : workspaces.length === 0 ? (
        <div className="mt-8">
          <p className="text-ink-soft text-sm">
            You do not own a workspace yet. Create or connect one first, then
            open this page again from Microsoft Marketplace with Configure
            Account. Your purchase stays reserved in the meantime.
          </p>
          <ButtonLink href="/app/connect" variant="primary" className="mt-4">
            Create or connect a workspace
          </ButtonLink>
        </div>
      ) : (
        <form action={activateMarketplacePurchase} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <fieldset>
            <legend className="text-ink text-sm font-medium">
              {plan === "msp"
                ? "First client workspace to cover"
                : "Workspace that gets the plan"}
            </legend>
            <p className="text-ink-soft mt-1 text-sm">
              {plan === "msp"
                ? "The MSP plan belongs to your MSP account. You can attach more client workspaces afterwards."
                : "Only workspaces where you are the owner are listed."}
            </p>
            <div className="border-line bg-card mt-4 rounded-xl border">
              {workspaces.map((w) => (
                <label
                  key={w.id}
                  className="border-line flex min-h-11 cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                >
                  <input
                    type="radio"
                    name="workspaceId"
                    value={w.id}
                    defaultChecked={w.id === defaultWorkspaceId}
                    required
                  />
                  <span className="text-ink">{w.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" variant="primary" className="mt-6">
            Confirm and activate
          </Button>
        </form>
      )}
    </Shell>
  );
}
