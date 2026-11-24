import { and, eq, isNull, lt, sql } from "drizzle-orm";
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
import { withSourceLock } from "~/server/connectorPurge";
import { db } from "~/server/db";
import { consentStates, msConnections, tenants } from "~/server/db/schema";
import { verifyManagedConsent } from "~/server/graph/msGraph";
import { notifyOps } from "~/server/ops";
import { requestDeadline } from "~/server/sync/deadline";
import { runSync } from "~/server/sync/runSync";

// The first sync after admin consent runs in after() below and shares this
// route's budget, so give it the same 300s every other sync path has.
export const maxDuration = 300;

const STATE_TTL_MS = 15 * 60 * 1000;

// Microsoft tenant IDs are GUIDs. Pin the shape before grantedTid is persisted
// or interpolated into the MSAL authority URL
// (https://login.microsoftonline.com/${tid}), so a malformed `tenant` callback
// param can never alter that authority.
const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (code: string): never =>
  redirect(`/app/connectors/microsoft?error=${code}`);

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

/**
 * Admin-consent return leg. Validates the state nonce, requires the browser
 * session of the user who started the flow, attaches the granted Microsoft
 * tenant to the workspace the flow was started from, and starts the first sync.
 */
export const GET = async (req: NextRequest) => {
  // The first sync runs inside after(), so the deadline covers this handler.
  const deadline = requestDeadline();
  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const grantedTid = params.get("tenant");
  const adminConsent = params.get("admin_consent");
  const error = params.get("error");

  if (!state) fail("missing_state");

  // Single-use, time-limited state row bound to the initiating user.
  const stateRow = await db.query.consentStates.findFirst({
    where: and(eq(consentStates.state, state!), isNull(consentStates.usedAt)),
  });
  if (!stateRow) fail("invalid_state");

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
    const workspace = stateRow!.tenantId ?? "unknown";
    void notifyOps(
      `consent callback rejected: ${code} for workspace ${workspace}${reason ? ` (${reason})` : ""}`,
      {
        key: `consent-callback:${workspace}:${code}:${why ?? ""}`,
        cooldownMs: STATE_TTL_MS,
      },
    );
    return fail(code);
  };

  if (Date.now() - stateRow!.createdAt.getTime() > STATE_TTL_MS) {
    reject("expired_state");
  }

  // Opportunistic cleanup of stale nonces.
  after(async () => {
    await db
      .delete(consentStates)
      .where(
        lt(consentStates.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      );
  });

  // Validate the consent result BEFORE consuming the nonce, so a declined or
  // incomplete dialog does not burn the state and the user can simply retry.
  // The granted tenant may differ from the initiator's home tenant (MSP /
  // consultant flow): the customer's Global Admin completing the Microsoft
  // dialog IS the authorization; the initiator becomes the workspace owner.
  if (error) reject("consent_declined");
  if (adminConsent !== "True" || !grantedTid) reject("consent_incomplete");
  // grantedTid is consumed below as the workspace tid and flows into the MSAL
  // authority URL; reject anything that is not a well-formed GUID before then.
  if (!GUID_PATTERN.test(grantedTid!)) {
    reject("consent_incomplete", "granted tenant is not a GUID");
  }

  // The browser finishing the flow must be the one that started it: the same
  // Entra object id, for every flow. Checked before the nonce is consumed so a
  // mismatch does not burn a valid state. A state without an object id (filed
  // before sign-in moved to Entra) can no longer be finished; starting again
  // takes one click.
  if (!stateRow!.oid || !stateRow!.tenantId) {
    reject("not_allowed", "state predates Entra sign-in");
  }
  const session = await auth();
  if (!session?.user?.oid || session.user.oid !== stateRow!.oid) {
    reject(
      "not_allowed",
      "browser session is not the user who started the flow",
    );
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
        `granted ${grantedTid}`,
      );
    }
  } else if (!stateRow!.tid || stateRow!.tid !== grantedTid) {
    reject("not_allowed", "granted tenant is not the initiator's home tenant");
  }

  // Atomically consume the single-use nonce: a concurrent duplicate callback
  // (double-submit / proxy retry) loses the race here instead of both binding
  // ownership and starting two first syncs. Declined/expired consent returned
  // above, so a retriable failure never burns the nonce.
  const consumed = await db
    .update(consentStates)
    .set({ usedAt: new Date() })
    .where(and(eq(consentStates.state, state!), isNull(consentStates.usedAt)))
    .returning({ state: consentStates.state });
  if (consumed.length === 0) fail("invalid_state");

  // Managed connector reset applied on every (re)connect: clears any BYO
  // credential columns so the sync uses the central env app.
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

  // Workspace-first model: the user already has a workspace (provisioned on
  // first sign-in). Microsoft attaches to THAT workspace as a connector instead
  // of spawning a duplicate. The initiator must be an admin/owner of it, judged
  // by the memberships of their object id right now, not by the state row.
  const ctx = await apiAccess("admin");
  if (!ctx)
    return reject("not_allowed", "not an admin of the active workspace");
  if (ctx.user.oid !== stateRow!.oid || ctx.membership.oid !== stateRow!.oid) {
    return reject(
      "not_allowed",
      "membership is not the user who started the flow",
    );
  }
  // The consent must land on the workspace it was started from, not on
  // whichever workspace is active in the browser at callback time.
  if (ctx.tenant.id !== stateRow!.tenantId) {
    return reject(
      "not_allowed",
      "active workspace is not the one the flow started from",
    );
  }
  const target = ctx.tenant;
  // One workspace per Microsoft tenant: refuse to steal a tid bound elsewhere.
  const owner = await db.query.tenants.findFirst({
    where: eq(tenants.tid, grantedTid!),
  });
  if (owner && owner.id !== target.id) {
    return reject(
      "tenant_taken",
      "granted tenant belongs to another workspace",
      `granted ${grantedTid}, owner ${owner.id}`,
    );
  }
  // Refuse to silently repoint a workspace already bound to another tenant.
  if (target.tid && target.tid !== grantedTid) {
    return reject(
      "already_connected",
      "workspace is bound to a different tenant",
      `bound ${target.tid}, granted ${grantedTid}`,
    );
  }

  // Under the source lock with a new generation, so a sync that read under a
  // previous connection never writes its data (see connectorPurge).
  await withSourceLock(target.id, async (tx) => {
    await tx
      .insert(msConnections)
      .values({ tenantId: target.id, ...managedConnection })
      .onConflictDoUpdate({
        target: msConnections.tenantId,
        set: { ...managedConnection, generation: sql`gen_random_uuid()` },
      });
    await tx
      .update(tenants)
      .set({
        tid: grantedTid!,
        consentedAt: new Date(),
      })
      .where(eq(tenants.id, target.id));
  });
  const tenantId = target.id;

  // Make the connected workspace active so the user lands on it, not the empty
  // one they may have started from.
  (await cookies()).set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());

  // The single most important founder signal there is.
  void notifyOps(
    `workspace ${tenantId} connected its Microsoft tenant, first sync starting`,
  );

  // First sync runs after the redirect is sent; the connect page polls status.
  after(async () => {
    await runSync(tenantId, { deadline });
  });

  redirect("/app/connectors/microsoft?status=syncing");
};
