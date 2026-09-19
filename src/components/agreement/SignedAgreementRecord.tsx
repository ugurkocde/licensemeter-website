import { LANGUAGE_LABEL } from "~/components/agreement/AcceptanceForm";
import { ButtonAnchor } from "~/components/ui";
import type { DpaAgreementKind } from "~/lib/dpa";
import { fmtDateTime } from "~/lib/format";
import type { AgreementRow } from "~/server/dpa/records";

export const KIND_LABEL: Record<DpaAgreementKind, string> = {
  controller: "Controller agreement",
  subprocessor: "Sub-processor agreement",
};

/** One signed agreement with its download in both languages. */
export const SignedAgreementRecord = ({ record }: { record: AgreementRow }) => (
  <div className="flex flex-col gap-4">
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-ink-faint text-xs">Agreement</dt>
        <dd className="mt-0.5 font-medium">{KIND_LABEL[record.kind]}</dd>
      </div>
      <div>
        <dt className="text-ink-faint text-xs">Version</dt>
        <dd className="mt-0.5 font-medium">{record.version}</dd>
      </div>
      <div>
        <dt className="text-ink-faint text-xs">Company</dt>
        <dd className="mt-0.5 font-medium">{record.companyName}</dd>
        <dd className="text-ink-soft mt-0.5 whitespace-pre-line">
          {record.companyAddress}
        </dd>
      </div>
      <div>
        <dt className="text-ink-faint text-xs">Signed by</dt>
        <dd className="mt-0.5 font-medium">{record.signerName}</dd>
        <dd className="text-ink-soft mt-0.5">
          {record.signerTitle}, {record.signerEmail}
        </dd>
      </div>
      <div>
        <dt className="text-ink-faint text-xs">Signed on</dt>
        <dd className="mt-0.5 font-medium">{fmtDateTime(record.signedAt)}</dd>
      </div>
      <div>
        <dt className="text-ink-faint text-xs">Language of record</dt>
        <dd className="mt-0.5 font-medium">
          {LANGUAGE_LABEL[record.language]}
        </dd>
      </div>
    </dl>
    <div className="flex flex-wrap gap-2">
      <ButtonAnchor
        href={`/api/export/dpa-signed?kind=${record.kind}&lang=en`}
        variant="secondary"
      >
        Download signed PDF (English)
      </ButtonAnchor>
      <ButtonAnchor
        href={`/api/export/dpa-signed?kind=${record.kind}&lang=de`}
        variant="secondary"
      >
        Download signed PDF (German)
      </ButtonAnchor>
    </div>
  </div>
);
