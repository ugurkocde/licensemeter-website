import type { MembershipRole } from "~/server/types";

/** Workspace roles from least to most privileged; drives every role picker. */
export const ROLE_ORDER: MembershipRole[] = ["viewer", "admin", "owner"];

export const ROLE_LABEL: Record<MembershipRole, string> = {
  viewer: "Viewer (finance)",
  admin: "Admin",
  owner: "Owner",
};

/** One-line plain-language summary shown wherever a role is assigned. */
export const ROLE_DESCRIPTION: Record<MembershipRole, string> = {
  viewer: "Read-only: dashboards, findings and exports. Cannot make changes.",
  admin:
    "Run syncs, edit prices, change settings, manage connectors and invite people.",
  owner:
    "Everything an admin can do, plus manage owners and delete the workspace.",
};
