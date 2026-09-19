import { signDpaAction } from "~/app/app/(dash)/agreement/actions";
import { LANGUAGE_LABEL } from "~/components/agreement/AcceptanceForm";
import { KIND_LABEL } from "~/components/agreement/SignedAgreementRecord";
import { Button } from "~/components/ui";
import { DPA_VERSION, type DpaAgreementKind, type DpaLang } from "~/lib/dpa";

const INPUT_CLASS =
  "border-line bg-card focus:border-ink min-h-11 w-full rounded-xl border px-3 py-2 text-sm";
const RADIO_CLASS = "accent-brand-strong size-4 shrink-0";
const RADIO_LABEL_CLASS =
  "text-ink hover:bg-subtle has-focus-visible:border-ink border-line bg-card inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm";

const KIND_HELP: Record<DpaAgreementKind, string> = {
  controller:
    "Your company decides why and how the data is processed; LicenseMeter is its processor.",
  subprocessor:
    "Your company processes the data for its own clients; LicenseMeter is its sub-processor.",
};

/**
 * Signs the current version with the customer's company as the named party.
 * The kinds are those still open to this workspace: one hidden value on Pro,
 * a choice between the controller and the sub-processor agreement on MSP.
 * Input limits match agreementInputSchema on the server, which decides.
 */
export const SignedAgreementForm = ({
  kinds,
  defaultLang,
}: {
  kinds: DpaAgreementKind[];
  defaultLang: DpaLang;
}) => (
  <form action={signDpaAction} className="flex flex-col gap-5">
    {kinds.length > 1 ? (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink-faint mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Agreement
        </legend>
        <p className="text-ink-soft mb-1 text-sm">
          Choose the controller agreement for your own company&apos;s data and
          the sub-processor agreement for the client tenants you manage.
        </p>
        <div className="flex flex-col gap-2">
          {kinds.map((kind, i) => (
            <label
              key={kind}
              htmlFor={`sign-kind-${kind}`}
              className={`${RADIO_LABEL_CLASS} items-start`}
            >
              <input
                id={`sign-kind-${kind}`}
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={i === 0}
                className={`${RADIO_CLASS} mt-0.5`}
              />
              <span>
                <span className="block font-medium">{KIND_LABEL[kind]}</span>
                <span className="text-ink-soft block text-xs">
                  {KIND_HELP[kind]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    ) : (
      <input type="hidden" name="kind" value={kinds[0] ?? "controller"} />
    )}

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="sign-company" className="text-ink-faint text-xs">
          Company (legal entity)
        </label>
        <input
          id="sign-company"
          name="companyName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          className={`${INPUT_CLASS} mt-1`}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="sign-address" className="text-ink-faint text-xs">
          Registered address
        </label>
        <textarea
          id="sign-address"
          name="companyAddress"
          required
          minLength={5}
          maxLength={300}
          rows={2}
          autoComplete="street-address"
          className={`${INPUT_CLASS} mt-1`}
        />
      </div>
      <div>
        <label htmlFor="sign-name" className="text-ink-faint text-xs">
          Signatory name
        </label>
        <input
          id="sign-name"
          name="signerName"
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          className={`${INPUT_CLASS} mt-1`}
        />
      </div>
      <div>
        <label htmlFor="sign-title" className="text-ink-faint text-xs">
          Signatory title
        </label>
        <input
          id="sign-title"
          name="signerTitle"
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization-title"
          className={`${INPUT_CLASS} mt-1`}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="sign-email" className="text-ink-faint text-xs">
          Signatory email
        </label>
        <input
          id="sign-email"
          name="signerEmail"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={`${INPUT_CLASS} mt-1`}
        />
      </div>
    </div>

    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink-faint mb-2 text-xs font-medium tracking-[0.14em] uppercase">
        Language of record
      </legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LANGUAGE_LABEL) as DpaLang[]).map((lang) => (
          <label
            key={lang}
            htmlFor={`sign-lang-${lang}`}
            className={RADIO_LABEL_CLASS}
          >
            <input
              id={`sign-lang-${lang}`}
              type="radio"
              name="language"
              value={lang}
              defaultChecked={lang === defaultLang}
              className={RADIO_CLASS}
            />
            {LANGUAGE_LABEL[lang]}
          </label>
        ))}
      </div>
    </fieldset>

    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="primary">
        Sign version {DPA_VERSION}
      </Button>
      <span className="text-ink-faint text-xs">
        The typed name counts as the signature. The PDF is available right
        after.
      </span>
    </div>
  </form>
);
