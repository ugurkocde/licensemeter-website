"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { marketplaceEnabled } from "~/env";
import { signInStartHref } from "~/lib/signIn";
import {
  apiAccess,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "~/server/access";
import {
  applyEntitlementEvent,
  type EntitlementOwner,
} from "~/server/billing/entitlementWrites";
import {
  activateSubscription,
  MarketplaceApiError,
  normalizePurchaseToken,
  planForMarketplaceId,
  resolveSubscription,
  subscriptionToEvent,
  type ResolvedSubscription,
} from "~/server/billing/marketplace";
import {
  attachWorkspace,
  ensureMspAccount,
  getMspAccount,
} from "~/server/billing/mspAccount";

import {
  callerOwnsLink,
  findMarketplaceLink,
  landingPath,
  ownedWorkspaces,
  ownerConflict,
  ownerOfLink,
  safeReturnPath,
  type LandingError,
} from "./linking";

const input = z.object({
  token: z.string().min(1).max(4096),
  workspaceId: z.string().uuid().optional(),
});

/**
 * Confirms a Marketplace purchase. The form carries only the purchase token and
 * the chosen workspace: the subscription id, plan and quantity are read again
 * from Microsoft, and ownership is checked again against the session.
 */
export async function activateMarketplacePurchase(
  formData: FormData,
): Promise<void> {
  const parsed = input.safeParse({
    token: formData.get("token"),
    workspaceId: formData.get("workspaceId") ?? undefined,
  });
  const token = parsed.success
    ? normalizePurchaseToken(parsed.data.token)
    : null;
  const fail = (error: LandingError): never =>
    redirect(landingPath(token, error));

  if (!marketplaceEnabled()) fail("notConfigured");
  if (!parsed.success || !token) return fail("invalidToken");

  const ctx = await apiAccess();
  if (!ctx) {
    // Same single sign-on entry as the landing page itself.
    const returnTo = safeReturnPath(landingPath(token));
    redirect(signInStartHref(returnTo));
  }
  if (ctx.user.isDemo) fail("demo");

  let resolved: ResolvedSubscription;
  try {
    resolved = await resolveSubscription(token);
  } catch (err) {
    // 400: the token is missing, malformed, invalid or expired.
    return fail(
      err instanceof MarketplaceApiError && err.status === 400
        ? "invalidToken"
        : "unavailable",
    );
  }
  const subscription = resolved.subscription;
  const plan = planForMarketplaceId(subscription.planId);
  if (!plan) return fail("unknownPlan");
  if (subscription.saasSubscriptionStatus === "Unsubscribed") fail("ended");

  // A subscription that is already linked keeps its owner. Anyone else is
  // refused, whatever workspace they picked.
  const link = await findMarketplaceLink(subscription.id);
  let owner: EntitlementOwner | null = null;
  let workspaceId: string | null = null;
  if (link) {
    if (!(await callerOwnsLink(ctx, link))) fail("linkedElsewhere");
    owner = ownerOfLink(link);
    workspaceId = link.tenantId;
  } else {
    const chosen = ownedWorkspaces(ctx).find(
      (w) => w.id === parsed.data.workspaceId,
    );
    if (!chosen) return fail("notOwner");
    workspaceId = chosen.id;
    if (plan === "pro") {
      owner = { tenantId: chosen.id };
    } else {
      // The MSP plan belongs to the caller's MSP account, and the chosen
      // workspace becomes one of the client tenants it covers. An account that
      // already pays some other way is refused before anything is created.
      const existing = await getMspAccount(ctx);
      const taken = existing
        ? await ownerConflict({ mspAccountId: existing.id }, subscription.id)
        : null;
      if (taken) fail(taken);
      // Only the workspace the buyer picked joins the plan; the workspace the
      // session happens to be in must not take a coverage slot on the side.
      const account = await ensureMspAccount(ctx, { attachActive: false });
      const attached = await attachWorkspace(ctx, chosen.id);
      if (!attached.ok) {
        return fail(
          attached.reason === "attachedElsewhere" ? "attachFailed" : "notOwner",
        );
      }
      owner = { mspAccountId: account.id };
    }
  }
  if (!owner) return fail("linkedElsewhere");

  const conflict = await ownerConflict(owner, subscription.id);
  if (conflict) fail(conflict);

  // First the link, so every later webhook finds its owner. A purchase that is
  // not activated yet grants nothing at this point.
  const linked = subscriptionToEvent(subscription, {
    owner,
    eventId: `landing:${subscription.id}:${Date.now()}`,
    type: "landing.linked",
    occurredAt: new Date(),
  });
  if (!linked) return fail("unknownPlan");
  // A retry on a link that is still pending must not take back what an earlier
  // successful Activate already granted.
  const pendingRetry =
    link !== null &&
    subscription.saasSubscriptionStatus === "PendingFulfillmentStart";
  if (!pendingRetry && (await applyEntitlementEvent(linked)) === "comped") {
    fail("otherProvider");
  }

  if (subscription.saasSubscriptionStatus === "PendingFulfillmentStart") {
    try {
      await activateSubscription(subscription.id);
    } catch (err) {
      console.error(
        `[marketplace] activate failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
      return fail("activateFailed");
    }
    const activated = subscriptionToEvent(subscription, {
      owner,
      eventId: `landing:${subscription.id}:${Date.now()}:activated`,
      type: "landing.activated",
      occurredAt: new Date(),
      activated: true,
    });
    if (activated) await applyEntitlementEvent(activated);
  }

  // Open the billing page on the workspace that now holds the plan.
  if (workspaceId) {
    (await cookies()).set(
      WORKSPACE_COOKIE,
      workspaceId,
      workspaceCookieOptions(),
    );
  }
  redirect(
    subscription.saasSubscriptionStatus === "Suspended"
      ? "/app/billing?marketplace=suspended"
      : "/app/billing?marketplace=activated",
  );
}
