import type { Metadata } from "next";
import { billingEnabled } from "~/env";

import type { AgreementNotice } from "~/app/app/(dash)/agreement/actions";
import { AcceptanceForm } from "~/components/agreement/AcceptanceForm";
import { AcceptanceRecord } from "~/components/agreement/AcceptanceRecord";
import { SignedAgreementForm } from "~/components/agreement/SignedAgreementForm";
import { SignedAgreementRecord } from "~/components/agreement/SignedAgreementRecord";
import { ButtonAnchor, Card } from "~/components/ui";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import { buildDpa, DPA_VERSION } from "~/lib/dpa";
import { hasRole, requireAccess } from "~/server/access";
import {
  availableKinds,
  getAcceptance,
  getAgreement,
} from "~/server/dpa/records";
import { hasFeature } from "~/server/entitlement";

export const metadata: Metadata = { title: "Data processing agreement" };

const NOTICE_TEXT: Record<AgreementNotice, string> = {
  forbidden: "Only an owner of this workspace can do that.",
  demo: "The demo workspace has no agreement to record. Connect your own tenant first.",
  selfHosted:
    "This install is self-hosted. LicenseMeter does not process your data, so there is no agreement to record.",
  language: "Choose English or German as the language of record.",
  invalid:
    "Check the company name, address, signatory name, title and email, then try again.",
  featureRequired:
    "A signed agreement is included in Pro and MSP. Your plan does not include it.",
  kindNotAvailable: "The sub-processor agreement is available on MSP only.",
};

const isNotice = (value: unknown): value is AgreementNotice =>
  typeof value === "string" && value in NOTICE_TEXT;

/** The gate above the page already carries the accept form for owners and admins. */
export default async function AgreementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const { notice } = await searchParams;
  const isDemo = ctx.tenant.isDemo || ctx.user.isDemo;
  const canAccept = hasRole(ctx, "admin") && !isDemo;
  const canSign = hasRole(ctx, "owner") && !isDemo;
  const signedDpa = hasFeature(ctx.entitlement, "signedDpa");

  const kinds = availableKinds(ctx);
  const [acceptance, ...agreements] = await Promise.all([
    getAcceptance(ctx.tenant.id),
    ...kinds.map((kind) => getAgreement(ctx.tenant.id, kind)),
  ]);
  const signed = agreements.flatMap((row) => (row ? [row] : []));
  const openKinds = kinds.filter(
    (kind) => !signed.some((row) => row.kind === kind),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">
          Data processing agreement
        </h1>
        <p className="text-ink-soft mt-1 max-w-2xl text-sm">
          LicenseMeter processes directory and license metadata on your behalf,
          so an agreement under Art. 28 GDPR (AVV) comes with every workspace.
          The current version is {DPA_VERSION}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonAnchor href="/dpa" target="_blank" rel="noopener">
            Read the full text
          </ButtonAnchor>
          <ButtonAnchor href="/api/export/dpa?lang=en">
            PDF (English)
          </ButtonAnchor>
          <ButtonAnchor href="/api/export/dpa?lang=de">
            PDF (German)
          </ButtonAnchor>
        </div>
      </header>

      {!billingEnabled() && (
        <Card title="Self-hosted install">
          <p className="text-ink-soft text-sm">
            You operate this instance yourself, so LicenseMeter is not a
            processor of your data and there is nothing to accept or sign here.
            The public text above is for reference only.
          </p>
        </Card>
      )}

      {isNotice(notice) && (
        <p
          role="alert"
          className="border-danger bg-danger-soft text-danger-text rounded-2xl border px-5 py-3 text-sm"
        >
          {NOTICE_TEXT[notice]}
        </p>
      )}

      {billingEnabled() && (
        <div className="rise rise-2 flex flex-col gap-6">
          <Card title="Online acceptance">
            {acceptance ? (
              <AcceptanceRecord record={acceptance} />
            ) : isDemo ? (
              <p className="text-ink-soft text-sm">
                The demo workspace has no agreement to accept. Connect your own
                tenant to record one.
              </p>
            ) : canAccept && billingEnabled() ? (
              // The layout already shows the acceptance panel at the top of
              // every page while it is open; a second form here would be noise.
              <p className="text-ink-soft text-sm">
                Version {DPA_VERSION} has not been accepted yet. Use the panel
                at the top of this page.
              </p>
            ) : canAccept ? (
              <>
                <p className="text-ink-soft mb-4 text-sm">
                  Version {DPA_VERSION} has not been accepted yet.
                </p>
                <AcceptanceForm
                  summary={buildDpa("en").summary}
                  idPrefix="dpa-page"
                  defaultLang="en"
                />
              </>
            ) : (
              <p className="text-ink-soft text-sm">
                Version {DPA_VERSION} has not been accepted yet. An owner or
                admin of this workspace can accept it.
              </p>
            )}
          </Card>

          {signedDpa ? (
            <Card title="Signed with your company">
              <div className="flex flex-col gap-6">
                {signed.map((row) => (
                  <SignedAgreementRecord key={row.id} record={row} />
                ))}
                {openKinds.length > 0 &&
                  (isDemo ? (
                    <p className="text-ink-soft text-sm">
                      The demo workspace has no agreement to sign.
                    </p>
                  ) : canSign ? (
                    <>
                      {signed.length > 0 && (
                        <hr className="border-line" aria-hidden="true" />
                      )}
                      <p className="text-ink-soft text-sm">
                        {signed.length > 0
                          ? "The second agreement can be signed below."
                          : "Sign the agreement with your company as the named party and download the copy signed by both sides."}
                      </p>
                      <SignedAgreementForm kinds={openKinds} defaultLang="en" />
                    </>
                  ) : (
                    <p className="text-ink-soft text-sm">
                      {signed.length > 0
                        ? "An owner of this workspace can sign the second agreement."
                        : "Not signed yet. An owner of this workspace can sign it."}
                    </p>
                  ))}
                <p className="text-ink-faint border-line border-t pt-4 text-xs">
                  LicenseMeter signs its own agreement. Customer templates are
                  not negotiated on Pro.
                </p>
              </div>
            </Card>
          ) : (
            <FeatureLockPanel
              feature="signedDpa"
              overQuantity={ctx.entitlement.state === "overQuantity"}
            />
          )}
        </div>
      )}
    </div>
  );
}
