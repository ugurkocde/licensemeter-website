# Encryption key rollout (hosted production)

Connector secrets (Microsoft bring-your-own, Adobe, Zoom, Atlassian,
Salesforce, OpenAI, Anthropic) are stored AES-256-GCM encrypted. Production
used to derive that key from `AUTH_SECRET` because `DATA_ENCRYPTION_KEY` was
not set. After this change production requires a distinct
`DATA_ENCRYPTION_KEY`, and the `AUTH_SECRET` key is only accepted while
`ENCRYPTION_LEGACY_FALLBACK=true`.

Run the steps in this order. Merging the pull request is the last step,
because a production build without `DATA_ENCRYPTION_KEY` fails.

## Before you start

- A checkout of the branch with `npm ci` done, on a trusted machine.
- The production values of `DATABASE_URL` and `AUTH_SECRET`. Both are
  sensitive in Vercel and cannot be pulled; take them from where you keep
  them. If `AUTH_SECRET` is not available outside Vercel, see "Without
  AUTH_SECRET" below.
- Type values with `read -rs` so they stay out of shell history and the
  terminal.

## 1. Generate the key

```sh
openssl rand -base64 48
```

Store it in your password manager. It must never equal `AUTH_SECRET`.

## 2. Set it in Vercel

```sh
npx vercel@65 env add DATA_ENCRYPTION_KEY production --sensitive
npx vercel@65 env add DATA_ENCRYPTION_KEY preview --sensitive
```

Each command prompts for the value. Preview builds also run with
`NODE_ENV=production` and need a key. Use the production key for Preview only
if Preview deployments use the production database; otherwise generate a
separate one.

## 3. Redeploy the current production build

Redeploy the deployment that is live now (Vercel dashboard, Deployments, the
current production deployment, Redeploy). The code on `main` before this
change already writes new secrets with `DATA_ENCRYPTION_KEY` and still
decrypts the old ones with the `AUTH_SECRET` key, so nothing breaks in
between.

## 4. Dry run

```sh
read -rs DATABASE_URL && export DATABASE_URL
read -rs AUTH_SECRET && export AUTH_SECRET
read -rs DATA_ENCRYPTION_KEY && export DATA_ENCRYPTION_KEY
npx tsx scripts/reencrypt-connector-secrets.ts --dry-run
```

The table lists per column how many secrets exist, how many already use the
new key (`current`), how many will be re-encrypted (`migrate`) and how many
decrypt with neither key (`unreadable`). `unreadable` must be 0. The script
prints counts and tenant ids only, never secret values.

## 5. Run

```sh
npx tsx scripts/reencrypt-connector-secrets.ts
npx tsx scripts/reencrypt-connector-secrets.ts --dry-run
unset DATABASE_URL AUTH_SECRET DATA_ENCRYPTION_KEY
```

The run happens in one transaction with the rows locked. Before COMMIT it
decrypts every stored secret again with the new key alone and rolls back if
any fails. The second dry run must show every secret as `current`.

## 6. Merge and deploy the fail-fast change

Merge the pull request. After the deployment:

- The production deployment builds and starts (a missing or reused key fails
  the build, and Vercel keeps the previous deployment live).
- Start a sync in a workspace with an Adobe or SaaS connector, or wait for
  the nightly sync, and check the Vercel logs for decryption errors.

## Rollback

- Build fails on `DATA_ENCRYPTION_KEY`: set the key (step 2) and redeploy.
- Decryption errors after the merge: set `ENCRYPTION_LEGACY_FALLBACK=true` in
  Production and redeploy. The `AUTH_SECRET` key is accepted again. Rerun
  steps 4 and 5, then remove the flag and redeploy.

## Without AUTH_SECRET

If the production `AUTH_SECRET` is not available outside Vercel, skip steps 4
and 5. After step 3 the live app decrypts the old secrets and writes new ones
with `DATA_ENCRYPTION_KEY`, so an admin of each affected workspace can save
the connector credentials again on its connector page. Until every connector
has been saved again, merge only with `ENCRYPTION_LEGACY_FALLBACK=true` set in
Production, and remove the flag afterwards.
