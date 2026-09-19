import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "~/components/SupportForm";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "Contact support",
  description:
    "Get help with LicenseMeter. Send a support request to the Ugurlabs team.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
        Here to help
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight">
        Contact support
      </h1>
      <p className="text-ink-soft mt-5 max-w-xl text-lg leading-8">
        Need a hand with LicenseMeter? Tell us what you’re working on and where
        you got stuck.
      </p>
      <p className="text-ink-soft mt-3 mb-10 max-w-xl text-sm leading-relaxed">
        Support by email is part of the Pro and MSP plans. The Free plan comes
        without support: you can still write to us here, and we answer as time
        allows, with no commitment. See{" "}
        <Link
          href="/pricing"
          className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
        >
          pricing
        </Link>{" "}
        for what each plan includes.
      </p>
      {env.SELF_HOSTED === "true" && !env.SUPPORT_TO_EMAIL ? (
        <p className="text-ink-soft border-line rounded-xl border p-5 text-sm">
          Support is managed by the administrator of this self-hosted instance.
          Contact them for help.
        </p>
      ) : (
        <SupportForm
          siteKey={process.env.SUPPORT_TURNSTILE_SITE_KEY}
          supportEmail={env.SUPPORT_TO_EMAIL}
        />
      )}
    </main>
  );
}
