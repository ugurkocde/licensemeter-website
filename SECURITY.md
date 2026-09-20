# Security

Report suspected vulnerabilities privately to **support@ugurlabs.com** with the affected revision, reproduction steps, and expected impact. Do not open public issues containing exploit details, credentials, tenant records, or personal data. We will coordinate disclosure after investigating.

Only the current main branch is maintained. Update dependencies and deployments regularly.

## Deployment boundaries

- Use HTTPS for real users and keep PostgreSQL off the public network.
- Separate schema-migration and application credentials.
- Tenant isolation is enforced in application code. Database access is privileged: the runtime role can access all workspace rows.
- Row Level Security is enabled on every table, but it is a Data API (Supabase) deny-all control, not a tenant boundary by default: the runtime role holds a permissive policy. The runtime role must stay a plain login that owns no table and has no `BYPASSRLS`, or RLS is silently inert for it; `scripts/db-audit-posture.sql` fails on either drift.
- Database-level tenant isolation is available through `withTenant()` (`src/server/db/tenant.ts`), which pins a request to a tenant via the `app.tenant_id` setting and switches to a dedicated `licensemeter_tenant` role whose row policies enforce it. `scripts/db-tenant-rls.sql` creates that role and its policies; set `TENANT_DB_ROLE=licensemeter_tenant` to turn the switch on. Rollout is incremental: wrapped paths are enforced by the database, paths not yet wrapped keep working at application-level isolation, so enabling it cannot fail closed. Until a path is wrapped, isolation for it remains application-level.
- Keep `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, and backups confidential. Preserve the encryption key for restoration.
- Review connector permissions and exported remediation scripts before using them.
- Keep the optional demo limited to synthetic data.
- Self-hosting does not inherit hosted legal terms, security operations, retention, or infrastructure guarantees.

Environment files, keys, database files, and generated output must stay out of Git and Docker build contexts. Scan history before publishing a fork. If a credential was committed, rotate it; deleting today's file does not erase history.
