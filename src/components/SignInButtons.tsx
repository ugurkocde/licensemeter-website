import Link from "next/link";

import { buttonClass, type ButtonVariant } from "~/components/ui";

/**
 * Sign-in CTA hierarchy: the primary action leads to the sign-in page, where
 * the visitor signs in with their Microsoft work or school account and reads
 * what happens next. The sample tenant is the lower-commitment fallback.
 * Buttons go full-width when they stack on small screens.
 */
export const SignInButtons = ({
  signInEnabled,
  signInHref,
  demoEnabled,
  showNote = true,
  primaryLabel = "Sign in with Microsoft",
  centered = false,
  primaryVariant = "primary",
}: {
  /** Whether sign-in is configured on this deployment. */
  signInEnabled: boolean;
  /** The sign-in page, from signInPath(), with an optional returnTo. */
  signInHref: string;
  demoEnabled: boolean;
  showNote?: boolean;
  /** Primary CTA text. The hero echoes the free-scan offer instead. */
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
