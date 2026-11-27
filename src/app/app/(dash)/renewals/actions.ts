"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { isSkuTermChoice, settingOf } from "~/lib/renewalTerm";
import { planName } from "~/lib/planLabel";
import { apiFeatureAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { renewalSkuTerms, tenants, tenantSkus } from "~/server/db/schema";
import { MAX_BUFFER_PCT } from "~/server/renewals/plan";

export type RenewalActionResult = { ok: boolean; error?: string };

const fail = (error: string): RenewalActionResult => ({ ok: false, error });

/** The plan gate for every plan setting: the UI lock is never the enforcement. */
const gate = async () => {
  const access = await apiFeatureAccess("renewalPlans", "admin");
  if (access.denied === "unauthorized")
    return { ctx: null, refusal: fail("Only admins can change the plan.") };
  if (access.denied === "featureRequired")
    return {
      ctx: null,
      refusal: fail(
        `The renewal savings plan is included in ${planName(access.plan)}.`,
      ),
    };
  if (access.ctx.tenant.isDemo)
    return {
      ctx: null,
      refusal: fail(
        "The demo workspace is read-only. Connect your own workspace to change this.",
      ),
    };
  return { ctx: access.ctx, refusal: null };
};

const revalidate = () => {
  revalidatePath("/app/renewals");
  revalidatePath("/app");
};

/** Headroom on top of active seats, 0 to 50 percent. */
export async function setRenewalBuffer(
  pct: unknown,
): Promise<RenewalActionResult> {
  const { ctx, refusal } = await gate();
  if (!ctx) return refusal;
  if (
    typeof pct !== "number" ||
    !Number.isInteger(pct) ||
    pct < 0 ||
    pct > MAX_BUFFER_PCT
  )
    return fail(`Enter a whole number from 0 to ${MAX_BUFFER_PCT}.`);
  const previous = ctx.tenant.renewalBufferPct;
  if (previous === pct) return { ok: true };
  await db
    .update(tenants)
    .set({ renewalBufferPct: pct })
    .where(eq(tenants.id, ctx.tenant.id));
  await audit(ctx, "renewal_buffer_changed", { from: previous, to: pct });
  revalidate();
  return { ok: true };
}

/**
 * Billing term of one Microsoft SKU. Annual is the default and stores no row,
 * so a SKU nobody set reads the same as one set to annual.
 */
export async function setRenewalSkuTerm(
  skuId: unknown,
  choice: unknown,
): Promise<RenewalActionResult> {
  const { ctx, refusal } = await gate();
  if (!ctx) return refusal;
  if (typeof skuId !== "string" || !skuId || skuId.length > 100)
    return fail("Unknown subscription.");
  if (!isSkuTermChoice(choice)) return fail("Choose a billing term.");
  const sku = await db.query.tenantSkus.findFirst({
    where: and(
      eq(tenantSkus.tenantId, ctx.tenant.id),
      eq(tenantSkus.skuId, skuId),
    ),
    columns: { skuId: true },
  });
  if (!sku) return fail("Unknown subscription.");
  const setting = settingOf(choice);
  if (setting.term === "annual") {
    await db
      .delete(renewalSkuTerms)
      .where(
        and(
          eq(renewalSkuTerms.tenantId, ctx.tenant.id),
          eq(renewalSkuTerms.skuId, skuId),
        ),
      );
  } else {
    await db
      .insert(renewalSkuTerms)
      .values({ tenantId: ctx.tenant.id, skuId, ...setting })
      .onConflictDoUpdate({
        target: [renewalSkuTerms.tenantId, renewalSkuTerms.skuId],
        set: { ...setting, updatedAt: new Date() },
      });
  }
  await audit(ctx, "renewal_sku_term_changed", { skuId, choice });
  revalidate();
  return { ok: true };
}
