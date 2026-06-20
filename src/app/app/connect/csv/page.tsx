import Link from "next/link";

import { requireSession } from "~/server/access";
import { CsvTrialForm } from "./CsvTrialForm";

export const metadata = {
  title: "CSV trial",
  robots: { index: false, follow: false },
};

/**
 * Zero-consent entry point: any signed-in user (exactly the audience with
 * no workspace yet) turns two admin-center exports into a waste dashboard.
 * Producing the exports needs Reports Reader or Global Reader rights only.
 */
export default async function CsvTrialPage() {
  const session = await requireSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-xl tracking-tight">
        License<span className="text-brand-text">Meter</span>
      </Link>

      <h1 className="mt-10 font-display text-4xl tracking-tight">
        Your waste number from two exports, no consent
      </h1>

      <p className="mt-4 text-ink-soft">
        Upload the exports below and LicenseMeter runs the same waste rules a
        connected workspace gets: offboarding leaks, overlapping licenses and
        (with the usage file) inactive seats. Anyone with{" "}
        <strong className="text-ink">Reports Reader</strong> or{" "}
        <strong className="text-ink">Global Reader</strong> rights can produce
        the exports; no admin consent is involved.
      </p>

      <div className="mt-6 border border-line bg-card p-4 text-xs text-ink-soft">
        <p className="font-medium tracking-wide text-ink-faint uppercase">
          How your data is handled
        </p>
        <p className="mt-2">
          The files are read once and stored like synced workspace data: EU
          residency, never written back anywhere, no mailbox or file contents.
          Disconnecting the workspace in Settings deletes everything.
        </p>
      </div>

      <CsvTrialForm />

      <p className="mt-8 text-xs text-ink-faint">
        Have consent rights?{" "}
        <Link
          href="/app/connect"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          Connect the read-only sync instead
        </Link>{" "}
        for nightly updates, leak alerts and trends without re-uploading.
      </p>

      <p className="mt-3 text-xs text-ink-faint">
        Signed in as {session.user.upn || session.user.email}
      </p>
    </main>
  );
}
