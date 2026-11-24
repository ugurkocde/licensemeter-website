import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";

import { env } from "~/env";
import {
  apiAccess,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "~/server/access";
import { auth } from "~/server/auth";
import { audit } from "~/server/audit";
import {
  allowHandoffRequest,
  handoffFailurePath,
  setHandoffCompletion,
  takeHandoffProof,
} from "~/server/auth/consentHandoff";
import {
  GUID_PATTERN,
  HANDOFF_TTL_MS,
  SELF_CONSENT_TTL_MS,
  deleteExpiredConsentStates,
  handoffRequesterAdmin,
  isHandoffToken,
  loadConsentState,
} from "~/server/consentState";
import { db } from "~/server/db";
import { isUniqueViolation } from "~/server/db/errors";
import {
  consentStates,
  memberships,
  msConnections,
  tenants,
} from "~/server/db/schema";
import { verifyManagedConsent } from "~/server/graph/msGraph";
import { notifyOps } from "~/server/ops";
import { requestDeadline } from "~/server/sync/deadline";
import { runSync } from "~/server/sync/runSync";

// The first sync after admin consent runs in after() below and shares this
// route's budget, so give it the same 300s every other sync path has.
export const maxDuration = 300;

// Microsoft's `error` and `error_description` are caller-controlled once a
// state is valid, so only machine codes reach an alert: an OAuth error code
// from the fixed list below (OAuth 2.0, OpenID Connect and Microsoft
// identity platform codes) and the AADSTS number, which is enough to look
// the cause up. Any other `error` value, however code-like, is reported as
// unrecognized, so no caller-chosen text can reach an alert.
const OAUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  "access_denied",
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "invalid_resource",
  "invalid_scope",
  "unauthorized_client",
  "unsupported_response_type",
  "server_error",
  "temporarily_unavailable",
  "consent_required",
  "interaction_required",
  "login_required",
  "account_selection_required",
]);
const AADSTS_PATTERN = /\bAADSTS\d{1,8}\b/;
const microsoftCodes = (
  error: string | null,
  description: string | null,
): string | null => {
  const codes: string[] = [];
  if (error) {
    codes.push(OAUTH_ERROR_CODES.has(error) ? error : "unrecognized error");
  }
  const aadsts = description?.match(AADSTS_PATTERN)?.[0];
  if (aadsts) codes.push(aadsts);
  return codes.length > 0 ? codes.join(" ") : null;
};

/** Validate Microsoft consent, bind the workspace and start its first sync. */
export const GET = async (req: NextRequest) => {
  const deadline = requestDeadline();
  const params = req.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const grantedTid = params.get("tenant")?.toLowerCase();
  const adminConsent = params.get("admin_consent");
  const error = params.get("error");
  const handoff = isHandoffToken(state);
  const fail = (code: string): never =>
    redirect(
      handoff
        ? handoffFailurePath(code)
        : `/app/connectors/microsoft?error=${code}`,
    );

  const proof = handoff ? await takeHandoffProof() : null;
  if (handoff && !(await allowHandoffRequest("callback", req.headers))) {
    return fail("rate_limited");
  }
  if (!state) return fail("missing_state");
  const stateRow = await loadConsentState(state);
  if (stateRow?.kind !== (handoff ? "handoff" : "self") || stateRow.usedAt) {
    return fail("invalid_state");
  }
  const ttl = handoff ? HANDOFF_TTL_MS : SELF_CONSENT_TTL_MS;
  await deleteExpiredConsentStates().catch(() => {
    console.error("[consent] expired state cleanup failed");
  });

  // From here on a real admin is mid-flow, so every rejection is alerted with
  // its reason: the redirect alone leaves no trace of why a connect failed.
  // Earlier rejections (no or unknown state) are anonymous and stay silent.
  // `why` is a fixed string per check and part of the dedup key, so distinct
  // reasons alert separately while a replayed callback alerts once per
  // workspace, code and reason within the state TTL. `ids` carries validated
  // GUIDs for the alert text only; keying on them would let a caller cycling
  // tenant ids bypass the cooldown.
  const reject = (code: string, why?: string, ids?: string): never => {
    const microsoft = microsoftCodes(error, params.get("error_description"));
    const reason = [why, ids, microsoft && `Microsoft: ${microsoft}`]
      .filter(Boolean)
      .join("; ");
    // Workspace ID only: alerts never name the person who started the flow.
    const workspace = stateRow.tenantId ?? "unknown";
    void notifyOps(
      `consent callback rejected: ${code} for workspace ${workspace}${reason ? ` (${reason})` : ""}`,
      {
        key: `consent-callback:${workspace}:${code}:${why ?? ""}`,
        cooldownMs: SELF_CONSENT_TTL_MS,
      },
    );
    return fail(code);
  };

  if (Date.now() - stateRow.createdAt.getTime() >= ttl) {
    return reject("expired_state");
  }

  if (error) {
    // Record a decline from the initiating browser so this attempt does not
    // count as a stall. A retry from the connector can issue a fresh state.
    if (
      !handoff &&
      stateRow.oid &&
      (await auth())?.user?.oid === stateRow.oid
    ) {
      await db
        .update(consentStates)
        .set({ usedAt: new Date() })
        .where(
          and(eq(consentStates.state, state), isNull(consentStates.usedAt)),
        );
    }
    return reject("consent_declined");
  }
  if (adminConsent !== "True" || !grantedTid) reject("consent_incomplete");
  // grantedTid is consumed below as the workspace tid and flows into the MSAL
  // authority URL; reject anything that is not a well-formed GUID before then.
  if (!GUID_PATTERN.test(grantedTid!)) {
    reject("consent_incomplete", "granted tenant is not a GUID");
  }

  if (!stateRow.oid || !stateRow.tenantId) {
    return reject("not_allowed", "state predates Entra sign-in");
  }
  const tenantId = stateRow.tenantId;
  const approver = proof?.phase === "grant" ? proof : null;
  if (handoff) {
    if (!env.CONNECTOR_CLIENT_ID || !env.CONNECTOR_CLIENT_SECRET) {
      return reject("not_configured");
    }
    // The share link fixes the destination workspace. An app-only token can
    // come from a previous grant, so demand independent proof that this
    // browser authenticated as a Microsoft admin in the exact granted tenant.
    // That proof is bound to this link by the signed short-lived cookie.
    if (!stateRow.tid || stateRow.tid.toLowerCase() !== grantedTid) {
      return reject("approval_tenant");
    }
    if (approver?.token !== state || approver.tid !== grantedTid) {
      return reject("approval_identity");
    }
  } else {
    const session = await auth();
    if (!session?.user?.oid || session.user.oid !== stateRow.oid) {
      return reject(
        "not_allowed",
        "browser session is not the user who started the flow",
      );
    }
  }

  // The plaintext `tenant` and `admin_consent` query params are forgeable:
  // anyone who starts their own flow and calls this callback directly can
  // supply an arbitrary tenant GUID. Prove Microsoft actually authorized the
  // granted tenant before binding. With the managed connector app configured,
  // an app-only token can only be acquired for a tenant that consented to that
  // app; without it (BYO-only), only the initiator's own home tenant (the
  // tenant their app registration belongs to) may be attached.
  if (env.CONNECTOR_CLIENT_ID && env.CONNECTOR_CLIENT_SECRET) {
    if (!(await verifyManagedConsent(grantedTid!, deadline))) {
      reject(
        "consent_not_granted",
        "no app-only token for the granted tenant",
        handoff ? undefined : `granted ${grantedTid}`,
      );
    }
  } else if (!stateRow.tid || stateRow.tid.toLowerCase() !== grantedTid) {
    reject("not_allowed", "granted tenant is not the initiator's home tenant");
  }

  const consumeConditions = () =>
    and(
      eq(consentStates.state, state),
      isNull(consentStates.usedAt),
      gt(consentStates.createdAt, new Date(Date.now() - ttl)),
    );

  if (!handoff) {
    // Keep the self flow's existing single-use and workspace membership checks.
    const consumed = await db
      .update(consentStates)
      .set({ usedAt: new Date() })
      .where(consumeConditions())
      .returning({ state: consentStates.state });
    if (!consumed.length) return fail("invalid_state");
    const ctx = await apiAccess("admin");
    if (!ctx)
      return reject("not_allowed", "not an admin of the active workspace");
    if (ctx.user.oid !== stateRow.oid || ctx.membership.oid !== stateRow.oid) {
      return reject(
        "not_allowed",
        "membership is not the user who started the flow",
      );
    }
    if (ctx.tenant.id !== tenantId) {
      return reject(
        "not_allowed",
        "active workspace is not the one the flow started from",
      );
    }
    if (ctx.tenant.tid && ctx.tenant.tid.toLowerCase() !== grantedTid) {
      return reject(
        "already_connected",
        "workspace is bound to a different tenant",
        `bound ${ctx.tenant.tid}, granted ${grantedTid}`,
      );
    }
  }

  const managedConnection = {
    mode: "managed" as const,
    tid: grantedTid!,
    appClientId: null,
    credType: null,
    secretEnc: null,
    certThumbprint: null,
    secretExpiresAt: null,
    lastVerifiedAt: new Date(),
    lastVerifyError: null,
  };

  try {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ tid: tenants.tid, isDemo: tenants.isDemo })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .for("no key update");
      if (!target || (handoff && target.isDemo)) return reject("not_allowed");

      const owner = await tx.query.tenants.findFirst({
        where: eq(sql`lower(${tenants.tid})`, grantedTid!),
      });
      if (owner && owner.id !== tenantId) {
        return reject(
          "tenant_taken",
          "granted tenant belongs to another workspace",
          handoff ? undefined : `granted ${grantedTid}, owner ${owner.id}`,
        );
      }
      if (handoff) {
        const [requester] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(handoffRequesterAdmin(tenantId, stateRow.oid!))
          .for("share");
        if (!requester)
          return reject(
            "not_allowed",
            "requester is no longer a workspace admin",
          );
        const conn = await tx.query.msConnections.findFirst({
          where: eq(msConnections.tenantId, tenantId),
        });
        // Holding the workspace lock keeps even a distinct valid callback
        // from replacing a binding. A failed write rolls back consumption.
        if (target.tid || conn) return reject("already_connected");
        const consumed = await tx
          .update(consentStates)
          .set({ usedAt: new Date() })
          .where(and(consumeConditions(), eq(consentStates.kind, "handoff")))
          .returning({ state: consentStates.state });
        if (!consumed.length) return fail("invalid_state");
      } else if (target.tid && target.tid.toLowerCase() !== grantedTid) {
        return reject(
          "already_connected",
          "workspace is bound to a different tenant",
          `bound ${target.tid}, granted ${grantedTid}`,
        );
      }

      await tx
        .update(tenants)
        .set({ tid: grantedTid!, consentedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      const connection = tx
        .insert(msConnections)
        .values({ tenantId, ...managedConnection });
      if (handoff) await connection;
      else
        await connection.onConflictDoUpdate({
          target: msConnections.tenantId,
          set: managedConnection,
        });
    });
  } catch (err) {
    // A different workspace can bind the granted tenant during this transaction.
    if (isUniqueViolation(err)) return reject("tenant_taken");
    throw err;
  }

  if (handoff && approver) {
    await audit(
      { tenant: { id: tenantId }, user: { oid: approver.oid } },
      "microsoft_connected_by_approval",
      { grantedTid },
    );
    await setHandoffCompletion(state);
    void notifyOps(
      `workspace ${tenantId} completed Microsoft consent by handoff, first sync starting`,
      {
        logLevel: "info",
      },
    );
  } else {
    (await cookies()).set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());
    void notifyOps(
      `workspace ${tenantId} connected its Microsoft tenant, first sync starting`,
    );
  }

  after(async () => {
    await runSync(tenantId, { deadline });
  });

  redirect(
    handoff
      ? "/connect/approve/complete"
      : "/app/connectors/microsoft?status=syncing",
  );
};
