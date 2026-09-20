import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import { findings, type TenantRow } from "~/server/db/schema";
import { emailEnabled } from "~/server/email";
import { deliverOnce } from "~/server/emailDelivery";
import { LEAK_RULES } from "~/server/leakAlerts";
import { leakAlertMessage } from "~/server/leakAlertMessage";
import { loadSharedAddress } from "~/server/notificationAddress";
import { workspaceEmailRecipients } from "~/server/workspaceEmail";

/**
 * The offboarding leaks that are open right now, mailed because an admin asked
 * for them in Settings. This recovers information a workspace missed when mail
 * bounced, when the leak alerts were off, or when a sync alert never arrived:
 * it reads the current findings instead of replaying an old message, and it
 * enables nothing.
 */

/** What one requested send did. Nothing here throws, everything is counted. */
export type CurrentFindingsResult = {
  /** Findings the message covered; zero means nothing went out. */
  findings: number;
  /** Addresses the send was attempted for. */
  recipients: number;
  sent: number;
  skippedBlocked: number;
  failed: number;
  /** Set when nothing went out, so the caller can say why. */
  reason?: "email-off" | "no-findings" | "no-recipients";
};

const EMPTY = {
  findings: 0,
  recipients: 0,
  sent: 0,
  skippedBlocked: 0,
  failed: 0,
} as const;

/**
 * Owners, admins and the confirmed shared address. The leak switches are
 * deliberately ignored here, both the workspace one and the shared address
 * one: an admin asked for this one email explicitly, which is not the same as
 * subscribing anybody to the scheduled alert.
 */
export const currentFindingsRecipients = async (
  tenantId: string,
): Promise<string[]> => {
  const { recipients } = await workspaceEmailRecipients(tenantId);
  const to = recipients.map((r) => r.email);
  const shared = await loadSharedAddress(tenantId);
  const address = shared?.verifiedAt ? (shared.email?.trim() ?? "") : "";
  if (address && !to.some((e) => e.toLowerCase() === address.toLowerCase())) {
    to.push(address);
  }
  return to;
};

/**
 * Mail the workspace's current offboarding leaks once, one ledger-tracked
 * message per recipient. The ledger period key is unique to this send, so it
 * can never collide with a sync alert or with an earlier requested send.
 */
export const sendCurrentFindings = async (
  tenant: TenantRow,
  now: Date = new Date(),
): Promise<CurrentFindingsResult> => {
  // The demo workspace never mails anyone, and the workspace leak switch is
  // not consulted: this send was asked for, not triggered.
  if (tenant.isDemo || !emailEnabled()) {
    return { ...EMPTY, reason: "email-off" };
  }

  const rows = await db.query.findings.findMany({
    where: and(
      eq(findings.tenantId, tenant.id),
      // Unresolved, as everywhere else in the app: an acknowledged leak still
      // bills every month.
      inArray(findings.status, ["open", "acknowledged"]),
      inArray(findings.rule, [...LEAK_RULES]),
    ),
    columns: { title: true, monthlyImpactCents: true },
  });
  if (rows.length === 0) return { ...EMPTY, reason: "no-findings" };

  const to = await currentFindingsRecipients(tenant.id);
  if (to.length === 0) {
    return { ...EMPTY, findings: rows.length, reason: "no-recipients" };
  }

  const message = leakAlertMessage(tenant, rows, { requested: true });
  const periodKey = `requested-${now.toISOString()}-${randomUUID().slice(0, 8)}`;
  const result: CurrentFindingsResult = {
    ...EMPTY,
    findings: rows.length,
    recipients: to.length,
  };
  for (const recipient of to) {
    // A throw here is a ledger error, not a send error; the next recipient
    // still gets a turn.
    const outcome = await deliverOnce(
      { tenantId: tenant.id, job: "leak", periodKey, recipient },
      () => Promise.resolve(message),
    ).catch(() => "failed" as const);
    if (outcome === "sent") result.sent++;
    else if (outcome === "skippedBlocked") result.skippedBlocked++;
    // A fresh period key is never claimed twice, so anything left is a failure.
    else result.failed++;
  }
  return result;
};
