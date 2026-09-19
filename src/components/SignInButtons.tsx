import Link from "next/link";

import { buttonClass, type ButtonVariant } from "~/components/ui";

/**
 * Sign-in CTA hierarchy: the primary action is sign-in (WorkOS AuthKit, which
 * offers Microsoft, Google, Apple, passkey, Magic Auth and email+password on
 * its hosted page), with the sample tenant as the lower-commitment fallback.
 * The button is provider-neutral on purpose: it no longer claims "Sign in with
 * Microsoft" because WorkOS presents multiple methods. Buttons go full-width
 * when they stack on small screens.
 */
export const SignInButtons = ({
  signInEnabled,
  signInHref,
  demoEnabled,
  showNote = true,
  primaryLabel = "Sign in",
  centered = false,
  primaryVariant = "primary",
}: {
  /** Whether sign-in is configured on this deployment. */
  signInEnabled: boolean;
  /** Sign-in entry path for the active provider. */
  signInHref: string;
  demoEnabled: boolean;
  showNote?: boolean;
  /** Primary CTA text. Defaults to "Sign in"; the hero echoes the free-scan offer. */
  primaryLabel?: string;
  centered?: boolean;
  primaryVariant?: ButtonVariant;
}) => (
  <div>
    <div
      className={`flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center ${centered ? "sm:justify-center" : ""}`}
    >
      {signInEnabled ? (
        <a
          href={signInHref}
          className={buttonClass(primaryVariant, "w-full sm:w-auto")}
        >
          {primaryLabel}
        </a>
      ) : (
        <Link
          href="/#get-started"
          className={buttonClass(primaryVariant, "w-full sm:w-auto")}
        >
          Request scan access
        </Link>
      )}
      {demoEnabled && (
        <form action="/api/auth/demo" method="post">
          <button className={buttonClass("secondary", "w-full sm:w-auto")}>
            Open the sample tenant
          </button>
        </form>
      )}
      {!demoEnabled && (
        <Link
          href="/#sample-tenant"
          className={buttonClass("secondary", "w-full sm:w-auto")}
        >
          Open the sample tenant
        </Link>
      )}
    </div>
    {signInEnabled && (
      <p
        className={`text-ink-faint mt-3 text-xs ${centered ? "text-center" : ""}`}
      >
        By signing in you agree to the{" "}
        <Link href="/terms" className="hover:text-ink underline">
          Terms
        </Link>
        , including the{" "}
        <Link href="/dpa" className="hover:text-ink underline">
          data processing agreement
        </Link>
        , and the{" "}
        <Link href="/privacy" className="hover:text-ink underline">
          privacy policy
        </Link>
        .
      </p>
    )}
    {showNote && (
      <p className="text-ink-faint mt-3 text-xs">
        Free to use, with no time limit. No credit card, read-only access. The
        sample tenant needs no account.
      </p>
    )}
  </div>
);
