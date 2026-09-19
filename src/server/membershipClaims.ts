import { siteUrl } from "~/env";
import type { Session } from "~/server/auth";
import { db } from "~/server/db";
import { emailEnabled, membershipClaimHtml, sendEmail } from "~/server/email";
import {
  CLAIM_TTL_MS,
  createClaim,
  hasUnlinkedLegacyMembership,
  pruneClaims,
  redeemClaimToken,
} from "~/server/identityLink";
import { rateLimitDurable } from "~/server/rateLimit";

/**
 * Claim by email: how a member from before sign-in moved to Microsoft gets
 * their workspaces back when the id token does not prove their email. The
 * proof is mailbox access: the link goes to the address stored on the
 * membership and only works in the session that asked for it.
 */

/**
 * Three budgets, narrowest first so a refused request never eats a wider one.
 * Per person; per address AND requesting tenant, so the identities of one
 * foreign tenant cannot use up the budget the real owner needs from theirs;
 * and a cap per address over everyone, which bounds the mail one mailbox can
 * be sent. All fail closed.
 */
const CLAIMS_PER_OID_PER_HOUR = 5;
const CLAIMS_PER_EMAIL_AND_TENANT_PER_HOUR = 3;
const CLAIMS_PER_EMAIL_PER_HOUR = 12;
const HOUR_MS = 60 * 60 * 1000;

const claimAddressOf = (session: Session | null): string | null => {
  const user = session?.user;
  if (!user?.oid || !user.tid || user.isDemo) return null;
  const address = (user.email ?? "").trim().toLowerCase();
  return address || null;
};

/**
 * Whether memberships exist that COULD belong to this person but were not
 * linked for lack of proof: legacy memberships under the address the session
 * merely asserts. A boolean and nothing else, because the signer has proven
 * nothing yet: no workspace name, count or role may leak from here.
 */
export const pendingClaimFor = async (
  session: Session | null,
): Promise<boolean> => {
  const address = claimAddressOf(session);
  if (!address) return false;
  return hasUnlinkedLegacyMembership(db, address);
};

/**
 * Mails a claim link to the membership's address. Always resolves the same way
 * (void), whether a mail went out, nothing matched, a limit hit or sending
 * failed, so the caller cannot be used to probe which addresses are members.
 */
export const requestClaim = async (session: Session | null): Promise<void> => {
  try {
    const address = claimAddressOf(session);
    if (!address || !session) return;
    if (!(await hasUnlinkedLegacyMembership(db, address))) return;
    if (
      !(await rateLimitDurable(
        `claim-oid:${session.user.oid}`,
        CLAIMS_PER_OID_PER_HOUR,
        HOUR_MS,
        "deny",
      )) ||
      !(await rateLimitDurable(
        `claim-email:${address}:${session.user.tid}`,
        CLAIMS_PER_EMAIL_AND_TENANT_PER_HOUR,
        HOUR_MS,
        "deny",
      )) ||
      !(await rateLimitDurable(
        `claim-email:${address}`,
        CLAIMS_PER_EMAIL_PER_HOUR,
        HOUR_MS,
        "deny",
      ))
    ) {
      return;
    }
    if (!emailEnabled()) return;

    // `address` equals the stored membership address (matched lower-cased in
    // the lookup above); it is the only recipient there can be.
    const token = await createClaim(db, {
      email: address,
      oid: session.user.oid,
      tid: session.user.tid,
    });
    await sendEmail({
      to: [address],
      subject: "Confirm this is your LicenseMeter account",
      html: membershipClaimHtml({
        claimUrl: `${siteUrl()}/auth/claim?token=${encodeURIComponent(token)}`,
        appUrl: siteUrl(),
        minutes: Math.round(CLAIM_TTL_MS / 60_000),
      }),
    });
    await pruneClaims(db).catch(() => null);
  } catch (err) {
    console.error("[claim] request failed", err);
  }
};

/**
 * Redeems a claim link for the signed-in person. True when the token was valid
 * for this session; every failure (unknown, used, expired, another person's)
 * is the same false.
 */
export const redeemClaim = async (
  session: Session | null,
  token: string,
): Promise<boolean> => {
  const user = session?.user;
  if (!user?.oid || !user.tid || user.isDemo) return false;
  if (
    !(await rateLimitDurable(`claim-redeem:${user.oid}`, 20, HOUR_MS, "deny"))
  ) {
    return false;
  }
  const result = await redeemClaimToken(db, {
    token,
    oid: user.oid,
    tid: user.tid,
    name: user.name || null,
  });
  return result.ok;
};
