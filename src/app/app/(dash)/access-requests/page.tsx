import Link from "next/link";
import { AccessRequestCards } from "~/components/workspace/AccessRequestCards";
import { requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { accessRequestNoticesOf } from "~/server/domainJoin";

export const metadata = { title: "Workspace access" };
export default async function AccessRequestsPage() {
  const ctx = await requireAccess("viewer");
  const requests = ctx.user.isDemo
    ? []
    : await accessRequestNoticesOf(db, ctx.user.oid);
  if (requests.length) return <AccessRequestCards requests={requests} />;
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl tracking-tight">Workspace access</h1>
      <p className="text-ink-soft mt-3 text-sm">
        You have no outstanding access notices. Acknowledging a decision does
        not change your access. If you need an invitation, contact your
        company’s LicenseMeter owner or IT team.
      </p>
      <Link
        href="/app"
        className="text-ink hover:text-brand-text mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        Back to Overview
      </Link>
    </section>
  );
}
