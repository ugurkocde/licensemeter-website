# Maintaining the LicenseMeter documentation

Public site: https://docs.licensemeter.com/

The documentation contains 36 English pages and 30 screenshots. Content is in `docs/gitbook/`, with navigation in `SUMMARY.md` and optimized WebP images in `.gitbook/assets/`. This directory is the documentation source. Publication uses GitBook change requests; **Git Sync is not connected**.

## Pending publication: plan wording on the welcome page

Changed on 2026-09-19, not yet published to GitBook. The welcome page (`README.md`) no longer says that LicenseMeter has no paid tiers. It now states what is free on the hosted application, what paid plans add, and that a self-hosted installation includes every feature, with a link to the pricing page. Until this is published, the live welcome page still carries the old sentence, and the onboarding email links new users to the documentation.

## Microsoft consent and sign-in update

Added on 2026-09-19, not yet published to GitBook. It documents Microsoft's admin consent dialog for the hosted connector (application identity, verified publisher, the six dialog lines mapped to permissions), the first-time sign-in prompt including the admin approval case, and the two enterprise applications. Application names, application IDs, the publisher, the publisher domain and the permission wording were read from Microsoft Graph on that date; re-check them if either registration changes.

`microsoft-consent-connector.webp` is a real Microsoft dialog rather than a sample-workspace capture, so `scripts/docs-screenshots.mjs` does not regenerate it. The signed-in account line is masked. Replace it by hand if Microsoft's dialog or the application branding changes.

## Onboarding coverage update

Application source checked: `2e0e24cbcb94fbd282af09133d333e5b924d3eba` on 2026-09-18. The update adds nine guides and expands the existing onboarding, Microsoft, workspace and troubleshooting pages. It includes 13 new screenshots and a fictional practice CSV.

- [Change request](https://app.gitbook.com/o/8JOz1GqzmW1uYxMKpPPG/s/LWIsqiRHwXSWQ10QGIRo/~/changes/8wULF9iDxKJi45m04IdK/)
- [Change preview](https://docs.licensemeter.com/~/changes/2/)
- [Verification and screenshot provenance](onboarding-verification.md)

## Initial publication

- GitBook organization: LicenseMeter
- Site: LicenseMeter Docs
- Space: LicenseMeter documentation
- Application source: committed `main` at `1b1b99fe848a2dd715dd25c7b9bbf61c2640e73a`
- Date: 2026-09-18
- [Change request](https://app.gitbook.com/o/8JOz1GqzmW1uYxMKpPPG/s/LWIsqiRHwXSWQ10QGIRo/~/changes/ADhbazzJMTbDf5GFVrXW/)
- [Change preview](https://docs.licensemeter.com/~/changes/1/)
- DNS: Vercel, team `my-team76`, CNAME `docs` to `ec985e203b-hosting.gitbook.io`
- GitBook trial ends 2026-10-02. The domain is currently a trial feature. The owner must choose a suitable ongoing plan before the trial ends; no subscription purchase was made during setup.

## Update content

Edit Markdown and keep `SUMMARY.md` in sync. Run:

```sh
node scripts/docs-check.mjs
```

Until Git Sync is configured, publishing requires a GitBook change request. Read the current live page before editing. Upload local images with `insert_files`, specifying `contentType: image/webp` with base64 content. For MCP content updates, map relative file paths to the existing page and file IDs. Create the complete page tree before resolving links. Verify the rendered change preview, merge the change request, and check the public pages.

Do not run the initial content-generation scratch script again: the Markdown files contain reviewed edits. Update them directly.

## Refresh screenshots

Use a clean copy of the intended application revision with a fresh embedded database, `DEMO_MODE=true`, a disposable `AUTH_SECRET`, and `APP_BASE_URL=http://localhost:3217`. Do not copy production environment files. Initialize its schema with `drizzle-kit push`, then start the local Next.js server on port 3217. Keep outbound email, chat and operational integrations unconfigured.

From this repository, with the Playwright CLI skill installed:

```sh
node scripts/docs-screenshots.mjs http://localhost:3217
node scripts/docs-check.mjs
```

The capture command uses a separate browser session, selects the sample tenant, disables animations, saves original PNGs under `output/playwright/licensemeter-docs/`, and writes optimized WebP assets. Inspect screenshots for loading states, clipped content and accidental private data before upload. Captions explicitly identify sample data.

## Connecting Git Sync

Git Sync is prepared but not connected. Once it is, a documentation change merged to `main` publishes by itself, and the change-request workflow above becomes obsolete. The steps below are for the owner, in the GitBook and GitHub web interfaces. They were checked against GitBook's documentation on 2026-09-19; GitBook's screens change, so read the labels on screen rather than trusting this order blindly.

`docs/gitbook/.gitbook.yaml` is already committed. Do not add a second `.gitbook.yaml` at the repository root, and do not write `gitbook-docs.yaml` by hand: GitBook generates it during the first sync, and it carries the permanent key that ties the file to the published space.

1. Make sure `main` is green and `node scripts/docs-check.mjs` passes. Note the current commit of `main`.
2. In GitBook, open the change requests of the documentation space. Confirm the two change requests listed above are merged. Archive every change request that is still open or a draft. Do not merge them: the repository already contains those changes, and a change request merged after the sync would push older content to `main`.
3. Record the rollback point. Open the version history, select the newest entry and copy the identifier at the end of the address. Check that `https://docs.licensemeter.com/~/revisions/<id>` shows the current site.
4. On GitHub, install the `gitbook-com` app on the `ugurkocde` account with "Only select repositories" set to `licensemeter-website`. The app needs write access to contents, pull requests and statuses. Check under Settings, Applications that it lists exactly this repository.
5. In GitBook, open the site and choose Git Sync. Connect GitHub, select `ugurkocde/licensemeter-website` and the branch `main`.
6. Set the direction so that the repository replaces the GitBook content (GitHub to GitBook). GitBook's own sources contradict each other about which way the swap button flips, so read the arrow and the labels. This direction replaces the content of the space; the other direction would overwrite the Markdown in the repository with the older published text. Do not start the sync yet.
7. In the advanced options leave the project directory blank, keep previews for forks off (the repository is public), and turn the agent instruction files option off, because the repository already has its own `AGENTS.md` and `CLAUDE.md`.
8. Under content mapping, map the single space to `./docs/gitbook`. Never `./docs` or `/`: `docs/` also holds internal notes and announcement drafts, and only the mapped directory is published.
9. Start the sync and wait. Then run `git pull`. Expect one commit by the GitBook bot that adds `gitbook-docs.yaml` at the repository root and nothing else. If a Markdown file under `docs/gitbook/` was rewritten with older text, the direction was wrong: revert that commit and go to the rollback step.
10. Check the result. The space shows 36 pages in the order of `SUMMARY.md`. The welcome page carries the plan wording (what is free, what paid plans add). The managed consent page shows the consent dialog screenshot. Cards, hints and steppers render and no image is broken. Open `/getting-started/first-sync`, `/connectors/microsoft-managed`, `/self-hosting/microsoft-setup` and `/welcome` on the public site.
11. Test the round trip: open a pull request with a trivial documentation edit, confirm a GitBook status with a preview link appears on it, merge it and confirm the public page changes.
12. Optional: add a merge rule on the space so nobody merges change requests in GitBook. A merged change request becomes a bot commit on `main`, which runs CI and a production deployment.
13. Then update this file: remove this section, the pending publication sections and the change-request instructions, and describe the new workflow.

Rollback, if step 9 or 10 looks wrong: first remove the Git Sync connection from the site, so the rollback itself is not exported to `main`. Then roll back in the version history to the entry recorded in step 3, check the public site, and revert any bot commits on `main`.

Not confirmed by GitBook's documentation: whether page identifiers, feedback and comments survive the first import; whether the image files uploaded earlier through the API remain in the space as orphans (every image is also in the repository, so nothing is lost); whether `/welcome` keeps working, which is why the redirect exists; and which plan Git Sync and the custom domain need after the trial ends on 2026-10-02.
