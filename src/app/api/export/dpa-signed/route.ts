import { NextResponse } from "next/server";

import { isDpaLang, type DpaAgreementKind, type DpaLang } from "~/lib/dpa";
import { apiAccess } from "~/server/access";
import { db } from "~/server/db";
import { withTenant } from "~/server/db/tenant";
import { counterpartyOf, DPA_KINDS, getAgreement } from "~/server/dpa/records";
import { renderDpaPdf } from "~/server/dpa/renderDpa";

export const maxDuration = 60;

const isKind = (value: unknown): value is DpaAgreementKind =>
  DPA_KINDS.includes(value as DpaAgreementKind);

/**
 * Download of the DPA / AVV signed with the workspace's company. Unlike the
 * public pre-signed copy, this names a customer and a signatory, so it is
 * served only to members of the workspace and never cached. The record, not
 * the plan, decides: a workspace keeps its signed copy after a downgrade.
 * `?kind=controller|subprocessor` picks the agreement, `?lang=en|de` the
 * language of the rendered text.
 */
export const GET = async (req: Request) => {
  const ctx = await apiAccess("viewer");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const kind = params.get("kind") ?? "controller";
  if (!isKind(kind))
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  const langParam = params.get("lang");
  const lang: DpaLang = isDpaLang(langParam) ? langParam : "en";

  return withTenant(db, ctx.tenant.id, async () => {
    const agreement = await getAgreement(ctx.tenant.id, kind);
    if (!agreement)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const { buffer, filename } = await renderDpaPdf(
      lang,
      counterpartyOf(agreement),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
};
