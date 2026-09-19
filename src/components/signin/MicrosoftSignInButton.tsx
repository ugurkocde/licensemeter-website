/**
 * The Microsoft logo: four squares in Microsoft's own colours, which are part
 * of the mark and therefore not design tokens.
 */
const MicrosoftLogo = () => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 21 21"
    aria-hidden="true"
    focusable="false"
    className="shrink-0"
  >
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

/**
 * "Sign in with Microsoft", following Microsoft's guidance for the sign-in
 * button: a neutral surface, the logo left of the label with 12px between
 * them, the label unchanged, and at least 41px high (48px here, for touch).
 * https://learn.microsoft.com/entra/identity-platform/howto-add-branding-in-apps
 * A plain link, so it works without JavaScript.
 */
export const MicrosoftSignInButton = ({ href }: { href: string }) => (
  <a
    href={href}
    className="border-line-input bg-card text-ink shadow-card hover:border-ink hover:bg-subtle hover:shadow-float inline-flex min-h-12 w-full cursor-pointer touch-manipulation items-center justify-center gap-3 rounded-xl border px-3 py-3 text-[15px] font-semibold whitespace-nowrap transition min-[360px]:px-5"
  >
    <MicrosoftLogo />
    Sign in with Microsoft
  </a>
);
