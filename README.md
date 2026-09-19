# LicenseMeter

Find unused software licenses, review SaaS access, and track AI API costs in one workspace.

[Hosted app](https://www.licensemeter.com) · [Self-host with Docker](docs/self-hosting.md) · [Report a bug](https://github.com/ugurkocde/licensemeter-website/issues)

LicenseMeter is free to use. There are no subscriptions, paid tiers, or trial limits.

## Features

- Microsoft 365 findings for disabled or inactive licensed accounts, unassigned paid seats, and unused Copilot licenses.
- Estimated monthly waste using an editable price book. Configure your contract prices to make estimates meaningful.
- Connectors for Microsoft 365, Adobe, Zoom, Atlassian, Salesforce, OpenAI, and Anthropic. ChatGPT and Claude workspace membership is imported from CSV.
- OpenAI and Anthropic daily API spend, kept separate from per-seat costs.
- Findings workflows, renewal tracking, CSV/PDF exports, and multiple workspaces.
- A sample workspace and clearly labeled AI previews that need no provider keys.
- Optional hosted plans (Pro and MSP) with support, a signed data processing agreement, a read-only MCP endpoint at `/api/mcp` and white-label PDF reports. Self-hosted instances get every feature without a plan.

Connectors read provider data. LicenseMeter does not automatically remove licenses or change tenant configuration. Exported remediation scripts require separate review and execution.

## Self-host with Docker

Requirements: Docker Engine with Compose v2 or newer, or Docker Desktop. Node.js 24 is only needed on the host for the optional setup helper.

```bash
git clone https://github.com/ugurkocde/licensemeter-website.git
cd licensemeter-website
node scripts/setup-docker.mjs
docker compose --env-file .env.docker up --build -d
```

Open **http://localhost:3000** and choose **Open the sample tenant**. The helper creates unique secrets in a private, Git-ignored `.env.docker` and never overwrites an existing file. Without Node.js, copy `.env.docker.example` to `.env.docker` and replace every `__GENERATE_SECRET__` with a separate `openssl rand -hex 32` value.

The stack includes a non-root web container, persistent PostgreSQL storage, versioned migrations, and a UTC scheduler. The application uses a limited database role; PostgreSQL has no published host port.

For real tenants, configure your own Microsoft registrations, use HTTPS, and disable the public demo. Read the [self-hosting guide](docs/self-hosting.md) for authentication, backups, upgrades, proxy headers, and optional email/chat services.

## Local development

Use Node.js 24 and npm:

```bash
npm ci
cp .env.example .env
# Set AUTH_SECRET to a generated value (openssl rand -hex 32).
npm run db:push
npm run dev
```

The example enables the sample workspace. Sign-in is Microsoft Entra ID, and its app registration is not needed for the demo. Without `DATABASE_URL`, development uses an ignored PGlite database in `.pglite/`.

```bash
npm run check
npm test
npm run test:docker
npm run test:e2e
```

Browser tests isolate chat and support services. Never run tests against a production database or use production credentials for testing.

## Architecture and operations

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS.
- PostgreSQL through Drizzle. Tenant isolation is enforced in application code.
- Microsoft Entra ID sign-in with work and school accounts, the same as the hosted service. [SETUP.md](SETUP.md) describes the sign-in and connector app registrations.
- Encrypted connector credentials. Retain `DATA_ENCRYPTION_KEY` with your secured backups.
- [SECURITY.md](SECURITY.md) covers vulnerability reporting and deployment boundaries.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers validation and schema changes.

Historical billing columns remain for database compatibility. They do not grant or restrict access or activate billing.

The marketing, legal, trust, and provider-status pages describe licensemeter.com. They are not legal terms or infrastructure guarantees for self-hosted installations. Adapt them to your organization before publishing your own instance. Third-party names and logos remain the property of their owners.

## License

LicenseMeter is available under the [MIT License](LICENSE), allowing reuse, modification, distribution, and self-hosting. See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled assets.
