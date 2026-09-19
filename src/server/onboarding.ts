import { env, siteUrl } from "~/env";
import { SUPPORT_EMAIL } from "~/lib/support";
import { emailEnabled, sendEmail } from "~/server/email";
import { ONBOARDING_SUBJECT, onboardingHtml } from "~/server/onboardingEmail";
import { notifyOps } from "~/server/ops";

/**
 * Onboarding email for the person whose first sign-in just created their own
 * workspace. Once-ever by construction: the caller only gets here for the
 * sign-in whose transaction inserted the workspace, which the advisory lock
 * in createOwnedWorkspace makes a single event per person. Never throws: a
 * failed send must not fail the sign-in, it alerts ops instead so the founder
 * can follow up personally.
 */
export const sendOnboardingEmail = async (who: {
  oid: string;
  email: string;
  name: string | null;
}): Promise<void> => {
  try {
    if (!emailEnabled()) return;
    // Founder-voiced mail about the hosted service; an operator's own
    // installation has no business sending it in their name.
    if (env.SELF_HOSTED === "true") return;
    await sendEmail({
      to: [who.email],
      // Founder-voiced send; replies land in the monitored support inbox.
      from: "Ugur from LicenseMeter <hello@licensemeter.com>",
      replyTo: SUPPORT_EMAIL,
      subject: ONBOARDING_SUBJECT,
      html: onboardingHtml({
        email: who.email,
        name: who.name,
        baseUrl: siteUrl(),
      }),
      // Second guard behind the provisioning lock: Resend drops a repeat.
      idempotencyKey: `onboarding:${who.oid}`,
    });
  } catch (err) {
    void notifyOps(
      `onboarding email failed for ${who.email}: ${err instanceof Error ? err.message : String(err)}`,
      { key: `onboarding:${who.email}`, cooldownMs: 60 * 60 * 1000 },
    );
  }
};
