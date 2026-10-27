# Windows Software Metering rollout

Status: implemented for review; live populated-output and minimum-permission validation remain launch gates. No tenant configuration or device-policy writes were performed during implementation.

## Decisions

- Optional per workspace and included in Pro (and MSP, which includes Pro). Free workspaces see a lock panel; the API, export and consent start answer with a plan error, and no Graph reads happen. Disable stays available after a downgrade. Base connector permissions remain unchanged.
- Third app registration, separate from sign-in and the Microsoft 365 connector, so customers who never enable metering never grant Intune permissions.
- Separate multi-tenant registration with exactly `DeviceManagementScripts.Read.All`, `DeviceManagementManagedDevices.Read.All` and `DeviceManagementApps.Read.All`, all read-only. The third permission reads the Intune app list and per-app install status. Delegated incremental consent does not solve application-permission consent isolation.
- Customer owns Windows policy, collector deployment and package assignment. LicenseMeter only reads Graph beta.
- No storage of metering results. The report and CSV read `deviceRunStates` and managed devices live from Graph on each view, with at most five minutes of in-process caching. Only settings (enabled, consent, selected package, observation period, excluded apps, admin-entered program files, program lists of the last ten generated collectors) and pending consent are stored. There is no LicenseMeter-side history and no scheduled metering sync.
- No user names are collected, reported or shown. The collector reports only program file names, last starts, 24-hour start counts, coverage and health per device. The Intune install report offers user columns; LicenseMeter selects only `DeviceId`, `InstallState` and `AppInstallState` and fails closed on any other column.
- App catalogue = every assigned Windows app in the customer's Intune (option A, decided 2026-10-27), not an admin selection and not every running program. Program files come from an admin entry, the Intune detection rule, or LicenseMeter's known-app list, in that order; apps without one are listed but not metered. Admins can exclude apps. The collector is generated per workspace with the program list built in; when the Intune app list changes, the dashboard reports devices on an older list and the admin replaces the detection script. The script never contacts LicenseMeter.
- Write on scripts (decided 2026-10-27): the metering app requests `DeviceManagementScripts.ReadWrite.All` instead of `.Read.All`, so Setup can create the collector package (detection-only, SYSTEM, 64-bit, optionally assigned to all devices hourly) and update its script. Writes happen only when an Admin confirms, only for the package identified as the collector, only with generated content, and are logged. Tested in the lab with an app holding only this permission: update kept assignment and schedule, create, assign and delete worked, managed devices stayed refused. The permission is tenant-wide and also covers other device scripts; Graph cannot narrow it. Consent with the old `.Read.All` keeps working without automation. DPA version 2.3.
- Navigation and setup (revised 2026-10-27 after the first production view): Software Metering has Dashboard, Apps and Setup pages under its sidebar item. Setup is a three-step wizard. LicenseMeter finds the collector package by reading the deployed detection scripts (marker plus `$CatalogId` and `$Programs`) through `DeviceManagementScripts.Read.All`, so there is no package picker and the deployed program list is known without a download on that site. Other scripts are only checked for the marker and never kept. Keeping the deployed script current needs `DeviceManagementScripts.ReadWrite.All`; see the write decision above.
- Headline: installed (Intune install report) vs started (collector), per app, default 60-day evidence window with 30/90-day alternatives. Labels: App started, App not started, Still collecting, Script update needed, No data, Report stale. No user attribution, active duration, savings calculations or automatic reclaim.
- Collector protocol 2: only started programs are reported as `[program, minutes before end, starts in 24 h]`, plus the program list id, coverage, and later watch starts for newly added programs. Output over 2,048 characters drops the oldest starts and is flagged as truncated, which the parser treats as no data for unlisted apps. Starts whose parent is the same program are not counted again.
- Device checkpoint preserves last starts (120 days) and hourly start counts (24 hours). Negative evidence requires continuous event coverage. Missing, malformed, unhealthy or stale evidence remains unknown. A failed live read shows an error and no results.
- Hourly collector schedule, changed from daily after the first live pilot. A larger Security log is recommended only for very busy devices that still report coverage gaps.
- No separate registration is provisioned automatically. Self-hosted operators configure their own optional registration through server environment settings.

## Review incorporated

Independent reviews covered both the concept and implementation. The implementation incorporates separate consent, tenant/workspace/user-bound single-use callbacks, strict output validation, deletion on disable, and a customer pilot requirement. Follow-up fixes cover locale-independent collector dates, weekend-safe coverage based on event continuity, bounded consent probes, duplicate device/state handling, collection-budget recovery, and a separate access-verification button for delayed or portal-granted consent. Audit policy changes conservatively reset coverage, even if a change may be harmless.

## Completed in this change

- Optional configuration, database migration for metering settings and consent state only.
- Admin setup, consent verification, package selection, live reads with an immediate re-read, and disable.
- Windows PowerShell 5.1 detection-only collector, generated per workspace from the Intune app list, with a protected local checkpoint.
- Beta Graph paging, response validation, restricted next links, throttling and deadlines.
- Installed vs started dashboard, recency chart, collection health, app search, per-app device list, 30/60/90-day evidence states, CSV export and synthetic demo.
- Customer setup/removal documentation, permission and data disclosures, DPA version 2.2.
- Parser, Graph-client and database lifecycle/consent regression coverage; browser demo coverage; Windows collector contract CI.

## Launch sequence and owners

1. **Service operator:** create the separate metering registration, configure the production Web redirect, add exactly the three application permissions, store its secret server-side, and configure `METERING_CLIENT_ID` / `METERING_CLIENT_SECRET`. Never alter the sign-in or base connector app permissions. Complete secret rotation ownership.
2. **Service operator:** deploy the committed migration with the application, apply both the table and policy migrations and verify RLS and runtime-role grants for the new tenant tables, and confirm the optional setup panel is available. Review the DPA 2.2 metadata changes and the existing agreement acceptance flow before launch.
3. **Pilot tenant admin:** approve the optional application. Use a Lokka connection authenticated as that application with only the three required roles. Re-run the read-only beta package, managed-device and run-state requests in that tenant. Confirm documented read access works without any broader roles.
4. **Pilot device admin:** review privacy and licensing prerequisites, enable Process Creation Success auditing through approved policy, then deploy the downloaded detection-only script to a small Windows group as SYSTEM, 64-bit, hourly. Do not enable command-line logging solely for this feature.
5. **Pilot owner:** run the acceptance cases below, including reports spanning at least two days. Confirm Intune output encoding, timestamps and managed-device linkage before broad deployment. Record sanitized outcomes, never raw logs or identifiers in public release material.
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
- Disable metering and confirm the report and export stop reading immediately. Re-enabling requires a new metering connection generation.
- Revoke metering permissions and confirm the report shows a read error, with no results, while normal Microsoft 365 sync continues.
- Confirm report load time with the largest pilot tenant, since every uncached view reads Graph.
- Verify role-restricted setup and exports, stale reports, zero packages, zero run states, and delayed consent propagation.

## Live verification completed

Read-only Lokka Graph beta calls successfully exercised package discovery with paging, managed-device fields with paging, the exact selected/expanded run-state endpoint, and invalid-field error handling. The current tenant's existing packages returned empty run-state collections. The active verification credential had broader rights, so these results do not prove the minimum-role application or a complete collector-to-report path. Those exact remaining checks require the pilot above.

A repeat live check on 2026-10-03 found 10 packages and 9 managed devices (4 Windows). Single-item paging reached the end of both collections, including empty terminal pages, and matched the application's 100-item queries. All 10 selected/expanded run-state queries returned empty collections. An invalid selected field returned HTTP 400. A nonexistent package returned HTTP 404 when requested directly, but HTTP 200 with an empty collection from its run-state endpoint. Reads now check package availability after an empty run-state response and report a setup error when the selected package is missing. Populated run-state fields, device linkage, output delivery and access with only the two metering permissions remain unverified in the live tenant.

## First live pilot (2026-10-26 to 2026-10-27)

One Entra-joined Windows 11 Pro lab device, Intune-enrolled with no Entra user signed in. The collector was deployed as a detection-only Remediation (SYSTEM, 64-bit), limited to the device with an assignment filter, alongside a settings catalogue policy enabling Process Creation Success auditing.

- Device-context delivery works without a signed-in Entra user. The script ran, exited 0 and reported compliant.
- `deviceRunStates` returned valid protocol 1 output, `detectionState`, `lastStateUpdateDateTime` and the expanded `managedDevice.id` for the correct device. This closes the populated run-state and device-linkage checks.
- Intune published the device-level result 3 to 14 hours after the device sent it. `runSummary` updated within minutes, while `deviceRunStates`, the reports export and the portal device status stayed empty until then. Setup guidance now warns about this delay.
- Both runs reported `log_reset`. The default 20 MB Security log held about 70 minutes of events on this busy device, so the checkpoint record was overwritten before the next run. The collector correctly refused to claim continuous coverage. A daily schedule cannot produce negative evidence on such devices, so the schedule is now hourly. Setup guidance recommends a larger Security log for very busy devices that still report gaps.

- With hourly runs and a 200 MB Security log, consecutive runs kept continuous coverage (`health: "ok"`). The Security log size policy reached the device but only takes effect after the Event Log service restarts, so setup guidance now says so.
- End to end: a renamed test executable matching a catalogue entry was launched once. The next run reported its exact launch time with `health: "ok"`. Intune published the run state about 2 minutes after the run. The application parser accepted the output and classified the application as observed and the untouched catalogue entries as learning.

## Second live test (2026-10-27): Intune app catalogue, local LicenseMeter build

LicenseMeter ran locally against the lab tenant with a separate test registration holding only the three metering permissions, consented by a Global Administrator.

- Consent verification, package listing, collector download and live reads all worked with exactly the three roles.
- The tenant had 50 assigned Windows apps. 30 resolved to program files (known-app list and detection rules), 20 stayed unknown and were listed but not metered.
- The generated collector (32 program files) ran from the pilot package. Graph returned protocol 2 output, and the dashboard showed the device, its last start and its 24-hour start count. A preinstalled app started on the device appeared as started but not reported installed, as designed.
- Install status came back without user columns.
- Fixed during the test: overlapping on-demand and scheduled runs produced `collector_error` (the second run now waits for the first); one install report call per app was throttled (now up to 20 apps per call); the refresh action and the page did not share the read cache (now shared through `globalThis`).

Still open: a live read through the deployed production application with the operator's own metering registration.

## Follow-up after the pilot

Evaluate customer-defined catalogues with output-size budgets, a dedicated BYO metering connection UI, installation evidence, scale beyond current collection limits, and longer-term Graph beta compatibility. Keep them out of inactivity claims until their evidence is available.

## References

- [Customer setup guide](../docs-site/src/content/docs/connectors/windows-metering.md)
- [Microsoft consent types](https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer)
- [Intune Remediations](https://learn.microsoft.com/en-us/intune/device-management/tools/deploy-remediations)
- [Graph run-state resource](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-devicehealthscriptdevicestate?view=graph-rest-beta)
