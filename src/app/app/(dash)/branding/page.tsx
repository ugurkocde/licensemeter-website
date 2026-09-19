import { BrandingForm } from "~/components/branding/BrandingForm";
import { ReportHeaderPreview } from "~/components/branding/ReportHeaderPreview";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { workspaceLabel } from "~/lib/format";
import { UPGRADE_PATH } from "~/lib/upgrade";
import { requireAccess } from "~/server/access";
import { getBrandingSettings } from "~/server/billing/branding";
import { hasFeature } from "~/server/entitlement";

export const metadata = { title: "Report branding" };

export default async function BrandingPage() {
  const ctx = await requireAccess("viewer");

  if (!hasFeature(ctx.entitlement, "whiteLabel")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">
            Report branding
          </h1>
        </header>
        <div className="rise rise-2">
          <FeatureLockPanel
            feature="whiteLabel"
            overQuantity={ctx.entitlement.state === "overQuantity"}
          />
        </div>
      </div>
    );
  }

  const settings = await getBrandingSettings(ctx);
  const workspaceName = workspaceLabel(ctx.tenant);
  const { branding } = settings;
  const applied = Boolean(branding.name ?? branding.logo);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">
          Report branding
        </h1>
        <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-relaxed">
          PDF waste reports carry your logo, name and colour instead of the
          LicenseMeter marks, both the report you download and the monthly
          report sent by email.
        </p>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        {!settings.account ? (
          <Card title="No MSP account">
            <p className="text-ink-soft max-w-2xl text-sm leading-relaxed">
              Branding belongs to an MSP account and applies to the client
              workspaces attached to it. {workspaceName} is not attached to an
              MSP account yet, so its reports use the LicenseMeter branding.
            </p>
            <ButtonLink href={UPGRADE_PATH} className="mt-4">
              Plan and MSP account
            </ButtonLink>
          </Card>
        ) : settings.isOwner ? (
          <>
            <Card title="Your brand">
              <BrandingForm initial={branding} workspaceName={workspaceName} />
            </Card>
            <Card title="Where it applies">
              <p className="text-ink-soft max-w-2xl text-sm leading-relaxed">
                One branding for the whole MSP account: it applies to every
                client workspace attached to the account and covered by your MSP
                plan. A workspace beyond the covered number keeps the
                LicenseMeter branding.
              </p>
              <ul className="border-line divide-line mt-3 divide-y border-t text-sm">
                {settings.workspaces.map((w) => (
                  <li key={w.id} className="py-2">
                    {w.name}
                    {w.id === ctx.tenant.id && (
                      <span className="text-ink-faint"> (this workspace)</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : (
          <Card title="Current branding">
            <p className="text-ink-soft mb-4 max-w-2xl text-sm leading-relaxed">
              {applied
                ? "Reports of this workspace carry the branding of the MSP account it is attached to, like every client workspace of that account."
                : "The MSP account this workspace is attached to has not set any branding, so reports use the LicenseMeter branding."}{" "}
              Only the owner of the MSP account can change it.
            </p>
            {applied && (
              <ReportHeaderPreview
                branding={branding}
                workspaceName={workspaceName}
              />
            )}
          </Card>
        )}

        <Card title="Sample report">
          <p className="text-ink-soft max-w-2xl text-sm leading-relaxed">
            Download the current report of {workspaceName} to check the saved
            branding in the real PDF.
          </p>
          <ButtonAnchor href="/api/export/report" className="mt-4">
            Download a sample report
          </ButtonAnchor>
        </Card>
      </div>
    </div>
  );
}
