import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "~/components/BrandMark";
import { ChangelogBell } from "~/components/changelog/ChangelogBell";
import {
  AccessRequestStrip,
  ApproverRequestBanner,
} from "~/components/workspace/AccessRequestStrip";
import { workspaceHasConnectorOrData } from "~/server/workspaceState";
import { MobileNav } from "~/components/workspace/MobileNav";
import { NavLinks } from "~/components/workspace/NavLinks";
import { PlanBadge } from "~/components/workspace/PlanBadge";
import { WorkspaceSwitcher } from "~/components/workspace/WorkspaceSwitcher";
import { workspaceLabel } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  accessRequestNoticesOf,
  pendingJoinRequestCount,
} from "~/server/domainJoin";
import { signOutAction } from "~/app/auth/actions";

/* Auth already gates these routes; noindex closes the gap robots.txt leaves
 * (Disallow stops crawling, not indexing of externally linked URLs). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireAccess("viewer");
  const tenantName = workspaceLabel(ctx.tenant);
  // The demo sign-in is shared by every visitor, so it has no account page.
  const accountEnabled = !ctx.user.isDemo;
  // Requesters see their status; approvers see requests for the active workspace.
  const [waitingOn, pendingAccessRequests] = await Promise.all([
    accountEnabled
      ? accessRequestNoticesOf(db, ctx.user.oid)
      : Promise.resolve([]),
    accountEnabled && hasRole(ctx, "admin")
      ? pendingJoinRequestCount(db, ctx.tenant.id)
      : Promise.resolve(0),
  ]);

  const fullCardOnOverview =
    waitingOn.length > 0 &&
    !ctx.tenant.isDemo &&
    !(await workspaceHasConnectorOrData(ctx.tenant.id));

  return (
    <div className="bg-canvas min-h-screen lg:flex">
      <a
        href="#content"
        className="focus:border-ink focus:bg-canvas focus:text-ink sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <MobileNav
        tenantName={tenantName}
        isDemo={ctx.tenant.isDemo}
        userName={ctx.user.name}
        role={ctx.membership.role}
        accountEnabled={accountEnabled}
        showPortfolio={ctx.workspaces.length > 1}
        workspaces={ctx.workspaces}
        activeId={ctx.tenant.id}
        entitlement={ctx.entitlement}
        pendingAccessRequests={pendingAccessRequests}
      />

      <aside className="bg-sidebar border-line sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r lg:flex">
        <div className="flex items-center justify-between pt-6 pr-3 pb-7 pl-5">
          <Link href="/app" className="flex items-center gap-2">
            <BrandMark size={20} tone="light" />
            <span className="font-display text-ink text-lg tracking-tight">
              License<span className="text-brand-text">Meter</span>
            </span>
          </Link>
          <ChangelogBell />
        </div>

        <div className="border-sidebar-line border-y px-5 py-3">
          {ctx.workspaces.length > 1 ? (
            <WorkspaceSwitcher
              workspaces={ctx.workspaces}
              activeId={ctx.tenant.id}
            />
          ) : (
            <div className="text-ink truncate text-sm font-medium">
              {tenantName}
            </div>
          )}
          <div className="text-sidebar-soft mt-0.5 text-[11px] tracking-wider uppercase">
            {ctx.tenant.isDemo ? "Demo workspace" : "Workspace"}
          </div>
          <PlanBadge entitlement={ctx.entitlement} className="mt-2" />
        </div>

        <div className="mt-4 flex-1">
          <NavLinks
            showPortfolio={ctx.workspaces.length > 1}
            entitlement={ctx.entitlement}
            pendingAccessRequests={pendingAccessRequests}
          />
        </div>

        <div className="border-sidebar-line border-t px-5 py-4">
          {accountEnabled ? (
            <Link
              href="/app/account"
              className="group block"
              aria-label="Account settings"
            >
              <div className="text-ink truncate text-sm underline-offset-4 group-hover:underline">
                {ctx.user.name}
              </div>
              <div className="text-sidebar-soft mt-0.5 text-[11px] tracking-wider uppercase">
                {ctx.membership.role} · Account
              </div>
            </Link>
          ) : (
            <>
              <div className="text-ink truncate text-sm">{ctx.user.name}</div>
              <div className="text-sidebar-soft mt-0.5 text-[11px] tracking-wider uppercase">
                {ctx.membership.role}
              </div>
            </>
          )}
          <form action={signOutAction}>
            <button className="text-sidebar-soft hover:text-ink mt-1 inline-flex min-h-11 items-center text-xs underline-offset-4 transition hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main
        id="content"
        className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      >
        <ApproverRequestBanner
          count={pendingAccessRequests}
          workspaceName={tenantName}
        />
        <AccessRequestStrip
          fullCardOnOverview={fullCardOnOverview}
          requests={waitingOn.map((request) => ({
            id: request.id,
            status: request.status,
            workspaceName: request.tenantName ?? "your company’s workspace",
          }))}
        />
        {children}
      </main>
    </div>
  );
}
