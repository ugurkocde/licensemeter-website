"use server";

import { X509Certificate } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { byoConnectorEnabled } from "~/env";
import { GUID } from "~/lib/metering";
import type { ReclaimApprovalMode } from "~/lib/reclaim";
import {
  apiAccess,
  apiFeatureAccess,
  type AccessContext,
} from "~/server/access";
import { audit } from "~/server/audit";
import { encryptSecret } from "~/server/crypto";
import { db } from "~/server/db";
import { msConnections, reclaimConnections } from "~/server/db/schema";
import { rateLimitDurable } from "~/server/rateLimit";
import {
  loadReclaimConnection,
  reclaimSecretAad,
} from "~/server/reclaim/connection";
import {
  reclaimErrorText,
  ReclaimError,
  reservedClientIds,
  verifyReclaimCredential,
  type ReclaimCredential,
} from "~/server/reclaim/graph";

export type ReclaimActionResult = { ok: true } | { ok: false; error: string };

const PEM_MAX_LENGTH = 16384;
const DEMO_ERROR =
  "The sample workspace is read-only. Connect your own tenant to set up reclaim.";

const fail = (error: string): ReclaimActionResult => ({ ok: false, error });
const done = (): ReclaimActionResult => {
  revalidatePath("/app/reclaim");
  return { ok: true };
};

type Gate = { ctx: AccessContext } | { error: string };

/**
 * Granting or widening write access is an Owner decision on a plan that
 * includes reclaim. The page only hides the controls; this decides.
 */
const ownerGate = async (): Promise<Gate> => {
  const access = await apiFeatureAccess("reclaim", "owner");
  if (access.denied === "featureRequired")
    return { error: "One-click reclaim is included in the Pro plan." };
  if (!access.ctx)
    return { error: "Only a workspace Owner can change reclaim access." };
  if (access.ctx.tenant.isDemo || access.ctx.user.isDemo)
    return { error: DEMO_ERROR };
  return { ctx: access.ctx };
};

/** Managed consent granted directly in Entra, or still propagating. */
export async function verifyReclaimConsent(): Promise<ReclaimActionResult> {
  const gate = await ownerGate();
  if ("error" in gate) return fail(gate.error);
  const { ctx } = gate;
  if (!(await rateLimitDurable(`reclaim-verify:${ctx.tenant.id}`, 10, 600_000)))
    return fail("Please wait a moment before verifying again.");
  const connection = await loadReclaimConnection(ctx.tenant.id);
  const tid = ctx.tenant.tid?.toLowerCase();
  if (connection?.mode !== "managed" || connection.tid !== tid)
    return fail("Start the Microsoft consent from this page first.");
  try {
    await verifyReclaimCredential({ mode: "managed", tid }, []);
  } catch (err) {
    await db
      .update(reclaimConnections)
      .set({
        lastVerifyError: err instanceof ReclaimError ? err.code : "unavailable",
      })
      .where(eq(reclaimConnections.id, connection.id));
    return fail(reclaimErrorText(err));
  }
  const now = new Date();
  const [updated] = await db
    .update(reclaimConnections)
    .set({
      consentedAt: sql`coalesce(${reclaimConnections.consentedAt}, ${now.toISOString()}::timestamptz)`,
      lastVerifiedAt: now,
      lastVerifyError: null,
    })
    .where(
      and(
        eq(reclaimConnections.id, connection.id),
        eq(reclaimConnections.tid, tid),
      ),
    )
    .returning();
  if (!updated) return fail("The connection changed. Reload and try again.");
  if (!connection.consentedAt)
    await audit(ctx, "reclaim_connected", {
      mode: "managed",
      stage: "verified",
    });
  return done();
}

/** Connects the customer's own app registration that holds only the permission. */
export async function connectReclaimByo(
  formData: FormData,
): Promise<ReclaimActionResult> {
  const gate = await ownerGate();
  if ("error" in gate) return fail(gate.error);
  const { ctx } = gate;
  if (!byoConnectorEnabled())
    return fail(
      "Your own app registration is not enabled on this installation.",
    );
  const tid = ctx.tenant.tid?.toLowerCase();
  if (!tid) return fail("Connect Microsoft 365 to this workspace first.");
  if (!(await rateLimitDurable(`reclaim-byo:${ctx.tenant.id}`, 10, 600_000)))
    return fail("Please wait a moment before trying again.");

  const read = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const appClientId = read("appClientId").toLowerCase();
  const credType = read("credType");
  if (!GUID.test(appClientId))
    return fail("The application (client) ID must be a GUID.");
  if (credType !== "secret" && credType !== "cert")
    return fail("Choose a client secret or a certificate.");
  // A separate app keeps the read-only promise of the base connector checkable.
  if (reservedClientIds().some((id) => id.toLowerCase() === appClientId))
    return fail(
      "Use a separate app registration, not the sign-in, connector or metering app.",
    );
  const ms = await db.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, ctx.tenant.id),
  });
  if (ms?.appClientId?.toLowerCase() === appClientId)
    return fail(
      "Use a separate app registration, not the one your Microsoft 365 connector uses. The connector stays read-only.",
    );

  let cred: ReclaimCredential;
  let material: string;
  let certThumbprint: string | null = null;
  let secretExpiresAt: Date | null = null;
  if (credType === "secret") {
    material = read("secret");
    if (!material) return fail("The client secret is required.");
    if (material.length > 1000) return fail("The client secret is too long.");
    const expiry = read("secretExpiresAt");
    if (expiry) {
      const d = new Date(expiry);
      if (!Number.isNaN(d.getTime())) secretExpiresAt = d;
    }
    cred = {
      mode: "byo",
      credType: "secret",
      tid,
      clientId: appClientId,
      secret: material,
    };
  } else {
    material = read("privateKey");
    const certPem = read("cert");
    if (!material || !certPem)
      return fail("Both the private key and the certificate (PEM) are needed.");
    if (material.length > PEM_MAX_LENGTH || certPem.length > PEM_MAX_LENGTH)
      return fail(
        `The private key and certificate must each be under ${PEM_MAX_LENGTH} characters.`,
      );
    try {
      const x = new X509Certificate(certPem);
      certThumbprint = x.fingerprint.replace(/:/g, "").toLowerCase();
      const validTo = new Date(x.validTo);
      if (!Number.isNaN(validTo.getTime())) secretExpiresAt = validTo;
    } catch {
      return fail("The certificate (PEM) could not be read.");
    }
    cred = {
      mode: "byo",
      credType: "cert",
      tid,
      clientId: appClientId,
      privateKey: material,
      thumbprint: certThumbprint,
    };
  }

  const existing = await loadReclaimConnection(ctx.tenant.id);
  if (existing?.consentedAt && existing.mode === "managed")
    return fail(
      "LicenseMeter's reclaim app is connected. Disconnect it before using your own app.",
    );
  try {
    // The customer granted consent in Entra beforehand; answer now.
    await verifyReclaimCredential(cred, []);
  } catch (err) {
    return fail(reclaimErrorText(err));
  }
  const now = new Date();
  const values = {
    mode: "byo" as const,
    tid,
    appClientId,
    credType: cred.mode === "byo" ? cred.credType : null,
    secretEnc: encryptSecret(material, reclaimSecretAad(ctx.tenant.id)),
    certThumbprint,
    secretExpiresAt,
    consentedAt: now,
    lastVerifiedAt: now,
    lastVerifyError: null,
  };
  await db
    .insert(reclaimConnections)
    .values({ tenantId: ctx.tenant.id, ...values })
    .onConflictDoUpdate({
      target: reclaimConnections.tenantId,
      // A new id ends every consent state bound to the previous connection.
      set: { ...values, id: sql`gen_random_uuid()` },
    });
  await audit(ctx, "reclaim_connected", { mode: "byo", credType });
  return done();
}

export async function setReclaimApprovalMode(
  mode: ReclaimApprovalMode,
): Promise<ReclaimActionResult> {
  if (mode !== "two_person" && mode !== "single_admin")
    return fail("Choose an approval rule.");
  const gate = await ownerGate();
  if ("error" in gate) return fail(gate.error);
  const { ctx } = gate;
  const connection = await loadReclaimConnection(ctx.tenant.id);
  if (!connection) return fail("Connect reclaim first.");
  if (connection.approvalMode === mode) return done();
  await db
    .update(reclaimConnections)
    .set({ approvalMode: mode })
    .where(eq(reclaimConnections.id, connection.id));
  await audit(ctx, "reclaim_approval_mode_changed", {
    from: connection.approvalMode,
    to: mode,
  });
  return done();
}

/**
 * Removing write access only takes power away, so any Admin may do it, and it
 * stays possible after a downgrade. Microsoft keeps the consent until it is
 * removed in Entra; the page says how.
 */
export async function disconnectReclaim(): Promise<ReclaimActionResult> {
  const ctx = await apiAccess("admin");
  if (!ctx) return fail("Only a workspace Admin can disconnect reclaim.");
  if (ctx.tenant.isDemo || ctx.user.isDemo) return fail(DEMO_ERROR);
  const [removed] = await db
    .delete(reclaimConnections)
    .where(eq(reclaimConnections.tenantId, ctx.tenant.id))
    .returning({ mode: reclaimConnections.mode });
  if (removed) await audit(ctx, "reclaim_disconnected", { mode: removed.mode });
  return done();
}
