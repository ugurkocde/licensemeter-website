import { buttonClass } from "~/components/ui";

/**
 * Official Microsoft logo: unaltered 2x2 squares in the exact brand colors,
 * as required by Microsoft's "Sign in with Microsoft" branding guidelines.
 * https://learn.microsoft.com/entra/identity-platform/howto-add-branding-in-apps
 */
const MicrosoftMark = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
    <rect x="0" y="0" width="10" height="10" fill="#F25022" />
    <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
    <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
  </svg>
);

/**
 * Microsoft-compliant "Sign in with Microsoft" button (dark scheme). The label
 * is fixed to the only text Microsoft permits next to its logo ("Sign in with
 * Microsoft", or the shorter "Sign in"); the "start free, no card" value
 * framing lives in the surrounding copy, never on the button itself. Segoe UI
 * matches the official asset and falls back cleanly off Windows.
 */
const microsoftButtonClass =
  "inline-flex min-h-11 w-full cursor-pointer touch-manipulation items-center justify-center gap-3 rounded-xl bg-[#2f2f2f] px-5 py-3 text-[15px] font-semibold text-white shadow-card transition hover:bg-[#1f1f1f] sm:w-auto";

const MS_FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Sign-in CTA hierarchy: the compliant "Sign in with Microsoft" button is the
 * primary action, with the sample tenant as the lower-commitment fallback.
 * Buttons go full-width when they stack on small screens.
 */
export const SignInButtons = ({
  entraConfigured,
  demoEnabled,
  showNote = true,
}: {
  entraConfigured: boolean;
  demoEnabled: boolean;
  showNote?: boolean;
}) => (
  <div>
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {entraConfigured ? (
        <a
          href="/api/auth/signin"
          className={microsoftButtonClass}
          style={{ fontFamily: MS_FONT }}
        >
          <MicrosoftMark />
          Sign in with Microsoft
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
