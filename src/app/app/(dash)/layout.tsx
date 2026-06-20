import type { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";

import { BrandMark } from "~/components/BrandMark";
import { MobileNav } from "~/components/workspace/MobileNav";
import { NavLinks } from "~/components/workspace/NavLinks";
import { WorkspaceSwitcher } from "~/components/workspace/WorkspaceSwitcher";
import { requireAccess } from "~/server/access";
import { clearSessionCookie } from "~/server/auth";

/* Auth already gates these routes; noindex closes the gap robots.txt leaves
 * (Disallow stops crawling, not indexing of externally linked URLs). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireAccess("viewer");
  const tenantName = ctx.tenant.name ?? ctx.tenant.tid;

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:border focus:border-ink focus:bg-canvas focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink"
      >
        Skip to content
      </a>
      <MobileNav
        tenantName={tenantName}
        isDemo={ctx.tenant.isDemo}
        userName={ctx.user.name}
        role={ctx.membership.role}
        showPortfolio={ctx.workspaces.length > 1}
        workspaces={ctx.workspaces}
        activeId={ctx.tenant.id}
      />

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-sidebar lg:flex">
        <Link href="/app" className="flex items-center gap-2 px-5 pt-6 pb-7">
          <BrandMark size={20} tone="dark" />
          <span className="font-display text-lg tracking-tight text-canvas">
            License<span className="text-brand-bright">Meter</span>
          </span>
        </Link>

        <div className="border-y border-sidebar-line px-5 py-3">
          {ctx.workspaces.length > 1 ? (
            <WorkspaceSwitcher
              workspaces={ctx.workspaces}
              activeId={ctx.tenant.id}
            />
          ) : (
            <div className="truncate text-sm font-medium text-canvas">
              {tenantName}
            </div>
          )}
          <div className="mt-0.5 text-[11px] tracking-wider text-sidebar-soft uppercase">
            {ctx.tenant.isDemo ? "Demo workspace" : "Connected tenant"}
          </div>
        </div>

        <div className="mt-4 flex-1">
          <NavLinks showPortfolio={ctx.workspaces.length > 1} />
        </div>

        <div className="border-t border-sidebar-line px-5 py-4">
          <div className="truncate text-sm text-canvas">{ctx.user.name}</div>
          <div className="mt-0.5 text-[11px] tracking-wider text-sidebar-soft uppercase">
            {ctx.membership.role}
          </div>
          <form
            action={async () => {
              "use server";
              await clearSessionCookie();
              redirect("/");
            }}
          >
            <button className="mt-1 inline-flex min-h-11 items-center text-xs text-sidebar-soft underline-offset-4 transition hover:text-canvas hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main id="content" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        {children}
      </main>
    </div>
  );
}
