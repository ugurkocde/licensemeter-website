import Link from "next/link";

import { getAccessContext, requireSession } from "~/server/access";
import { CsvImportForm } from "./CsvImportForm";

export const metadata = {
  title: "CSV import",
  robots: { index: false, follow: false },
};
// The submit action parses, bulk-writes and runs the rules engine before
// redirecting; give it the same budget as the other sync paths.
export const maxDuration = 300;

/**
 * Zero-consent entry point: any signed-in user turns two admin-center exports
 * into a waste dashboard. Producing the exports needs Reports Reader or Global
 * Reader rights only. Standalone (outside the dash layout) so it is reachable
 * even by an entra-mode user who has no workspace yet.
 */
export default async function CsvImportPage() {
  const session = await requireSession();
  // Users without a workspace can't reach /app/settings/* (it bounces to
  // /app/connect); point them there instead so the link doesn't dead-end.
  const ctx = await getAccessContext();
  const connectHref = ctx ? "/app/connectors/microsoft" : "/app/connect";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-xl tracking-tight">
        License<span className="text-brand-text">Meter</span>
      </Link>

      <h1 className="font-display mt-10 text-4xl tracking-tight">
        Your waste number from two exports, no consent
      </h1>

      <p className="text-ink-soft mt-4">
        Upload the exports below and LicenseMeter runs the same waste rules a
        connected workspace gets: offboarding leaks, overlapping licenses and
        (with the usage file) inactive seats. Anyone with{" "}
        <strong className="text-ink">Reports Reader</strong> or{" "}
        <strong className="text-ink">Global Reader</strong> rights can produce
        the exports; no admin consent is involved.
      </p>

      <div className="border-line bg-card text-ink-soft mt-6 border p-4 text-xs">
        <p className="text-ink-faint font-medium tracking-wide uppercase">
          How your data is handled
        </p>
        <p className="mt-2">
          The files are read once and stored like synced workspace data: EU
          residency, never written back anywhere, no mailbox or file contents.
          Deleting the workspace in Settings deletes everything.
        </p>
      </div>

      <CsvImportForm />

      <p className="text-ink-faint mt-8 text-xs">
        Have consent rights?{" "}
        <Link
          href={connectHref}
          className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
        >
          Connect the read-only sync instead
        </Link>{" "}
        for nightly updates, leak alerts and trends without re-uploading.
      </p>

      <p className="text-ink-faint mt-3 text-xs">
        Signed in as {session.user.upn || session.user.email}
      </p>
    </main>
  );
}
