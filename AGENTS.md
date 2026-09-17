# Agent notes

## Product changelog

User-facing updates are published to the central Ugurlabs changelog. The
product configuration lives in `.ugurlabs/changelog.json` (product
`licensemeter`, `publishMode: "on-completion"`).

- When a change is user-facing, add an entry file under `changelog/entries/`
  in the same PR (format in `changelog/README.md`) and validate it with
  `node scripts/changelog-publish.mjs --check`. The global `publish-changelog`
  skill describes how to write the copy.
- The `Changelog` GitHub workflow publishes entries after they land on `main`,
  using the `CHANGELOG_PUBLISH_TOKEN` repository secret. Do not publish the
  same update manually with a different key, and never commit the token or
  expose it to browser code.
- Published entries cannot be edited or deleted; add a new entry instead.
- The navigation bell (`src/components/changelog/`) reads the public feed for
  this product without credentials. Keep it free of change-type labels.
