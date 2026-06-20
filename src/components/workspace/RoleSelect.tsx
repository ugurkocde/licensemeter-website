"use client";

import { useState, useTransition } from "react";

import { changeMemberRole } from "~/server/actions";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "~/lib/roles";
import type { MembershipRole } from "~/server/types";

/**
 * Inline role picker for a member row. Optimistically reflects the choice and
 * reverts with an error if the guarded changeMemberRole action refuses it.
 * "owner" is only offered when the actor may grant it (or the member already
 * holds it, so the current value always renders).
 */
export const RoleSelect = ({
  membershipId,
  role,
  allowOwner,
}: {
  membershipId: string;
  role: MembershipRole;
  allowOwner: boolean;
}) => {
  const [current, setCurrent] = useState<MembershipRole>(role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options: MembershipRole[] = ["viewer", "admin"];
  if (allowOwner || role === "owner") options.push("owner");

  const onChange = (next: MembershipRole) => {
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const res = await changeMemberRole(membershipId, next);
      if (!res.ok) {
        setCurrent(prev);
        setError(res.error ?? "Could not change role");
      }
    });
  };

  return (
    <div className="flex flex-col items-end">
      <select
        aria-label="Member role"
        title={ROLE_DESCRIPTION[current]}
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as MembershipRole)}
        className="border border-line bg-card px-2 py-1 text-xs focus:border-ink disabled:opacity-50"
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <span
        role="status"
        aria-live="polite"
        className={
          error ? "mt-1 max-w-56 text-right text-xs text-danger-text" : "sr-only"
        }
      >
        {error}
      </span>
    </div>
  );
};
