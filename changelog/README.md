# Changelog entries

Each JSON file in `entries/` is one user-facing announcement for the central
UgurLabs changelog (https://changelog.ugurlabs.com/?product=licensemeter).
The `Changelog` GitHub workflow publishes them after they reach `main`.

File name: `YYYY-MM-DD-short-slug.json`. Fields:

| Field            | Rule                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `title`          | 3 to 160 characters, what changed for users                                        |
| `summary`        | 12 to 2000 characters, the practical benefit and any material limits               |
| `type`           | `new`, `improved`, `fixed`, or `maintenance` (metadata only, not shown in the app) |
| `publishedOn`    | `YYYY-MM-DD`, the day the change is live                                           |
| `idempotencyKey` | `licensemeter:<unique>`; keep it stable, never reuse it                            |
| `sourceUrl`      | optional public HTTPS link with more detail                                        |
| `sourceCommit`   | optional commit hash                                                               |

Rules:

- Add the entry in the same PR as the change. Only ship it when the change is
  actually available to users.
- Public copy only: no commit lists, internal paths, tenant data, addresses,
  or credentials. The API rejects those and the run fails.
- Published entries cannot be edited or deleted through this workflow. Fix a
  mistake with a new entry rather than editing the old file.
- Validate locally with `node scripts/changelog-publish.mjs --check`.
