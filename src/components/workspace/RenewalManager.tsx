"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, buttonClass } from "~/components/ui";
import { fmtDate, fmtMoney } from "~/lib/format";
import { deleteVendorRenewal, saveVendorRenewal } from "~/server/actions";
import type { ActionResult } from "~/server/actions";

export type RenewalView = {
  id: string;
  vendor: string;
  contractName: string;
  renewalDate: string;
  noticeDays: number;
  annualValueCents: number;
  ownerMembershipId: string | null;
  notes: string | null;
};

/* Anchor the calendar day at UTC noon so the shared formatter shows the same
 * date on the server and in any client timezone. */
const renewalDateLabel = (value: string) =>
  fmtDate(new Date(`${value}T12:00:00Z`));

const daysUntil = (value: string, nowMs: number) =>
  Math.ceil((new Date(`${value}T00:00:00Z`).getTime() - nowMs) / 86_400_000);

type MemberOption = { id: string; label: string };

const RenewalForm = ({
  initial,
  members,
  currency,
  onSaved,
}: {
  initial?: RenewalView;
  members: MemberOption[];
  currency: string;
  onSaved?: () => void;
}) => {
  const [result, action, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => {
      const response = await saveVendorRenewal(formData);
      if (response.ok) onSaved?.();
      return response;
    },
    null,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="flex flex-col gap-1 text-xs font-medium">
        Vendor
        <input
          name="vendor"
          required
          maxLength={100}
          defaultValue={initial?.vendor ?? ""}
          autoComplete="organization"
          placeholder="Microsoft 365…"
          className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Contract name
        <input
          name="contractName"
          required
          maxLength={160}
          defaultValue={initial?.contractName ?? ""}
          autoComplete="off"
          placeholder="Enterprise agreement…"
          className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Renewal date
        <input
          type="date"
          name="renewalDate"
          required
          defaultValue={initial?.renewalDate ?? ""}
          autoComplete="off"
          className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Cancellation notice (days)
        <input
          type="number"
          name="noticeDays"
          min={0}
          max={365}
          required
          defaultValue={initial?.noticeDays ?? 30}
          autoComplete="off"
          className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Annual contract value ({currency})
        <input
          name="annualValue"
          inputMode="decimal"
          defaultValue={
            initial ? (initial.annualValueCents / 100).toFixed(2) : "0.00"
          }
          autoComplete="off"
          className="tnum border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Contract owner
        <select
          name="ownerMembershipId"
          defaultValue={initial?.ownerMembershipId ?? ""}
          autoComplete="off"
          className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">
        Notes
        <textarea
          name="notes"
          rows={3}
          maxLength={2_000}
          defaultValue={initial?.notes ?? ""}
          autoComplete="off"
          placeholder="Notice terms, negotiation context or procurement owner…"
          className="border-line-input bg-card border px-3 py-2 text-sm font-normal"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button variant={initial ? "secondary" : "primary"} disabled={pending}>
          {pending
            ? "Saving renewal…"
            : initial
              ? "Save renewal"
              : "Add renewal"}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={
            result
              ? `text-xs ${result.ok ? "text-moss" : "text-danger-text"}`
              : "sr-only"
          }
        >
          {result
            ? result.ok
              ? "Renewal saved."
              : (result.error ?? "Could not save. Please retry.")
            : "No renewal submitted."}
        </p>
      </div>
    </form>
  );
};

const DeleteRenewalButton = ({ id }: { id: string }) => {
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          startTransition(async () => {
            const result = await deleteVendorRenewal(id);
            if (!result.ok) {
              setMessage(result.error ?? "Could not delete. Please retry.");
              setArmed(false);
              return;
            }
            router.refresh();
          });
        }}
        className={buttonClass(
          "micro",
          armed ? "text-danger-text border-danger" : "",
        )}
      >
        {pending ? "Deleting…" : armed ? "Confirm delete" : "Delete"}
      </button>
      <span
        className={message ? "text-danger-text text-xs" : "sr-only"}
        role="status"
      >
        {message || "Deletion not requested."}
      </span>
    </div>
  );
};

export const RenewalManager = ({
  renewals,
  members,
  currency,
  canEdit,
  nowMs,
}: {
  renewals: RenewalView[];
  members: MemberOption[];
  currency: string;
  canEdit: boolean;
  /** Server clock at render time, so day counts hydrate without mismatch. */
  nowMs: number;
}) => {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <section className="border-line bg-card border p-5">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.16em] uppercase">
            Add contract renewal
          </h2>
          <div className="mt-4">
            <RenewalForm
              members={members}
              currency={currency}
              onSaved={() => router.refresh()}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.16em] uppercase">
          Renewal calendar
        </h2>
        {renewals.length === 0 ? (
          <div className="border-line bg-card text-ink-soft mt-3 border border-dashed px-5 py-10 text-center text-sm">
            <p className="font-medium">No contract renewals recorded yet.</p>
            <p className="text-ink-faint mt-1 text-xs">
              {canEdit
                ? "Add the first contract using the form above so its notice deadline appears on Overview."
                : "A workspace admin can add contracts and notice deadlines here."}
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {renewals.map((renewal) => {
              const remaining = daysUntil(renewal.renewalDate, nowMs);
              const noticeDeadline = remaining - renewal.noticeDays;
              return (
                <li key={renewal.id} className="border-line bg-card border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-ink-faint text-xs font-medium uppercase">
                        {renewal.vendor}
                      </div>
                      <h3 className="mt-1 font-medium">
                        {renewal.contractName}
                      </h3>
                    </div>
                    <time
                      className="tnum font-display text-xl"
                      dateTime={renewal.renewalDate}
                    >
                      {renewalDateLabel(renewal.renewalDate)}
                    </time>
                  </div>
                  <div className="text-ink-soft mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>{renewal.noticeDays}-day notice period</span>
                    <span
                      className={
                        noticeDeadline <= 30
                          ? "text-waste-text font-medium"
                          : ""
                      }
                    >
                      {noticeDeadline < 0
                        ? `Notice deadline passed ${Math.abs(noticeDeadline)} days ago`
                        : `Decision due in ${noticeDeadline} days`}
                    </span>
                    <span>
                      {fmtMoney(renewal.annualValueCents, currency)} annual
                      value
                    </span>
                  </div>
                  {canEdit && (
                    <details className="border-line mt-4 border-t pt-3">
                      <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer items-center text-sm font-medium">
                        Edit contract
                      </summary>
                      <div className="mt-3">
                        <RenewalForm
                          initial={renewal}
                          members={members}
                          currency={currency}
                          onSaved={() => router.refresh()}
                        />
                        <div className="mt-3 flex justify-end">
                          <DeleteRenewalButton id={renewal.id} />
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
