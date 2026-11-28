# One-click reclaim rollout

Status: in review as a stack of four PRs (connection, requests and approval, license removal, 14-day undo). No tenant writes were made while building it.

## Permission decision

The reclaim app holds one Microsoft Graph application permission: `LicenseAssignment.ReadWrite.All`.

Checked on 2026-11-28 against Microsoft's v1.0 reference for `POST /users/{id}/assignLicense` (https://learn.microsoft.com/en-us/graph/api/user-assignlicense?view=graph-rest-1.0). Its permissions table lists:

| Permission type            | Least privileged                | Higher privileged                                                                                                |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Delegated (work or school) | LicenseAssignment.ReadWrite.All | AgentIdUser.ReadWrite.All, AgentIdUser.ReadWrite.IdentityParentedBy, Directory.ReadWrite.All, User.ReadWrite.All |
| Application                | LicenseAssignment.ReadWrite.All | AgentIdUser.ReadWrite.All, AgentIdUser.ReadWrite.IdentityParentedBy, Directory.ReadWrite.All, User.ReadWrite.All |

So `LicenseAssignment.ReadWrite.All` is enough for both removing a license and re-adding it (with `disabledPlans`) on undo. `User.ReadWrite.All` is not needed and is not requested. The reads before a removal (the user's current `assignedLicenses` and `licenseAssignmentStates`, and `subscribedSkus` for free seats before an undo) go through the existing read-only Microsoft 365 connector, which already holds `User.Read.All` and `LicenseAssignment.Read.All`. The reclaim app therefore never needs a read permission of its own.

LicenseMeter refuses a reclaim token that holds any other Microsoft Graph application permission, or any Entra directory role besides the default member role (the `wids` claim), for both the managed and the bring-your-own app. It cannot see application permissions on other APIs (Exchange Online, SharePoint, Azure Resource Manager), which a Graph token does not list; the setup page tells customers to grant only the one permission. The lab test (step 3) also confirms that an app-only token lists assigned directory roles in `wids`.

## Design

- **The Microsoft 365 connector stays read-only.** Reclaim is a separate, opt-in app registration, like Software Metering. Its app id must differ from the sign-in, connector and metering apps: a managed app that reuses one counts as not configured, and a BYO app that reuses one (or the workspace's own BYO connector app) is refused.
- **Managed mode:** an Owner starts admin consent for `RECLAIM_CLIENT_ID`. The callback is bound to a single-use 15-minute state, the workspace, the Owner who started it and the tenant connected to the workspace. Consent counts only after a token for that tenant shows the permission and nothing else. "Verify consent" finishes consent granted directly in Entra or still propagating.
- **Bring your own app:** an Owner enters an app id with a client secret or certificate. The token check runs before anything is stored; the secret or private key is stored AES-256-GCM encrypted (AAD `tenant:reclaim:secretEnc`) and is covered by the key-rotation job. Hidden when `MS_BYO_ENABLED=false`.
- **Roles:** only an Owner grants write access or changes the approval rule. Any Admin can disconnect (it only takes power away), also after a downgrade to Free.
- **Approval rule:** `two_person` (default) or `single_admin`, per workspace, audited.
- **Plan:** feature flag `reclaim`, Pro and MSP. No Free feature moved.
- Disconnecting Microsoft 365 also deletes the reclaim connection.

## Launch steps

1. **Service operator:** register a separate multi-tenant app "LicenseMeter reclaim". Web redirect URI `https://www.licensemeter.com/api/connect/reclaim/callback`. Add exactly one Microsoft Graph application permission, `LicenseAssignment.ReadWrite.All`. Create a secret and set `RECLAIM_CLIENT_ID` and `RECLAIM_CLIENT_SECRET` in Vercel. Never add the permission to the sign-in or connector apps.
2. **Service operator:** run `scripts/db-add-reclaim-connection.sql` (and the later reclaim scripts of this stack) in the Supabase SQL editor before deploying.
3. **Lab test, before release:** in the lab tenant, consent the reclaim app, then on a test user with a directly assigned license run one removal and one undo through LicenseMeter. Confirm in Entra that the license is gone and comes back with the same disabled service plans, that a group-assigned license on the same user is untouched and shown as not reclaimable, and that the app's sign-in log shows only `assignLicense` calls. Record the result here.
4. **Release owner:** merge the stack in order after CI is green. The Changelog workflow publishes the entry.
