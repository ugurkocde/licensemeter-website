---
description: "Run a dedicated LicenseMeter instance with Docker, PostgreSQL and your own credentials."
icon: server
---

# Self-hosting with Docker

This creates a new, dedicated installation. It does not copy the hosted service's data, secrets, or app registrations.

## Local sample instance

Install Docker Engine with Compose v2 or newer, or Docker Desktop. Allow about 4 GB of memory for the initial build; operational requirements depend on tenant size and count.

```bash
git clone https://github.com/ugurkocde/licensemeter-website.git
cd licensemeter-website
node scripts/setup-docker.mjs
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps
```

The helper needs Node.js 24. Without it, copy `.env.docker.example` to `.env.docker` and replace each `__GENERATE_SECRET__` with a different `openssl rand -hex 32` result. Keep database passwords hexadecimal because they are embedded in connection URLs. Restrict the file to its owner (`chmod 600 .env.docker`).

Open **http://localhost:3000** and select **Open the sample tenant**. Use `localhost` for the local browser demo. Production cookies remain Secure; their protection is not disabled to accommodate plain HTTP on a remote host.

Always specify `--env-file .env.docker`; the normal `.env` may contain unrelated development settings. The helper never overwrites an existing file. Retain its secrets through upgrades.

## Services and storage

| Service     | Responsibility                                                              |
| ----------- | --------------------------------------------------------------------------- |
| `db`        | PostgreSQL 17, stored in the `postgres_data` named volume                   |
| `migrate`   | Applies versioned SQL once with the database owner's connection, then exits |
| `web`       | Non-root Next.js server using the limited `licensemeter_app` login          |
| `scheduler` | Calls authenticated background-job routes on the internal network           |

The web service waits for successful migrations. Restarts do not run destructive schema pushes. The initial migration requires an empty dedicated database. PostgreSQL has no published port, and the web port binds to `127.0.0.1` by default. Build layers exclude secrets, Git history, private notes, and database files.

## Real Microsoft tenants

1. Put a TLS reverse proxy in front of the web service.
2. Set `APP_BASE_URL=https://licenses.example.com`, without a path.
3. Set `DEMO_MODE=false` before exposing the service to users.
4. Create your own Microsoft registrations as described in [Microsoft application setup](microsoft-setup.md).
5. Set `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `CONNECTOR_CLIENT_ID`, and `CONNECTOR_CLIENT_SECRET` in `.env.docker`.
6. Apply the changed environment with `docker compose --env-file .env.docker up -d`.
7. Sign in and open Connectors to complete consent.

Sign-in is Microsoft Entra ID and needs no other identity service. Do not reuse LicenseMeter's hosted client IDs or credentials.

### Reverse proxy

Keep the app port private. The trusted proxy must overwrite `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Real-IP`. Rate limiting uses `X-Real-IP`; forward the connecting client's address, not a header they supplied.

For Nginx on the same host, inside an existing TLS virtual host:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 600s;
    client_max_body_size 8m;
}
```

A containerized proxy should join the web service's network. Do not publish PostgreSQL. Manage TLS certificates through your usual process. Startup rejects non-local HTTP origins.

## Optional services

- Email requires your own `RESEND_API_KEY` and verified `EMAIL_FROM` sender.
- The support form requires your `SUPPORT_TO_EMAIL`. Self-hosted requests are not sent to the hosted support mailbox by default. Optionally set both Turnstile keys for your hostname.
- Crisp is disabled unless you configure your own `CRISP_WEBSITE_ID`.
- Operational alerts optionally use `ALERT_EMAIL` and/or `ALERT_WEBHOOK_URL`. Configure destinations you control.
- Vercel Analytics is not enabled by the Docker setup.

Marketing/legal content, contact details, and the external provider-status page describe licensemeter.com. Adapt them to your organization and infrastructure before presenting them as your policies. The self-hosted `robots.txt` asks crawlers to avoid the instance; this is not access control.

## Scheduled jobs

Schedules use UTC, matching `vercel.json`:

| Job                          | Schedule                  |
| ---------------------------- | ------------------------- |
| Directory and connector sync | Daily 03:00               |
| Digest email                 | Monday 06:00              |
| Monthly report               | Day 1 of the month, 07:00 |

Run one scheduler. It does not backfill missed times or retry ambiguous email requests. Restarting within a scheduled minute may invoke that job again; avoid restarting during email windows. Inspect scheduler logs after operational changes. You can replace it with an external scheduler calling the same routes with `Authorization: Bearer <CRON_SECRET>`; disable the bundled service to avoid duplicate scheduling.

## Backups

Back up PostgreSQL and `.env.docker`, especially `DATA_ENCRYPTION_KEY`. Without the original key, restored connector credentials cannot be decrypted. Changing environment passwords alone does not rotate passwords in an existing PostgreSQL volume.

```bash
mkdir -p backups
chmod 700 backups
docker compose --env-file .env.docker exec -T db \
  pg_dump -U postgres -d licensemeter -Fc > backups/licensemeter.dump
chmod 600 backups/licensemeter.dump
```

Store backups outside Git and test restoration in an isolated installation. Use `pg_restore` against a dedicated empty database and restore the matching environment keys before starting the app. Retention and backup access controls are the operator's responsibility.

`docker compose down` preserves data. **`docker compose down -v` permanently deletes the database volume.** Do not use `-v` for routine upgrades or troubleshooting.

## Upgrade

Read the changes, take a verified database/environment backup, then:

```bash
docker compose --env-file .env.docker stop web scheduler
git pull --ff-only
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d --wait
```

Migrations run before the web service. If one fails, inspect its logs before retrying. Do not bypass the dependency check or run `drizzle-kit push --force` on your data. Rollback can require restoring the matching database backup, not merely an older image.

## Troubleshooting

| Symptom                 | Check                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| Web waits for migration | Inspect `docker compose --env-file .env.docker logs migrate`               |
| Login does not persist  | Local demo: use localhost. Remote instance: verify HTTPS and proxy headers |
| No real sign-in button  | Configure both Microsoft sign-in variables and recreate web                |
| Wrong consent redirect  | Correct `APP_BASE_URL` and registered redirect URIs                        |
| Support unavailable     | Set your destination mailbox, sender, and matching Turnstile keys          |
| Shared rate limits      | Make the trusted proxy overwrite `X-Real-IP`                               |
| Stale data              | Check scheduler logs and `/api/health`                                     |

Start with `docker compose --env-file .env.docker logs --tail 100 web migrate scheduler`. Redact tenant data and credentials before sharing logs.

References: [Next.js self-hosting](https://nextjs.org/docs/15/app/guides/self-hosting), [standalone output](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output), [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
