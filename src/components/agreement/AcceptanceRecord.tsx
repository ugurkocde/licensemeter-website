import { LANGUAGE_LABEL } from "~/components/agreement/AcceptanceForm";
import { fmtDateTime } from "~/lib/format";
import type { AcceptanceRow } from "~/server/dpa/records";

/** The recorded online acceptance, as procurement wants to read it. */
export const AcceptanceRecord = ({ record }: { record: AcceptanceRow }) => (
  <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
    <div>
      <dt className="text-ink-faint text-xs">Version</dt>
      <dd className="mt-0.5 font-medium">{record.version}</dd>
    </div>
    <div>
      <dt className="text-ink-faint text-xs">Language of record</dt>
      <dd className="mt-0.5 font-medium">{LANGUAGE_LABEL[record.language]}</dd>
    </div>
    <div>
      <dt className="text-ink-faint text-xs">Accepted by</dt>
      <dd className="mt-0.5 font-medium">{record.acceptedByEmail}</dd>
    </div>
    <div>
      <dt className="text-ink-faint text-xs">Accepted on</dt>
      <dd className="mt-0.5 font-medium">{fmtDateTime(record.acceptedAt)}</dd>
    </div>
  </dl>
);
