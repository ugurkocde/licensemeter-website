import Link from "next/link";

import { SignInButtons } from "~/components/SignInButtons";
import { buttonClass } from "~/components/ui";
import { isDemoMode, signInEnabled, signInPath } from "~/env";
import type { Lang } from "~/lib/compare/types";

import { compareCopy } from "./copy";

/** Closing call to action, in the page's language. */
export const CompareCta = ({ lang }: { lang: Lang }) => {
  const t = compareCopy(lang);
  const demo = isDemoMode();
  const canSignIn = signInEnabled();
  return (
    <section className="border-line mt-14 border-t pt-10">
      <h2 className="font-display text-3xl tracking-tight text-balance">
        {t.ctaTitle}
      </h2>
      <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">{t.ctaBody}</p>
      <div className="mt-8">
        {lang === "en" ? (
          <SignInButtons
            signInEnabled={canSignIn}
            signInHref={signInPath()}
            demoEnabled={demo}
            showNote={false}
            primaryLabel={t.ctaPrimary}
          />
        ) : (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <a
              href={canSignIn ? signInPath() : "/#get-started"}
              className={buttonClass("primary", "w-full sm:w-auto")}
            >
              {t.ctaPrimary}
            </a>
            {demo ? (
              <form action="/api/auth/demo" method="post">
                <button
                  className={buttonClass("secondary", "w-full sm:w-auto")}
                >
                  {t.ctaSample}
                </button>
              </form>
            ) : (
              <Link
                href="/#sample-tenant"
                className={buttonClass("secondary", "w-full sm:w-auto")}
              >
                {t.ctaSample}
              </Link>
            )}
          </div>
        )}
        {lang === "de" && canSignIn && (
          // German counterpart of the notice SignInButtons shows in English.
          <p className="text-ink-faint mt-3 text-xs">
            Mit der Anmeldung stimmen Sie den{" "}
            <Link href="/terms" className="hover:text-ink underline">
              Nutzungsbedingungen (EN)
            </Link>{" "}
            einschließlich des{" "}
            <Link href="/de/dpa" className="hover:text-ink underline">
              Auftragsverarbeitungsvertrags
            </Link>{" "}
            sowie der{" "}
            <Link href="/privacy" className="hover:text-ink underline">
              Datenschutzerklärung (EN)
            </Link>{" "}
            zu.
          </p>
        )}
        <p className="text-ink-faint mt-3 text-xs">{t.ctaNote}</p>
      </div>
    </section>
  );
};
