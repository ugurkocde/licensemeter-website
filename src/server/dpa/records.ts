import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  DPA_VERSION,
  type DpaAgreementKind,
  type DpaCounterparty,
  type DpaLang,
} from "~/lib/dpa";
import { billingEnabled } from "~/env";
import { hasRole, type AccessContext } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { dpaAcceptances, dpaAgreements } from "~/server/db/schema";
import { hasFeature, planFor } from "~/server/entitlement";
import type { PaidPlan } from "~/server/types";

/**
 * The two records a workspace keeps of the data processing agreement: the
 * online acceptance of the current version (every plan, owner or admin) and
 * the copy signed with a named company (Pro and MSP, owner only). Both are
 * write-once per version: a repeat submission returns the row that exists.
 * The shared demo workspace never records either.
 */

export type AcceptanceRow = typeof dpaAcceptances.$inferSelect;
export type AgreementRow = typeof dpaAgreements.$inferSelect;

export type AcceptanceResult =
  | { ok: true; record: AcceptanceRow; created: boolean }
  | { ok: false; error: "forbidden" | "demo" | "selfHosted" };

export type AgreementResult =
  | { ok: true; record: AgreementRow; created: boolean }
  | {
      ok: false;
      error:
        | "forbidden"
        | "demo"
        | "selfHosted"
        | "invalid"
        | "kindNotAvailable";
    }
  | { ok: false; error: "featureRequired"; plan: PaidPlan };

export const DPA_KINDS = ["controller", "subprocessor"] as const;

export const agreementInputSchema = z.object({
  kind: z.enum(DPA_KINDS),
  language: z.enum(["en", "de"]),
  companyName: z.string().trim().min(2).max(120),
  companyAddress: z.string().trim().min(5).max(300),
  signerName: z.string().trim().min(2).max(80),
  signerTitle: z.string().trim().min(2).max(80),
  signerEmail: z.string().trim().email().max(254),
});

export type AgreementInput = z.infer<typeof agreementInputSchema>;

const isDemo = (ctx: AccessContext) => ctx.tenant.isDemo || ctx.user.isDemo;

/** The kinds a plan can sign: the sub-processor variant is MSP only. */
export const availableKinds = (ctx: AccessContext): DpaAgreementKind[] =>
  ctx.entitlement.plan === "msp" ? [...DPA_KINDS] : ["controller"];

/** The acceptance of the current version, or null. */
export const getAcceptance = async (
  tenantId: string,
): Promise<AcceptanceRow | null> => {
  const [row] = await db
    .select()
    .from(dpaAcceptances)
    .where(
      and(
        eq(dpaAcceptances.tenantId, tenantId),
        eq(dpaAcceptances.version, DPA_VERSION),
      ),
    )
    .limit(1);
  return row ?? null;
};

/**
 * Records the caller's acceptance of the current version. The unique index on
 * (tenant, version) makes a concurrent second submission a no-op, and the row
 * that won is returned either way.
 */
export const recordAcceptance = async (
  ctx: AccessContext,
  language: DpaLang,
): Promise<AcceptanceResult> => {
  if (!hasRole(ctx, "admin")) return { ok: false, error: "forbidden" };
  if (isDemo(ctx)) return { ok: false, error: "demo" };
  // A self-hosted install operates the software itself: LicenseMeter is not a
  // processor of its data, so there is nothing to accept.
  if (!billingEnabled()) return { ok: false, error: "selfHosted" };

  const [inserted] = await db
    .insert(dpaAcceptances)
    .values({
      tenantId: ctx.tenant.id,
      version: DPA_VERSION,
      language,
      acceptedByKey: ctx.user.oid,
      acceptedByEmail: ctx.membership.email,
    })
    .onConflictDoNothing({
      target: [dpaAcceptances.tenantId, dpaAcceptances.version],
    })
    .returning();

  if (!inserted) {
    const existing = await getAcceptance(ctx.tenant.id);
    if (!existing) throw new Error("DPA acceptance vanished after conflict");
    return { ok: true, record: existing, created: false };
  }

  await audit(ctx, "dpa_accepted", { version: DPA_VERSION, language });
  return { ok: true, record: inserted, created: true };
};

/** The signed agreement of one kind for the current version, or null. */
export const getAgreement = async (
  tenantId: string,
  kind: DpaAgreementKind,
): Promise<AgreementRow | null> => {
  const [row] = await db
    .select()
    .from(dpaAgreements)
    .where(
      and(
        eq(dpaAgreements.tenantId, tenantId),
        eq(dpaAgreements.kind, kind),
        eq(dpaAgreements.version, DPA_VERSION),
      ),
    )
    .limit(1);
  return row ?? null;
};

/**
 * Signs the current version with the company named in the input. The plan
 * must include signedDpa, decided here so the page's lock panel is never the
 * only guard. A second submission for the same kind returns the existing
 * record unchanged: a signed agreement is not overwritten.
 */
export const recordAgreement = async (
  ctx: AccessContext,
  input: unknown,
): Promise<AgreementResult> => {
  if (!hasRole(ctx, "owner")) return { ok: false, error: "forbidden" };
  if (isDemo(ctx)) return { ok: false, error: "demo" };
  if (!billingEnabled()) return { ok: false, error: "selfHosted" };
  if (!hasFeature(ctx.entitlement, "signedDpa")) {
    return { ok: false, error: "featureRequired", plan: planFor("signedDpa") };
  }

  const parsed = agreementInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;
  if (!availableKinds(ctx).includes(data.kind)) {
    return { ok: false, error: "kindNotAvailable" };
  }

  const [inserted] = await db
    .insert(dpaAgreements)
    .values({
      tenantId: ctx.tenant.id,
      kind: data.kind,
      version: DPA_VERSION,
      language: data.language,
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      signerName: data.signerName,
      signerTitle: data.signerTitle,
      signerEmail: data.signerEmail,
      signedByKey: ctx.user.oid,
    })
    .onConflictDoNothing({
      target: [
        dpaAgreements.tenantId,
        dpaAgreements.kind,
        dpaAgreements.version,
      ],
    })
    .returning();

  if (!inserted) {
    const existing = await getAgreement(ctx.tenant.id, data.kind);
    if (!existing) throw new Error("DPA agreement vanished after conflict");
    return { ok: true, record: existing, created: false };
  }

  await audit(ctx, "dpa_signed", {
    version: DPA_VERSION,
    kind: data.kind,
    language: data.language,
    companyName: data.companyName,
    signerName: data.signerName,
  });
  return { ok: true, record: inserted, created: true };
};

/** The signed row as the counterparty the document builder names. */
export const counterpartyOf = (row: AgreementRow): DpaCounterparty => ({
  kind: row.kind,
  companyName: row.companyName,
  companyAddress: row.companyAddress,
  signerName: row.signerName,
  signerTitle: row.signerTitle,
  signerEmail: row.signerEmail,
  signedAt: row.signedAt,
});
