import { eq } from "drizzle-orm";

import { env, siteUrl } from "~/env";
import { SUPPORT_EMAIL } from "~/lib/support";
import { db } from "~/server/db";
import { emailSignups, memberships } from "~/server/db/schema";
import { emailEnabled, sendEmail } from "~/server/email";
import { notifyOps } from "~/server/ops";
import { makeUnsubToken } from "~/server/unsubToken";
import { welcomeHtml, welcomeSubject } from "~/server/welcomeEmail";

/** Token-signed unsubscribe link; the email rides along base64url-encoded. */
export const unsubscribeUrl = (email: string): string => {
  const e = Buffer.from(email).toString("base64url");
  const t = makeUnsubToken(email, env.AUTH_SECRET);
  return `${siteUrl()}/api/unsubscribe?e=${e}&t=${t}`;
};

/**
 * Welcome email for a landing signup. Safe to call on every capture, fresh
 * or duplicate: the welcomeSentAt stamp is the once-ever guarantee, which
 * makes a resubmitted email the natural retry after a transient send
 * failure. Adds the remaining suppressions and never throws: a failed send
 * must not fail the capture, it alerts ops instead so the founder can
 * follow up personally.
 */
export const maybeSendWelcome = async (email: string): Promise<void> => {
  try {
    if (!emailEnabled()) return;
    // Idempotency and consent, independent of the caller: no signup row,
    // already welcomed, or unsubscribed all mean no send, which keeps the
    // function safe for retries or future callers beyond captureEmail.
    const signup = await db.query.emailSignups.findFirst({
      where: eq(emailSignups.email, email),
      columns: { welcomeSentAt: true, unsubscribedAt: true },
    });
    if (!signup || signup.welcomeSentAt || signup.unsubscribedAt) return;
    // Existing members already have a workspace: the connect pitch is wrong
    // for them, and they never asked for the guide.
    const member = await db.query.memberships.findFirst({
      where: eq(memberships.email, email),
    });
    if (member) return;

    const unsub = unsubscribeUrl(email);
    const sent = await sendEmail({
      to: [email],
      // Founder-voiced send; replies land in the monitored support inbox.
      from: "Ugur from LicenseMeter <hello@licensemeter.com>",
      replyTo: SUPPORT_EMAIL,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      subject: welcomeSubject(email),
      html: welcomeHtml({ email, baseUrl: siteUrl(), unsubscribeUrl: unsub }),
    });
    if (sent) {
      await db
        .update(emailSignups)
        .set({ welcomeSentAt: new Date() })
        .where(eq(emailSignups.email, email));
    }
  } catch (err) {
    void notifyOps(
      `welcome email failed for ${email}: ${err instanceof Error ? err.message : String(err)}`,
      { key: `welcome:${email}`, cooldownMs: 60 * 60 * 1000 },
    );
  }
};
