"use server";

import { revalidatePath } from "next/cache";

import { planName } from "~/lib/planLabel";
import { apiFeatureAccess } from "~/server/access";
import {
  clearBranding,
  saveBranding,
  type BrandingResult,
} from "~/server/billing/branding";

export type BrandingActionResult = { ok: boolean; error?: string };

const MESSAGES: Record<
  Exclude<BrandingResult, { ok: true }>["reason"],
  string
> = {
  featureRequired: "White-label reports are not part of this workspace's plan.",
  demoUser: "Branding cannot be changed in the demo workspace.",
  noAccount: "This workspace is not attached to an MSP account.",
  notOwner: "Only the owner of the MSP account can change its branding.",
  invalid: "Check the brand name, colour and logo.",
};

const answer = (result: BrandingResult): BrandingActionResult => {
  if (!result.ok) {
    return { ok: false, error: result.message ?? MESSAGES[result.reason] };
  }
  revalidatePath("/app/branding");
  return { ok: true };
};

/** The plan gate for both actions: the UI lock is never the enforcement. */
const gate = async () => {
  const access = await apiFeatureAccess("whiteLabel");
  if (access.denied === "unauthorized") {
    return { ctx: null, refusal: { ok: false, error: "Sign in again." } };
  }
  if (access.denied === "featureRequired") {
    return {
      ctx: null,
      refusal: {
        ok: false,
        error: `White-label reports are included in ${planName(access.plan)}.`,
      },
    };
  }
  return { ctx: access.ctx, refusal: null };
};

export async function saveBrandingAction(
  input: unknown,
): Promise<BrandingActionResult> {
  const { ctx, refusal } = await gate();
  if (!ctx) return refusal;
  return answer(await saveBranding(ctx, input));
}

export async function clearBrandingAction(): Promise<BrandingActionResult> {
  const { ctx, refusal } = await gate();
  if (!ctx) return refusal;
  return answer(await clearBranding(ctx));
}
