# Lessons

## Verify with the real build before pushing (2026-06-16)
**Mistake:** Pushed legal-page edits verified only with `tsc --noEmit` + Prettier.
Vercel's `next build` runs ESLint (`react/no-unescaped-entities`), which rejected
raw apostrophes (possessives like "tenant's") in JSX text. Production deploy
`2860aa4` failed; the error only surfaced on Vercel, not locally.

**Rule:** Before pushing `.tsx` changes that touch user-facing copy, run
`npm run build` (or at least `npm run lint`) locally — not just typecheck +
prettier. `tsc` and Prettier do **not** run ESLint; Vercel does.

**Escape convention:** In `src/app/(marketing)/` pages, escape apostrophes as
`&rsquo;` and quotes as `&ldquo;`/`&rdquo;`.

## Never write `*/` inside a CSS comment (2026-06-20)
**Mistake:** A `globals.css` comment read `migrates every rust-*/paper reference`.
The `*/` inside it closed the CSS comment early, so the trailing words parsed as
CSS and Turbopack threw `CssSyntaxError: Unknown word` — the whole stylesheet
failed and the page rendered unstyled.

**Rule:** In CSS comments, never include the `*/` sequence. Watch for it in
glob-like or path-like text (`rust-*/paper`, `a/*`, `**/*`). Rephrase ("rust and
paper", "every old token"). `tsc` does not catch this; only the dev server / build
does — so load the page after editing `.css`.

## Stage a global design-token rename behind temporary aliases (2026-06-20)
**Pattern that worked:** Renaming `@theme` tokens site-wide (rust/paper → teal/amber)
would break ~40 files at once. Instead: add the new tokens, keep the old names as
temporary aliases so every existing class still resolves and the build stays green,
migrate references in parallel (subagents partitioned by area), then delete the
aliases last and `rg` for any survivors. Old accent `rust` had to split 3 ways by
meaning: brand (accents/CTAs/links/focus), waste (€/leak figures), danger
(delete/disconnect/errors). Note `rg rust` matches `trust`/`entrust` — filter them.
