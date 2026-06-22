/**
 * User-facing messages for the ?error= codes the Microsoft connect/scan flows
 * redirect back with. Shared by the Microsoft connector page and the CSV trial.
 */
export const CONNECT_ERROR_TEXT: Record<string, string> = {
  not_configured:
    "The connector app registration is not configured on this deployment (CONNECTOR_CLIENT_ID missing).",
  missing_state: "The consent response was missing its state value. Please retry.",
  invalid_state:
    "That link was already used or has expired. Start again from this page.",
  expired_state: "The consent link expired (15 minutes). Please retry.",
  consent_declined: "Consent was declined in the Microsoft dialog.",
  consent_incomplete: "Microsoft did not confirm the consent. Please retry.",
  not_allowed:
    "You need to be an admin or owner of this workspace to connect Microsoft. Ask a workspace owner to connect it.",
  tenant_taken:
    "That Microsoft tenant is already connected to another LicenseMeter workspace. Ask an admin there for an invite.",
  already_connected:
    "This workspace is already connected to a different Microsoft tenant. Disconnect it first, then retry.",
  scan_declined:
    "The Microsoft permissions dialog was cancelled or declined, so no scan was run. You can retry any time.",
  scan_needs_admin:
    "Your organization requires admin approval for the scan's delegated permissions. An Application Administrator or Cloud Application Administrator can run it, or you can start with the CSV trial below.",
  scan_demo: "The instant scan is not available for the demo workspace.",
  scan_already_synced:
    "Your organization already has a connected workspace with the nightly sync. Open it from the workspace switcher.",
  scan_already_synced_invite:
    "Your organization already has a connected workspace. Ask an admin there for an invite.",
  scan_trial_invite:
    "A trial workspace for your organization already exists. Ask the colleague who created it for an invite.",
  scan_trial_role:
    "This trial workspace already has data, and refreshing it needs an admin role. Ask a workspace admin to refresh it.",
  scan_mismatch:
    "The account that approved the scan does not match your signed-in account. Sign in with the account you want to scan with and retry.",
};

export const connectErrorText = (code: string | null | undefined): string =>
  (code ? CONNECT_ERROR_TEXT[code] : undefined) ??
  "Something went wrong. Please retry.";
