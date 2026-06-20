import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "~/components/BrandMark";

export const metadata: Metadata = {
  title: "Page not found",
};

/* Root-level 404. Static, no client JS. The canvas background comes from the
 * body in globals.css; this only sets type and links in the ledger palette. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <Link
        href="/"
        className="flex items-center gap-2.5 font-display text-lg tracking-tight"
      >
        <BrandMark size={22} />
        <span>
          License<span className="text-brand-text">Meter</span>
        </span>
      </Link>

      <p className="mt-12 text-xs font-medium tracking-[0.2em] text-brand-text uppercase">
        404
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-balance">
        This page does not exist.
      </h1>
      <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-soft">
        The link may be old or mistyped. Here is the way back.
      </p>

      <nav className="mt-8 flex flex-col gap-2 text-sm">
        <Link
          href="/"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          Home
        </Link>
        <Link
          href="/connectors"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          Connector setup guides
        </Link>
        <Link
          href="/app"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          Open the dashboard
        </Link>
      </nav>
    </main>
  );
}
