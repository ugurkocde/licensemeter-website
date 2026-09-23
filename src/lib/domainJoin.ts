import type { DomainJoinMode, JoinRequestStatus } from "~/server/types";

/**
 * Public email providers: their domain is shared by strangers, so it must never
 * count as a company domain (a gmail.com user must not reach another gmail
 * user's workspace). Everything else is treated as a corporate domain.
 */
export const CONSUMER_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "qq.com",
  "163.com",
  "126.com",
]);

export const domainOfEmail = (email: string): string | null => {
  const d = email.split("@")[1]?.toLowerCase().trim();
  return d?.includes(".") ? d : null;
};

export const isConsumerEmailDomain = (domain: string): boolean =>
  CONSUMER_EMAIL_DOMAINS.has(domain.toLowerCase());

/** A verified, non-consumer email domain eligible for domain join. */
export const corporateDomainOf = (
  email: string,
  emailVerified: boolean,
): string | null => {
  if (!emailVerified) return null;
  const d = domainOfEmail(email);
  return d && !isConsumerEmailDomain(d) ? d : null;
};

export const DOMAIN_JOIN_MODES: DomainJoinMode[] = ["approval", "auto", "off"];

export const DOMAIN_JOIN_LABEL: Record<DomainJoinMode, string> = {
  approval: "Ask to join",
  auto: "Join automatically",
  off: "Invite only",
};

/**
 * Explanation shown next to each option in Settings. Each one says what a
 * colleague without an invite gets, because that is the consequence an owner
 * cannot see from their own seat.
 */
export const DOMAIN_JOIN_DESCRIPTION: Record<DomainJoinMode, string> = {
  approval:
    "Colleagues send an access request when they first sign in. Requests appear here and are emailed to owners and admins. Until one is approved, that colleague gets an empty workspace of their own.",
  auto: "Colleagues are added as viewers when they first sign in and can see all license, user and cost data. Owners and admins get an email.",
  off: "Only invited people get access. Colleagues who sign in without an invite get an empty workspace of their own.",
};

export type DomainJoinDecision = "join" | "request" | "none";

/**
 * What a sign-in without any workspace does at the workspace that holds the
 * person's email domain.
 *
 * - Unverified or consumer addresses never qualify.
 * - 'off' never admits or records anyone.
 * - A decided request is final: declined people are not asked about again, and
 *   approved people who no longer have a membership were removed on purpose.
 *   Both come back by invitation only.
 * - 'auto' joins; 'approval' files one request and then stays quiet while it
 *   is pending.
 */
export const decideDomainJoin = (input: {
  mode: DomainJoinMode;
  requestStatus: JoinRequestStatus | null;
  emailVerified: boolean;
  consumerDomain: boolean;
}): DomainJoinDecision => {
  if (!input.emailVerified || input.consumerDomain) return "none";
  if (input.mode === "off") return "none";
  if (input.requestStatus === "approved" || input.requestStatus === "declined")
    return "none";
  if (input.mode === "auto") return "join";
  return input.requestStatus === "pending" ? "none" : "request";
};
