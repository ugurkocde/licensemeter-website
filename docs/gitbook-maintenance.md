# Maintaining the LicenseMeter documentation

Public site: https://docs.licensemeter.com/

The first publication contains 27 English pages and 16 sample-workspace screenshots. Content is in `docs/gitbook/`, with navigation in `SUMMARY.md` and optimized WebP images in `.gitbook/assets/`. This directory is the documentation source. The first publication used a GitBook change request; **Git Sync is not connected**.

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

Use a clean copy of the intended application revision with a fresh embedded database, `AUTH_PROVIDER=entra`, `DEMO_MODE=true`, a disposable `AUTH_SECRET`, and `APP_BASE_URL=http://localhost:3217`. Do not copy production environment files. Initialize its schema with `drizzle-kit push`, then start the local Next.js server on port 3217. Keep outbound email, chat and operational integrations unconfigured.

From this repository, with the Playwright CLI skill installed:

```sh
node scripts/docs-screenshots.mjs http://localhost:3217
node scripts/docs-check.mjs
```

The capture command uses a separate browser session, selects the sample tenant, disables animations, saves original PNGs under `output/playwright/licensemeter-docs/`, and writes optimized WebP assets. Inspect screenshots for loading states, clipped content and accidental private data before upload. Captions explicitly identify sample data.

## Optional Git Sync

Connect this existing site to the repository only when ready. Scope the content mapping to `docs/gitbook/`, preserve the current live content, and choose the initial sync direction deliberately. Do not map the repository root or all of `docs/`, which also contains internal notes and announcement drafts. Verify the imported tree and rendered pages before treating the Git repository as the publishing source.

The product changelog uses the repository's existing entry-file workflow. Do not manually publish a duplicate announcement.
