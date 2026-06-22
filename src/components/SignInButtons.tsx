import { buttonClass } from "~/components/ui";

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
}: {
  /** Whether sign-in is configured on this deployment. */
  signInEnabled: boolean;
  /** Sign-in entry path for the active provider. */
  signInHref: string;
  demoEnabled: boolean;
  showNote?: boolean;
}) => (
  <div>
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {signInEnabled ? (
        <a
          href={signInHref}
          className={buttonClass("primary", "w-full sm:w-auto")}
        >
          Sign in
        </a>
      ) : (
        <a
          href="#request-scan"
          className={buttonClass("primary", "w-full sm:w-auto")}
        >
          Request scan access
        </a>
      )}
      {demoEnabled && (
        <form action="/api/auth/demo" method="post">
          <button className={buttonClass("secondary", "w-full sm:w-auto")}>
            Open the sample tenant
          </button>
        </form>
      )}
      {!demoEnabled && (
        <a
          href="#sample-tenant"
          className={buttonClass("secondary", "w-full sm:w-auto")}
        >
          Open the sample tenant
        </a>
      )}
    </div>
    {showNote && (
      <p className="text-ink-faint mt-3 text-xs">
        Start free with a 14-day trial. No credit card, read-only access. The
        sample tenant needs no account.
      </p>
    )}
  </div>
);
