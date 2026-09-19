"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isDpaLang } from "~/lib/dpa";
import { apiAccess, apiFeatureAccess } from "~/server/access";
import { recordAcceptance, recordAgreement } from "~/server/dpa/records";

/**
 * Both forms are plain HTML forms in server components, so a refusal is
 * reported by redirecting to the agreement page with a notice code that the
 * page turns into a sentence. Success re-renders the page without a notice.
 */
export type AgreementNotice =
  | "forbidden"
  | "demo"
  | "selfHosted"
  | "language"
  | "invalid"
  | "featureRequired"
  | "kindNotAvailable";

const AGREEMENT_PATH = "/app/agreement";

const notify = (notice: AgreementNotice): never =>
  redirect(`${AGREEMENT_PATH}?notice=${notice}`);

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Records the online acceptance of the current version (owner or admin). */
export async function acceptDpaAction(formData: FormData): Promise<void> {
  const ctx = await apiAccess("admin");
  if (!ctx) return notify("forbidden");

  const language = field(formData, "language");
  if (!isDpaLang(language)) return notify("language");

  const result = await recordAcceptance(ctx, language);
  if (!result.ok) return notify(result.error);

  // The interstitial sits in the workspace layout, so every page under it
  // must pick up the new record.
  revalidatePath("/app", "layout");
}

/** Signs the current version with the named company (owner, Pro and MSP). */
export async function signDpaAction(formData: FormData): Promise<void> {
  const access = await apiFeatureAccess("signedDpa", "owner");
  if (access.denied === "featureRequired") return notify("featureRequired");
  if (!access.ctx) return notify("forbidden");

  const result = await recordAgreement(access.ctx, {
    kind: field(formData, "kind"),
    language: field(formData, "language"),
    companyName: field(formData, "companyName"),
    companyAddress: field(formData, "companyAddress"),
    signerName: field(formData, "signerName"),
    signerTitle: field(formData, "signerTitle"),
    signerEmail: field(formData, "signerEmail"),
  });
  if (!result.ok) return notify(result.error);

  revalidatePath(AGREEMENT_PATH);
  redirect(AGREEMENT_PATH);
}
