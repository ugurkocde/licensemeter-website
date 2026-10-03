# Windows Software Metering rollout

Status: implemented for review; live populated-output and minimum-permission validation remain launch gates. No tenant configuration or device-policy writes were performed during implementation.

## Decisions

- Optional per workspace, no plan restriction in the initial release. Base connector permissions remain unchanged.
- Separate multi-tenant registration with exactly `DeviceManagementScripts.Read.All` and `DeviceManagementManagedDevices.Read.All`. Delegated incremental consent does not solve application-permission consent isolation.
- Customer owns Windows policy, collector deployment and package assignment. LicenseMeter only reads Graph beta.
- Fixed six-application catalogue, bounded output, default 60-day evidence window with 30/90-day alternatives. No user attribution, installation inference, active duration, savings calculations or automatic reclaim.
- Device checkpoint preserves historical last-launch dates. Negative evidence requires continuous event coverage. Missing, malformed, unhealthy, stale or failed-refresh evidence remains unknown.
- No separate registration is provisioned automatically. Self-hosted operators configure their own optional registration through server environment settings.

## Review incorporated

Claude Code using `claude-opus-5-5` reviewed both the concept and implementation. The implementation incorporates separate consent, tenant/workspace/user-bound single-use callbacks, strict output validation, independent sync failure handling, deletion on disable, and a customer pilot requirement. Follow-up fixes cover locale-independent collector dates, weekend-safe coverage based on event continuity, bounded consent probes, duplicate device/state handling, collection-budget recovery, and a separate access-verification button for delayed or portal-granted consent. Audit policy changes conservatively reset coverage, even if a change may be harmless.

## Completed in this change

- Optional configuration, database migration, metering-only connection and consent state.
- Admin setup, consent verification, package selection, manual refresh, scheduled-sync integration and disable/purge.
- Windows PowerShell 5.1 detection-only collector with a protected local checkpoint.
- Beta Graph paging, response validation, restricted next links, throttling and deadlines.
- Device/app report, 30/60/90-day evidence states, pagination, CSV export and synthetic demo.
- Customer setup/removal documentation, permission and data disclosures, DPA version 2.2.
- Parser, Graph-client and database lifecycle/consent regression coverage; browser demo coverage; Windows collector contract CI.

## Launch sequence and owners

1. **Service operator:** create the separate metering registration, configure the production Web redirect, add exactly the two application permissions, store its secret server-side, and configure `METERING_CLIENT_ID` / `METERING_CLIENT_SECRET`. Never alter the sign-in or base connector app permissions. Complete secret rotation ownership.
2. **Service operator:** deploy the committed migration with the application, apply both the table and policy migrations and verify RLS and runtime-role grants for the new tenant tables, and confirm the optional setup panel is available. Review the DPA 2.2 metadata changes and the existing agreement acceptance flow before launch.
3. **Pilot tenant admin:** approve the optional application. Use a Lokka connection authenticated as that application with only the two required roles. Re-run the read-only beta package, managed-device and run-state requests in that tenant. Confirm documented read access works without any broader roles.
4. **Pilot device admin:** review privacy and licensing prerequisites, enable Process Creation Success auditing through approved policy, then deploy the downloaded detection-only script to a small Windows group as SYSTEM, 64-bit, daily. Do not enable command-line logging solely for this feature.
5. **Pilot owner:** run the acceptance cases below, including at least two daily reports. Confirm Intune output encoding, timestamps and managed-device linkage before broad deployment. Record sanitized outcomes, never raw logs or identifiers in public release material.
6. **Service operator:** expand assignment only after successful pilot and healthy sync. Watch sanitized error rates and request duration. A collection caps at 50,000 rows / 500 pages per resource; assess large tenants before enabling them.
7. **Release owner:** merge only after repository CI is green and launch prerequisites are accepted. The repository Changelog workflow publishes the entry after merge. No duplicate manual announcement.

## Required pilot cases

- A workspace without metering enabled receives no new consent prompt and makes no metering Graph reads.
- Consent from another tenant cannot change the bound Microsoft tenant; declined, expired and reused callbacks do not enable reads.
- Launch a tracked executable between collector runs and verify its last-launch timestamp in Intune, LicenseMeter and CSV.
- Confirm valid populated `preRemediationDetectionScriptOutput`, `lastStateUpdateDateTime`, `detectionState`, and expanded `managedDevice.id`. Exercise paging with populated run states, not only empty collections.
- Audit disabled, log rollover before collection, log clear, budget exhaustion, and malformed output must not produce negative evidence. A weekend shutdown with intact bookmark must retain coverage.
- Confirm no usernames, command lines, document paths or raw logs leave the collector. Review device-linked data with the customer.
- Test a non-English SYSTEM locale and Windows PowerShell 5.1. CI covers syntax and contract; customer-device policy and Intune delivery remain separate tests.
- Disconnect or disable while a refresh is in flight. Stored metering rows must remain deleted. Re-enabling requires a new metering connection generation.
- Revoke metering permissions and confirm failed refresh marks prior evidence unknown while normal Microsoft 365 sync continues.
- Verify role-restricted setup and exports, stale reports, zero packages, zero run states, and delayed consent propagation.

## Live verification completed

Read-only Lokka Graph beta calls successfully exercised package discovery with paging, managed-device fields with paging, the exact selected/expanded run-state endpoint, and invalid-field error handling. The current tenant's existing packages returned empty run-state collections. The active verification credential had broader rights, so these results do not prove the minimum two-role application or a complete collector-to-report path. Those exact remaining checks require the pilot above.

A repeat live check on 2026-10-03 found 10 packages and 9 managed devices (4 Windows). Single-item paging reached the end of both collections, including empty terminal pages, and matched the application's 100-item queries. All 10 selected/expanded run-state queries returned empty collections. An invalid selected field returned HTTP 400. A nonexistent package returned HTTP 404 when requested directly, but HTTP 200 with an empty collection from its run-state endpoint. Sync now checks package availability after an empty run-state response and preserves prior observations with a setup error when the selected package is missing. Populated run-state fields, device linkage, output delivery and access with only the two metering permissions remain unverified in the live tenant.

## Follow-up after the pilot

Evaluate customer-defined catalogues with output-size budgets, a dedicated BYO metering connection UI, installation evidence, scale beyond current collection limits, and longer-term Graph beta compatibility. Keep them out of inactivity claims until their evidence is available.

## References

- [Customer setup guide](../docs-site/src/content/docs/connectors/windows-metering.md)
- [Microsoft consent types](https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer)
- [Intune Remediations](https://learn.microsoft.com/en-us/intune/device-management/tools/deploy-remediations)
- [Graph run-state resource](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-devicehealthscriptdevicestate?view=graph-rest-beta)
