# Maintaining the LicenseMeter documentation

Public site: https://docs.licensemeter.com/

The documentation contains 37 English pages and 34 images. It is an Astro Starlight site in `docs-site/`: pages in `src/content/docs/`, the sidebar in `astro.config.mjs`, optimized WebP images in `src/assets/` and the practice CSV in `public/downloads/`. `docs-site/README.md` covers local development and page conventions.

## Content notes

`microsoft-consent-connector.webp` is a real Microsoft dialog rather than a sample-workspace capture, so `scripts/docs-screenshots.mjs` does not regenerate it. The signed-in account line is masked. Replace it by hand if Microsoft's dialog or the application branding changes. The page around it documents Microsoft's admin consent dialog for the hosted connector (application identity, verified publisher, the dialog lines mapped to permissions), the first-time sign-in prompt including the admin approval case, and the two enterprise applications. Application names, application IDs, the publisher, the publisher domain and the permission wording were read from Microsoft Graph on 2026-09-19; re-check them if either registration changes.

## Onboarding coverage update

Application source checked: `2e0e24cbcb94fbd282af09133d333e5b924d3eba` on 2026-09-18. The update adds nine guides and expands the existing onboarding, Microsoft, workspace and troubleshooting pages. It includes 13 new screenshots and a fictional practice CSV. See [verification and screenshot provenance](onboarding-verification.md).

## Hosting

- Vercel project `licensemeter-docs`, team `my-team76`, root directory `docs-site`, framework Astro, connected to this repository.
- Domain `docs.licensemeter.com`, served through the `*` wildcard record of the Vercel DNS zone. There is no separate `docs` record.
- `docs-site/vercel.json` enables trailing slashes, so the slash-less URLs of the former GitBook site redirect, and keeps the `/readme` and `/welcome` aliases working. It also skips builds of commits that do not change `docs-site/`.
- History: published on GitBook from 2026-09-18 until 2026-09-29, when the site moved to Vercel with the same URLs.

## Update content

Edit the Markdown or MDX page and add new pages to the sidebar in `docs-site/astro.config.mjs`. Link between pages with absolute paths and a trailing slash. Run:

```sh
node scripts/docs-check.mjs
cd docs-site && npm ci && npm run build
```

The check covers dashes, leftover GitBook syntax and sidebar coverage. The build fails on a broken internal link, heading anchor or image. CI runs both.

Open a pull request against `main`. Vercel posts a preview of the docs site on it, and merging deploys to production, so there is no separate publishing step.

## Refresh screenshots

Use a clean copy of the intended application revision with a fresh embedded database, `DEMO_MODE=true`, a disposable `AUTH_SECRET`, and `APP_BASE_URL=http://localhost:3217`. Do not copy production environment files. Initialize its schema with `drizzle-kit push`, then start the local Next.js server on port 3217. Keep outbound email, chat and operational integrations unconfigured.

From this repository, with the Playwright CLI skill installed:

```sh
node scripts/docs-screenshots.mjs http://localhost:3217
node scripts/docs-check.mjs
```

The capture command uses a separate browser session, selects the sample tenant, disables animations, saves original PNGs under `output/playwright/licensemeter-docs/`, and writes optimized WebP assets to `docs-site/src/assets/`. Inspect screenshots for loading states, clipped content and accidental private data before committing. Captions explicitly identify sample data.

## Refresh email examples

The four images on the "Emails from LicenseMeter" page are rendered from the real templates with fictional data. Nothing is sent and no database or mail service is touched. Rerun this after changing a template or its copy, then inspect the images:

```sh
SKIP_ENV_VALIDATION=1 npx tsx scripts/docs-email-screenshots.ts
node scripts/docs-check.mjs
```

It needs a Playwright Chromium (`npx playwright install chromium`). When a new kind of email reaches users, add it to that page, at least to the table of other emails.
