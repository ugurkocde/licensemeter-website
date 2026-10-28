import type { Metadata } from "next";

import {
  AccessRequestStrip,
  ApproverRequestBanner,
} from "~/components/workspace/AccessRequestStrip";
import { AppSidebar } from "~/components/workspace/AppSidebar";
import { workspaceHasConnectorOrData } from "~/server/workspaceState";
import { MobileNav } from "~/components/workspace/MobileNav";
import { workspaceLabel } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  accessRequestNoticesOf,
  pendingJoinRequestCount,
} from "~/server/domainJoin";

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
        userDetail={ctx.user.upn}
        role={ctx.membership.role}
        accountEnabled={accountEnabled}
        showPortfolio={ctx.workspaces.length > 1}
        workspaces={ctx.workspaces}
        activeId={ctx.tenant.id}
        entitlement={ctx.entitlement}
        pendingAccessRequests={pendingAccessRequests}
      />

      <AppSidebar
        isDemo={ctx.tenant.isDemo}
        userName={ctx.user.name}
        userDetail={ctx.user.upn}
        accountEnabled={accountEnabled}
        workspaces={ctx.workspaces}
        activeId={ctx.tenant.id}
        entitlement={ctx.entitlement}
        pendingAccessRequests={pendingAccessRequests}
      />

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
