# Retiring the previous identity schema

This upgrade removes the previous sign-in provider's columns, automatic email linking, email recovery endpoints and recovery tokens. Workspace memberships and MSP account ownership now resolve only through Microsoft object IDs. Normal unclaimed invitations still work. Historical audit and DPA records remain unchanged.

## Before deployment

1. Take a database backup and verify that it can be restored. Test this upgrade against a restored copy first.
2. Stop the old web application, background jobs and any other database writers. Keep traffic stopped until the new schema and application are both ready. The old application cannot run after its columns are dropped, and the new application must not serve traffic against the old schema: an unmapped membership could otherwise look like an invitation.
3. Inventory unresolved identities with the queries below. Review each affected account with its workspace or billing owner. Establish the Microsoft object ID through independent identity verification, not an email match alone.
4. Assign verified Microsoft IDs to memberships and MSP account owners before upgrading. Preserve the existing membership ID, role, workspace and MSP account ID so subscriptions and attachments stay intact. Explicitly remove an obsolete membership only after checking that another verified Owner retains access. A new invitation is a separate access grant, not an automatic recovery of ownership.
5. Decline pending requests without Microsoft identities and invite those colleagues again. Historical approved and declined requests remain for reference; decisions without Microsoft IDs no longer match new sign-ins by email.

```sql
SELECT id, tenant_id, email, role
FROM memberships
WHERE workos_user_id IS NOT NULL AND oid IS NULL;

SELECT id, name
FROM msp_accounts
WHERE owner_workos_user_id IS NOT NULL AND owner_oid IS NULL;

SELECT id, tenant_id, email
FROM join_requests
WHERE oid IS NULL AND status = 'pending';
```

Do not clear an old identity field to bypass the check. It would turn an existing membership into an invitation or remove the only evidence of MSP ownership. If any mapping or ownership is uncertain, stop the upgrade and retain the backup and previous application.

## Apply and verify

Docker applies `0011_retire_legacy_identity.sql` through its versioned migration service before starting the web application. The migration locks the relevant tables and checks unresolved identities before dropping anything, within the migrator's transaction. A failed check rolls the migration back.

For an existing hosted database already at the schema through migration 0010, execute `scripts/db-retire-legacy-identity.sql` with the database owner's connection and stop-on-error enabled. For example, use `psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f scripts/db-retire-legacy-identity.sql`. Set `DATABASE_ADMIN_URL` only in the operator session for this one-time migration. Keep the database-owner credential out of the web application environment; its `DATABASE_URL` must retain the limited runtime role. The script wraps the same guarded SQL in a transaction. Do not use `db:push` for this upgrade, since it skips the data checks. If the database is already managed by the versioned migrator, use that migrator instead of the hosted script. Do not run the initial Docker migration against an existing untracked hosted database.

Deploy the matching application and verify sign-in with a representative workspace Owner, an invited colleague and an MSP billing owner. Confirm workspace switching, roles, paid access and the existing MSP client attachments before restoring traffic. Stop if any expected account or billing owner cannot access their resources.

## Recovery and irreversible effects

The upgrade deletes old identity values and outstanding email recovery tokens. Existing recovery links no longer work. No automatic linking or adoption fallback remains. Dropped values cannot be reconstructed from the new schema; rolling back requires restoring the pre-upgrade database backup and the matching previous application while traffic is stopped. Account for any writes after the backup before deciding to restore it.

Historical migrations and their schema snapshots remain immutable so existing migration ledgers and fresh installations continue to work. Retired column names occur only in that history, this upgrade procedure and its regression tests.
