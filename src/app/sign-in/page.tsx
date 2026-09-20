import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "~/components/BrandMark";
import { MicrosoftSignInButton } from "~/components/signin/MicrosoftSignInButton";
import { Pill } from "~/components/ui";
import { isDemoMode, marketplaceEnabled, signInEnabled } from "~/env";
import {
  DOCS_URL,
  passThroughReturnTo,
  signInErrorText,
  signInStartHref,
} from "~/lib/signIn";
import {
  connectorPermissions,
  SIGN_IN_STEPS,
  type SignInStepId,
} from "~/lib/signInSteps";
import { SUPPORT_MAILTO } from "~/lib/support";
import { auth } from "~/server/auth";
import { validateReturnTo } from "~/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to LicenseMeter with your Microsoft work or school account, and see what happens next.",
  robots: { index: false, follow: false },
};

// Reads the session and the search params on every request.
export const dynamic = "force-dynamic";

const TEXT_LINK =
  "text-ink hover:text-brand-text font-medium underline underline-offset-4";
/* Quiet actions under the button: text weight, but a full 44px touch target. */
const QUIET_ACTION =
  "text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium underline-offset-4 transition hover:underline";
const KICKER =
  "text-ink-faint font-mono text-[11px] tracking-[0.14em] uppercase";

const FOOTER_LINKS: [string, string][] = [
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/impressum", "Impressum"],
  ["/security", "Security"],
  [SUPPORT_MAILTO, "Support"],
];

/* An expired link is information, not a failure: only errors are announced
   as alerts and drawn in the danger tone. */
const Notice = ({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
}) => (
  <div
    role={tone === "error" ? "alert" : "status"}
    className={`mt-6 rounded-xl border p-4 text-sm ${
      tone === "error"
        ? "border-danger-soft bg-danger-soft/50 text-danger-text"
        : "border-line bg-subtle text-ink-soft"
    }`}
  >
    {children}
  </div>
);

/** Shown instead of a dead button on a deployment without a sign-in app. */
const SetupHint = () => (
  <div className="border-line bg-subtle mt-7 rounded-xl border p-4 text-sm">
    <h2 className="text-ink font-semibold">Sign-in is not configured yet</h2>
    <p className="text-ink-soft mt-2">
      This deployment has no Microsoft Entra app registration for sign-in.
      Create one for work and school accounts, then set these variables and
      restart:
    </p>
    <ul className="text-ink mt-3 grid gap-1 font-mono text-xs [overflow-wrap:anywhere]">
      <li>AUTH_MICROSOFT_ENTRA_ID_ID</li>
      <li>AUTH_MICROSOFT_ENTRA_ID_SECRET</li>
      <li>AUTH_SECRET</li>
    </ul>
    <p className="text-ink-soft mt-3">
      Register the redirect URI{" "}
      <code className="text-ink font-mono text-xs [overflow-wrap:anywhere]">
        /api/auth/callback/microsoft-entra-id
      </code>{" "}
      on your own domain. The{" "}
      <a href={`${DOCS_URL}self-hosting`} className={TEXT_LINK}>
        self-hosting guide
      </a>{" "}
      walks through it.
    </p>
  </div>
);

/** The permission list and the way around it, under step 3. */
const ConnectDetails = ({ canSignIn }: { canSignIn: boolean }) => {
  const permissions = connectorPermissions();
  return (
    <>
      <h4 className={`${KICKER} mt-5`}>
        The {permissions.length} read-only permissions, and why
      </h4>
      <ul className="border-line bg-card mt-2.5 rounded-xl border">
        {permissions.map((p) => (
          <li
            key={p.scope}
            className="border-line border-b px-4 py-3 last:border-b-0"
          >
            <code className="text-ink font-mono text-xs [overflow-wrap:anywhere]">
              {p.scope}
            </code>
            <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">
              {p.why}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-ink-soft mt-4 text-sm leading-relaxed">
        The details are in the{" "}
        <Link href="/connectors/microsoft" className={TEXT_LINK}>
          Microsoft 365 connector guide
        </Link>{" "}
        and the{" "}
        <Link href="/security" className={TEXT_LINK}>
          security overview
        </Link>
        , written for the person who has to approve it.
      </p>
      <p className="text-ink-soft mt-3 text-sm leading-relaxed">
        No admin rights yourself? You can{" "}
        {canSignIn ? (
          <a href={signInStartHref("/app/connect/csv")} className={TEXT_LINK}>
            sign in and upload a license export
          </a>
        ) : (
          "sign in and upload a license export"
        )}{" "}
        instead, and connect later.
      </p>
    </>
  );
};

const STEP_DETAILS: Partial<
  Record<SignInStepId, (props: { canSignIn: boolean }) => React.ReactNode>
> = {
  connect: ConnectDetails,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Already signed in: nothing to explain, go where the link pointed.
  const session = await auth();
  if (session?.user) {
    const target =
      typeof sp.returnTo === "string" ? validateReturnTo(sp.returnTo) : null;
    redirect(target ?? "/app");
  }

  const href = signInStartHref(passThroughReturnTo(sp.returnTo));
  const errorText = signInErrorText(sp.error);
  const canSignIn = signInEnabled();
  const demo = isDemoMode();

  return (
    <div className="bg-canvas-deep min-h-screen px-2 py-3 sm:p-5 lg:p-7">
      <a
        href="#sign-in"
        className="focus:border-ink focus:bg-canvas focus:text-ink sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to sign in
      </a>
      <div className="mx-auto max-w-[1600px] rounded-[24px] border border-white bg-white sm:rounded-[32px]">
        <main
          lang="en"
          className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
        >
          {/* First in the DOM, so the button leads on a phone. From lg the
              panel stays in view while the steps scroll, as long as the
              viewport is tall enough to show all of it. */}
          <div className="bg-canvas m-1.5 flex flex-col rounded-[20px] bg-[radial-gradient(ellipse_at_top_left,var(--color-brand-soft),transparent_55%)] px-2.5 pt-5 pb-8 min-[360px]:px-4 sm:m-2 sm:rounded-[26px] sm:px-8 sm:pt-7 sm:pb-12 lg:min-h-[calc(100vh-4.5rem)] lg:self-start lg:px-10 [@media(min-height:760px)]:lg:sticky [@media(min-height:760px)]:lg:top-9">
            <Link
              href="/"
              aria-label="LicenseMeter home"
              className="font-display ml-1.5 flex min-h-11 items-center gap-2.5 self-start text-lg tracking-tight sm:text-xl"
            >
              <BrandMark size={22} />
              <span>
                License<span className="text-brand-text">Meter</span>
              </span>
            </Link>

            <div className="flex flex-1 items-center justify-center pt-6 lg:py-10">
              <section
                id="sign-in"
                aria-labelledby="sign-in-title"
                className="border-line bg-card shadow-float rise w-full max-w-md scroll-mt-6 rounded-[20px] border p-5 min-[360px]:p-6 sm:p-8"
              >
                <span className="border-line bg-canvas inline-grid size-12 place-items-center rounded-2xl border">
                  <BrandMark size={26} />
                </span>
                <h1
                  id="sign-in-title"
                  className="font-display mt-5 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[2rem]"
                >
                  Sign in to LicenseMeter
                </h1>
                <p className="text-ink-soft mt-3 text-[15px] leading-relaxed">
                  Use your Microsoft work or school account. There is no signup
                  form and no new password.
                </p>

                {errorText && <Notice tone="error">{errorText}</Notice>}

                {canSignIn ? (
                  <>
                    <div className="mt-7">
                      <MicrosoftSignInButton href={href} />
                    </div>
                    <p className="text-ink-faint mt-4 text-xs leading-relaxed">
                      By signing in you agree to the{" "}
                      <Link href="/terms" className="hover:text-ink underline">
                        Terms
                      </Link>
                      , including the{" "}
                      <Link href="/dpa" className="hover:text-ink underline">
                        data processing agreement
                      </Link>
                      , and the{" "}
                      <Link
                        href="/privacy"
                        className="hover:text-ink underline"
                      >
                        privacy policy
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <SetupHint />
                )}

                <div className="border-line mt-6 flex flex-wrap items-center gap-x-6 border-t pt-3">
                  {demo && (
                    <form action="/api/auth/demo" method="post">
                      <button type="submit" className={QUIET_ACTION}>
                        Open the sample tenant
                      </button>
                    </form>
                  )}
                  <a href={DOCS_URL} className={QUIET_ACTION}>
                    Read the docs
                  </a>
                </div>
              </section>
            </div>
          </div>

          <section
            aria-labelledby="steps-title"
            className="px-4 pt-10 pb-12 sm:px-8 sm:pt-12 lg:px-12 lg:pt-20 lg:pb-16 xl:px-16"
          >
            <div className="mx-auto max-w-xl lg:mx-0">
              <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
                What happens next
              </p>
              <h2
                id="steps-title"
                className="font-display mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-[2rem] sm:leading-tight"
              >
                Four steps from this button to your first findings.
              </h2>

              <ol className="mt-9 grid gap-9">
                {SIGN_IN_STEPS.map((step, i) => {
                  const Details = STEP_DETAILS[step.id];
                  const [lead, ...rest] = step.sentences;
                  return (
                    <li
                      key={step.id}
                      className="before:bg-line relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 before:absolute before:top-11 before:-bottom-7 before:left-[1.0625rem] before:w-px before:content-[''] last:before:hidden sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-5 sm:before:left-[1.1875rem]"
                    >
                      <span
                        aria-hidden="true"
                        className="border-brand/25 bg-brand-soft text-brand-text tnum grid size-9 place-items-center rounded-full border font-mono text-[13px] font-medium sm:size-10"
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 sm:min-h-10">
                          <span className={KICKER}>{step.time}</span>
                          {step.needs && <Pill tone="slate">{step.needs}</Pill>}
                        </p>
                        <h3 className="mt-0.5 text-[17px] font-semibold tracking-tight">
                          <span className="sr-only">Step {i + 1}: </span>
                          {step.title}
                        </h3>
                        <p className="text-ink-soft mt-2 text-[15px] leading-relaxed">
                          <span className="text-ink">{lead}</span>{" "}
                          {rest.join(" ")}
                        </p>
                        {Details && <Details canSignIn={canSignIn} />}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="border-line text-ink-soft mt-10 grid gap-3 border-t pt-6 text-sm leading-relaxed">
                <p>
                  <span className="text-ink font-medium">
                    Signed in another way before?
                  </span>{" "}
                  Sign-in is now Microsoft only. If your old account used a
                  different email address than your work account,{" "}
                  <a href={SUPPORT_MAILTO} className={TEXT_LINK}>
                    write to us
                  </a>{" "}
                  from that address and we move your workspaces over.
                </p>
                {marketplaceEnabled() && (
                  <p>
                    <span className="text-ink font-medium">
                      Bought LicenseMeter in Microsoft Marketplace?
                    </span>{" "}
                    Sign in with the account you bought it with and your plan is
                    linked.
                  </p>
                )}
                <p>
                  <span className="text-ink font-medium">
                    Running LicenseMeter yourself?
                  </span>{" "}
                  Sign-in uses your own Entra app registration, and every
                  feature is included. The{" "}
                  <a href={`${DOCS_URL}self-hosting`} className={TEXT_LINK}>
                    self-hosting guide
                  </a>{" "}
                  covers the setup.
                </p>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-line text-ink-faint flex flex-col gap-x-6 gap-y-1 border-t px-4 py-4 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p>© {new Date().getFullYear()} LicenseMeter</p>
          <nav aria-label="Legal and help">
            <ul className="-mx-2 flex flex-wrap">
              {FOOTER_LINKS.map(([to, label]) => (
                <li key={to}>
                  <a
                    href={to}
                    className="hover:text-ink inline-flex min-h-11 items-center px-2 underline-offset-4 hover:underline"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </footer>
      </div>
    </div>
  );
}
