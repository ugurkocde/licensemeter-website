# Onboarding documentation verification

Date: 2026-09-18. Application revision: `2e0e24cbcb94fbd282af09133d333e5b924d3eba`.

## Scope and source checks

The public documentation now covers preparation, hosted and self-hosted sign-in differences, workspace selection, invitations, domain-join approval, empty-state onboarding, managed and BYO Microsoft setup, CSV import, instant scans, first-sync verification, the first finding review and the sample workspace.

Checked against the account access and domain-join implementation, connector configuration and routes, CSV and scan handlers, sync poller, workspace settings and membership controls, price editor, finding workflow and report endpoint. Microsoft's official admin-consent documentation was also checked for the distinction between application consent roles. Existing links and public page paths were preserved.

## Browser verification

Used an isolated archive of the application revision with a new embedded database, fictional Example Ltd identities, local-only session provisioning, and no production environment file, provider credentials or email delivery. Fixture routes existed only in that disposable archive and are not part of the application source or deployment.

Verified the following through the real application controls:

1. Empty workspace, Microsoft setup alternatives, expanded BYO form, CSV form and member invitation controls.
2. Imported `gitbook/.gitbook/assets/example-users.csv`: two fictional users, one disabled-account finding.
3. Saved EUR 20 per seat for the single example product. Total assigned spend changed to EUR 40; the finding estimate changed to EUR 20 per month.
4. Saved a planned review, assignee, due date and notes; acknowledged the finding and reloaded to verify persistence. Acknowledgement left the finding active.
5. Requested the Overview PDF report using the fixture session: HTTP 200, `application/pdf`, 4,516 bytes and a valid `%PDF-` signature.
6. Observed the public hosted sign-in and sign-up controls without submitting identity information or creating an account.

The existing CSV-import and domain-join test suites passed: three files, 38 tests. These tests supplement the browser walkthrough; they are not evidence of a live tenant assessment.

## Screenshot provenance

All `onboarding-*.webp` images are screenshots, not generated artwork. Raw PNGs are disposable output under `output/playwright/`; optimized WebP files are committed with the docs.

| Images | Provenance |
| --- | --- |
| `sign-in`, `sign-up` | Public hosted authentication pages with empty fields |
| `empty`, `microsoft`, `byo`, `csv`, `members` | Actual application views with a fictional local identity and no provider connection |
| `first-results`, `price`, `workflow` | Actual saved results from the fictional CSV walkthrough |
| `sync-running`, `sync-failed` | Actual sync-status component with a Playwright-intercepted response; no provider sync occurred |
| `access` | Actual access components composed in a local illustration; requester and administrator states shown together, explicitly captioned |

To refresh, follow the disposable-copy rules in [the maintenance guide](gitbook-maintenance.md). Capture setup views before importing, then repeat the numbered walkthrough. For sync-state illustrations, intercept only the local `/api/sync` response and capture the Tenant connected card. Never use a real consent grant merely to create a progress screenshot. For access illustrations, render the existing components with fictional props in the disposable copy. Keep these fixture routes out of the deployable repository. Capture hosted sign-in separately with empty fields, inspect every image, then optimize with Sharp WebP quality 85.

## Verification limits

No real account registration, invitation email, provider consent, credential validation or live Microsoft scan was performed. Those branches were documented from source and the observed public controls. Captions distinguish simulated responses from actual saved fixture results. A complete production identity-provider journey still requires an authorized test account and tenant.
