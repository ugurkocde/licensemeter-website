"use client";

import { useActionState } from "react";

import { Button } from "~/components/ui";
import { updateFindingWorkflow, type ActionResult } from "~/server/actions";
import type { RemediationStatus } from "~/server/types";

type MemberOption = { id: string; label: string };

export const FindingWorkflowForm = ({
  findingId,
  initial,
  members,
}: {
  findingId: string;
  initial: {
    remediationStatus: RemediationStatus;
    assigneeMembershipId: string | null;
    dueDate: string | null;
    workflowNote: string | null;
    ticketUrl: string | null;
  };
  members: MemberOption[];
}) => {
  const [result, action, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) =>
      updateFindingWorkflow(findingId, formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Remediation status
          <select
            name="remediationStatus"
            defaultValue={initial.remediationStatus}
            autoComplete="off"
            className="border-line-input bg-card min-h-11 border px-3 py-2 font-normal"
          >
            <option value="unassigned">Not planned</option>
            <option value="planned">Planned</option>
            <option value="requested">Remediation requested</option>
            <option value="in_progress">In progress</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Assignee
          <select
            name="assigneeMembershipId"
            defaultValue={initial.assigneeMembershipId ?? ""}
            autoComplete="off"
            className="border-line-input bg-card min-h-11 border px-3 py-2 font-normal"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Due date
          <input
            type="date"
            name="dueDate"
            defaultValue={initial.dueDate ?? ""}
            autoComplete="off"
            className="border-line-input bg-card min-h-11 border px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          External ticket URL
          <input
            type="url"
            name="ticketUrl"
            defaultValue={initial.ticketUrl ?? ""}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://tickets.example.com/…"
            className="border-line-input bg-card min-h-11 border px-3 py-2 font-normal"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes
        <textarea
          name="workflowNote"
          defaultValue={initial.workflowNote ?? ""}
          autoComplete="off"
          rows={4}
          maxLength={2_000}
          placeholder="Owner, approval context or remediation steps…"
          className="border-line-input bg-card border px-3 py-2 font-normal"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving workflow…" : "Save workflow"}
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
              ? "Workflow saved."
              : (result.error ?? "Could not save. Please retry.")
            : "No workflow changes submitted."}
        </p>
      </div>
    </form>
  );
};
