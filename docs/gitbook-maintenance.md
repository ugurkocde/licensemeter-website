# Maintaining the LicenseMeter documentation

Public site: https://docs.licensemeter.com/

The documentation contains 37 English pages and 34 images. Content is in `docs/gitbook/`, with navigation in `SUMMARY.md` and optimized WebP images in `.gitbook/assets/`. This directory is the documentation source. The space is connected to this repository through GitBook Git Sync (GitHub to GitBook), so a documentation change merged to `main` publishes by itself.

## Content notes

`microsoft-consent-connector.webp` is a real Microsoft dialog rather than a sample-workspace capture, so `scripts/docs-screenshots.mjs` does not regenerate it. The signed-in account line is masked. Replace it by hand if Microsoft's dialog or the application branding changes. The page around it documents Microsoft's admin consent dialog for the hosted connector (application identity, verified publisher, the dialog lines mapped to permissions), the first-time sign-in prompt including the admin approval case, and the two enterprise applications. Application names, application IDs, the publisher, the publisher domain and the permission wording were read from Microsoft Graph on 2026-09-19; re-check them if either registration changes.

## Onboarding coverage update

Application source checked: `2e0e24cbcb94fbd282af09133d333e5b924d3eba` on 2026-09-18. The update adds nine guides and expands the existing onboarding, Microsoft, workspace and troubleshooting pages. It includes 13 new screenshots and a fictional practice CSV. See [verification and screenshot provenance](onboarding-verification.md).

## Initial publication

- GitBook organization: LicenseMeter
- Site: LicenseMeter Docs
- Space: LicenseMeter documentation
- Application source: committed `main` at `1b1b99fe848a2dd715dd25c7b9bbf61c2640e73a`
- Date: 2026-09-18
- DNS: Vercel, team `my-team76`, CNAME `docs` to `ec985e203b-hosting.gitbook.io`
- GitBook trial ends 2026-10-02. The domain is currently a trial feature. The owner must choose a suitable ongoing plan before the trial ends; no subscription purchase was made during setup.

## Update content

Edit Markdown and keep `SUMMARY.md` in sync. Run:

```sh
node scripts/docs-check.mjs
```

Open a pull request against `main`, check the GitBook status and preview on it, and merge. Git Sync publishes the merged change to the space and the public site, so there is no separate publishing step. Do not rename or delete `docs/gitbook/.gitbook.yaml`, and do not add a second `.gitbook.yaml` at the repository root.

Do not run the initial content-generation scratch script again: the Markdown files contain reviewed edits. Update them directly.

## Refresh screenshots

Use a clean copy of the intended application revision with a fresh embedded database, `DEMO_MODE=true`, a disposable `AUTH_SECRET`, and `APP_BASE_URL=http://localhost:3217`. Do not copy production environment files. Initialize its schema with `drizzle-kit push`, then start the local Next.js server on port 3217. Keep outbound email, chat and operational integrations unconfigured.

From this repository, with the Playwright CLI skill installed:

```sh
node scripts/docs-screenshots.mjs http://localhost:3217
node scripts/docs-check.mjs
```

The capture command uses a separate browser session, selects the sample tenant, disables animations, saves original PNGs under `output/playwright/licensemeter-docs/`, and writes optimized WebP assets. Inspect screenshots for loading states, clipped content and accidental private data before upload. Captions explicitly identify sample data.

## Refresh email examples

The four images on the "Emails from LicenseMeter" page are rendered from the real templates with fictional data. Nothing is sent and no database or mail service is touched. Rerun this after changing a template or its copy, then inspect the images:

```sh
SKIP_ENV_VALIDATION=1 npx tsx scripts/docs-email-screenshots.ts
node scripts/docs-check.mjs
```

It needs a Playwright Chromium (`npx playwright install chromium`). When a new kind of email reaches users, add it to that page, at least to the table of other emails.

## Git Sync

Connected on 2026-09-19. The space syncs with `ugurkocde/licensemeter-website`, branch `main`, content mapped to `./docs/gitbook`, initial direction GitHub to GitBook. Changes now flow both ways: a merge to `main` publishes, and a change request merged in GitBook becomes a bot commit on `main`.

- Never map the space to `./` or `./docs`: `docs/` also holds internal notes and announcement drafts, and only the mapped directory is published.
- `docs/gitbook/.gitbook.yaml` is committed. Do not add a second `.gitbook.yaml` at the repository root and do not hand-write `gitbook-docs.yaml`.
- To confirm the round trip, open a pull request with a trivial edit under `docs/gitbook/`, check that a GitBook status with a preview link appears, merge, and confirm the public page changes.
- Optional: add a merge rule on the space so nobody merges change requests in GitBook. A merged change request becomes a bot commit on `main`, which runs CI and a production deployment.

Rollback: first remove the Git Sync connection from the site, so the rollback itself is not exported to `main`, then roll back in the space's version history and revert any bot commits on `main`.
