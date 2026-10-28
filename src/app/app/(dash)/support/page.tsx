import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { SupportForm } from "~/components/SupportForm";
import { Card, Pill } from "~/components/ui";
import { env } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { planBadge, planName } from "~/lib/planLabel";
import { requireAccess } from "~/server/access";
import { auth } from "~/server/auth";

export const metadata: Metadata = { title: "Support" };

const DOCS_URL = "https://docs.licensemeter.com/";

const detailLabelClass = "text-ink-faint";
const detailValueClass = "mt-0.5 font-medium break-words";

export default async function AppSupportPage() {
  const ctx = await requireAccess("viewer");
  const isDemo = ctx.tenant.isDemo;
  const session = await auth();
  const email = session?.user.email ?? ctx.user.upn;
  const workspace = workspaceLabel(ctx.tenant);
  const badge = planBadge(ctx.entitlement);
  const planLabel = isDemo
    ? "Demo"
    : ctx.entitlement.state === "selfHosted"
      ? "Self-hosted"
      : planName(ctx.entitlement.plan);
  const supportManagedLocally =
    env.SELF_HOSTED === "true" && !env.SUPPORT_TO_EMAIL;
  const supportIncluded =
    !isDemo && ctx.entitlement.state !== "selfHosted"
      ? ctx.entitlement.plan !== "free"
      : false;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Support</h1>
        <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-6">
          Tell us what you are working on and where you got stuck. Your
          workspace stays open in the sidebar while you write.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rise rise-2 min-w-0">
          <Card
            title="Send a support request"
            badge={
              badge ? <Pill tone={badge.tone}>{badge.label}</Pill> : undefined
            }
          >
            {supportManagedLocally ? (
              <div className="flex flex-col gap-3">
                <p className="text-ink text-sm font-medium">
                  Support for this installation is handled locally.
                </p>
                <p className="text-ink-soft text-sm leading-6">
                  This self-hosted workspace does not send requests to Ugurlabs.
                  Contact the administrator who runs LicenseMeter for your
                  organization.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div
                  className={`rounded-xl border p-4 text-sm leading-6 ${
                    supportIncluded
                      ? "border-brand/20 bg-brand-soft text-brand-deep"
                      : "border-line bg-canvas text-ink-soft"
                  }`}
                >
                  {isDemo ? (
                    <>
                      You are exploring the shared demo workspace. We filled in
                      the demo account details to show how this works. Replace
                      them with your own name and email address if you would
                      like us to reply to you directly.
                    </>
                  ) : ctx.entitlement.state === "selfHosted" ? (
                    <>
                      Requests from this page go to the support address
                      configured for this installation.
                    </>
                  ) : supportIncluded ? (
                    <>
                      Email support is included with your {planLabel} plan. We
                      will reply to the address in the form.
                    </>
                  ) : (
                    <>
                      Email support is included with Pro and MSP. On the Free
                      plan you can still write to us here, and we answer as time
                      allows with no commitment.{" "}
                      <Link
                        href="/app/billing"
                        className="text-brand-deep font-medium underline underline-offset-4"
                      >
                        Review your plan
                      </Link>
                      .
                    </>
                  )}
                </div>

                <SupportForm
                  siteKey={process.env.SUPPORT_TURNSTILE_SITE_KEY}
                  supportEmail={env.SUPPORT_TO_EMAIL}
                  initialName={ctx.user.name}
                  initialEmail={email}
                  successHref="/app"
                  successLabel="Back to Overview"
                  privacyInNewTab
                />
              </div>
            )}
          </Card>
        </div>

        <aside
          aria-label="Support information"
          className="rise rise-3 flex min-w-0 flex-col gap-6"
        >
          <Card title="Your workspace">
            <dl className="grid gap-y-4 text-sm">
              <div>
                <dt className={detailLabelClass}>Workspace</dt>
                <dd className={detailValueClass}>{workspace}</dd>
              </div>
              <div>
                <dt className={detailLabelClass}>Plan</dt>
                <dd className={detailValueClass}>
                  {planLabel}
                  {badge?.detail ? (
                    <span className="text-ink-soft block text-xs font-normal">
                      {badge.detail}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className={detailLabelClass}>Signed in as</dt>
                <dd className={detailValueClass}>
                  {ctx.user.name || "Not provided"}
                  {email ? (
                    <span className="text-ink-soft block text-xs font-normal break-all">
                      {email}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className={detailLabelClass}>Your role</dt>
                <dd className={`${detailValueClass} capitalize`}>
                  {ctx.membership.role}
                </dd>
              </div>
            </dl>
            <p className="text-ink-faint mt-4 text-xs leading-5">
              Include the workspace name in your message when the issue only
              affects this workspace.
            </p>
          </Card>

          <Card title="Before you write">
            <ul className="divide-line divide-y text-sm">
              <li className="py-3 first:pt-0">
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:text-brand-text group inline-flex items-start gap-1 font-medium"
                >
                  <span>
                    Documentation
                    <span className="sr-only">, opens in a new tab</span>
                    <span className="text-ink-soft mt-0.5 block text-xs font-normal">
                      Setup guides and product reference.
                    </span>
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-sidebar-soft mt-0.5 size-4 shrink-0 transition group-hover:text-current"
                  />
                </a>
              </li>
              <li className="py-3">
                <a
                  href="/status"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:text-brand-text group inline-flex items-start gap-1 font-medium"
                >
                  <span>
                    Service status
                    <span className="sr-only">, opens in a new tab</span>
                    <span className="text-ink-soft mt-0.5 block text-xs font-normal">
                      Check for a current incident or provider issue.
                    </span>
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-sidebar-soft mt-0.5 size-4 shrink-0 transition group-hover:text-current"
                  />
                </a>
              </li>
              <li className="py-3 last:pb-0">
                <Link
                  href="/app/billing"
                  className="text-ink hover:text-brand-text font-medium"
                >
                  Plan and billing
                  <span className="text-ink-soft mt-0.5 block text-xs font-normal">
                    Review your plan, billing state, and support coverage.
                  </span>
                </Link>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
