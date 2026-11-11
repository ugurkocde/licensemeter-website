# Encryption key rollout (hosted production)

Connector secrets (Microsoft bring-your-own, Adobe, Zoom, Atlassian,
Salesforce, OpenAI, Anthropic) are stored AES-256-GCM encrypted. Production
used to derive that key from `AUTH_SECRET` because `DATA_ENCRYPTION_KEY` was
not set. After this change production requires a distinct
`DATA_ENCRYPTION_KEY`, and the app's own reads accept the `AUTH_SECRET` key
only while `ENCRYPTION_LEGACY_FALLBACK=true`.

The daily retention job (`/api/cron/retention`) re-encrypts every secret
still on the `AUTH_SECRET` key, using the values the deployment already holds
(`src/server/secretMigration.ts`). Nobody has to read `DATABASE_URL` or
`AUTH_SECRET` out of Vercel. The run is one transaction with the rows locked;
before COMMIT it decrypts every stored secret again with the new key alone,
and it changes nothing if any secret decrypts with neither key. Once every
secret is current it is a no-op.

## 1. Generate the key and set it in Vercel

```sh
openssl rand -base64 48
npx vercel@65 env add DATA_ENCRYPTION_KEY production --sensitive
npx vercel@65 env add DATA_ENCRYPTION_KEY preview --sensitive
```

Store the key in your password manager. It must never equal `AUTH_SECRET`.
Preview builds also run with `NODE_ENV=production` and need a key; use a
separate one unless Preview uses the production database.

## 2. Redeploy the current production build

Redeploy the deployment that is live now. The code before this change already
writes new secrets with `DATA_ENCRYPTION_KEY` and still decrypts the old ones
with the `AUTH_SECRET` key, so nothing breaks in between.

## 3. Bridge the deploy

```sh
npx vercel@65 env add ENCRYPTION_LEGACY_FALLBACK production
```

Value `true`. It keeps the old secrets readable between the deploy and the
first retention run.

## 4. Merge, then run the retention job once

```sh
npx vercel@65 crons run /api/cron/retention
```

The response's `secrets` field lists per column how many secrets exist, how
many already use the new key (`current`), how many were re-encrypted
(`migrate`) and how many decrypt with neither key (`unreadable`, which aborts
the run). Run it again: every secret must be `current`.

## 5. Remove the bridge

```sh
npx vercel@65 env rm ENCRYPTION_LEGACY_FALLBACK production
```

Redeploy production, then start a sync in a workspace with an Adobe or SaaS
connector and check the logs for decryption errors.

## Rollback

- Build fails on `DATA_ENCRYPTION_KEY`: set the key (step 1) and redeploy.
- Decryption errors: set `ENCRYPTION_LEGACY_FALLBACK=true` and redeploy. Check
  the retention job's `secrets` result and its function log.

## Without the retention job

`scripts/reencrypt-connector-secrets.ts` runs the same migration from a
trusted machine, for installs that do not run the job or cannot wait for it.
It needs `DATABASE_URL`, `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` in the
environment (type them with `read -rs`). `--dry-run` counts and changes
nothing. It prints counts and tenant ids only, never secret values.
