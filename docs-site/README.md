# LicenseMeter Docs

Source for [docs.licensemeter.com](https://docs.licensemeter.com), built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). It is a standalone package: the Next.js app at the repository root does not build, lint or type check it.

## Run locally

```sh
cd docs-site
npm ci
npm run dev      # dev server at http://localhost:4321
npm run build    # static build into dist/, fails on broken internal links
npm run preview  # serve the built site
```

## Where things live

* Pages: `src/content/docs/`. The file path is the URL, so `connectors/zoom.md` is served at `/connectors/zoom/` and `index` files serve their folder.
* Sidebar, site settings and plugins: `astro.config.mjs`. Add new pages to the sidebar there.
* Screenshots: `src/assets/`, referenced with relative paths so Astro optimizes them. Downloadable files: `public/downloads/`.
* Branding: `src/styles/custom.css`, `src/assets/logo-*.svg`, `public/favicon.*`.
* Header links (Support, Open LicenseMeter): `src/components/HeaderLinks.astro`.
* Redirects from the old GitBook URLs: `vercel.json`.

Link between pages with absolute paths and a trailing slash, for example `/findings/rules/`. The build checks every internal link and heading anchor.

Callouts use `:::note`, `:::tip`, `:::caution` and `:::danger`. Numbered procedures use `<Steps>` from `@astrojs/starlight/components` in an `.mdx` page.

## Deployment

Vercel deploys the site on every push to `main` that changes `docs-site/` (project root directory `docs-site`, framework Astro). Redirects and `trailingSlash` in `vercel.json` only apply on Vercel, not in `npm run preview`.
