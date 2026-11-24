import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  referrer: "same-origin",
};

export default function ConsentApprovalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-paper min-h-screen px-4 py-8 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="font-display mb-5 text-lg font-semibold tracking-tight">
          LicenseMeter
        </p>
        <div className="border-line bg-card shadow-card rounded-2xl border p-5 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
