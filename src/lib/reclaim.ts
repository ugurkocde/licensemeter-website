/**
 * The one application permission the separate reclaim app holds. Microsoft
 * documents it as the least privileged permission for POST
 * /users/{id}/assignLicense (application and delegated), so neither
 * User.ReadWrite.All nor Directory.ReadWrite.All is needed. Reads before a
 * removal go through the read-only Microsoft 365 connector.
 */
export const RECLAIM_ROLE = "LicenseAssignment.ReadWrite.All";

export const RECLAIM_DOCS =
  "https://learn.microsoft.com/en-us/graph/api/user-assignlicense?view=graph-rest-1.0";

export type ReclaimApprovalMode = "two_person" | "single_admin";

export const APPROVAL_MODES: Record<
  ReclaimApprovalMode,
  { label: string; description: string }
> = {
  two_person: {
    label: "Two people",
    description:
      "One admin requests a reclaim, a different admin or owner approves it before anything changes in Microsoft 365.",
  },
  single_admin: {
    label: "One admin",
    description:
      "The admin who requests a reclaim also confirms it, by typing the number of licenses to remove.",
  },
};

export type RoleCheck =
  | { ok: true }
  | { ok: false; code: "missing" }
  | { ok: false; code: "extra"; extra: string[] };

/**
 * The reclaim app must hold the license write permission and nothing else, so
 * a token that could also change users, groups or the directory is refused
 * rather than used with more power than LicenseMeter asks for.
 */
export function reclaimRoles(roles: readonly string[] | undefined): RoleCheck {
  const list = roles ?? [];
  if (!list.includes(RECLAIM_ROLE)) return { ok: false, code: "missing" };
  const extra = [...new Set(list.filter((role) => role !== RECLAIM_ROLE))];
  return extra.length > 0 ? { ok: false, code: "extra", extra } : { ok: true };
}
